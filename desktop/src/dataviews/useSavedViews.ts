/**
 * A table's saved views (its Lists), kept in the core so Alpha can make one when asked and they
 * survive another window. Lists saved by the older page in this window's storage are moved into
 * the core the first time the table opens, then forgotten here.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Client, SavedView } from "../core/client";
import type { FieldInfo } from "../modules/fields";
import type { RowFilter, ViewConfig } from "./engine";

/** What the older page saved per list. */
interface LegacyList {
  title: string;
  filters?: Record<string, string>;
  search?: string;
  hideDone?: boolean;
  hidden?: string[];
}

export function legacyToConfig(list: LegacyList, fields: FieldInfo[]): Partial<ViewConfig> & { search?: string } {
  const rowFilters: RowFilter[] = Object.entries(list.filters ?? {})
    .filter(([, v]) => v)
    .map(([field, value]) => ({ field, op: "is", value }));
  const status = fields.find((f) => f.kind === "status");
  if (list.hideDone && status?.done_choices?.length) rowFilters.push({ field: status.name, op: "is_none_of", value: status.done_choices.join(", ") });
  return { kind: "table", rowFilters, filterMatch: "all", sorts: [], groupBy: null, hidden: list.hidden ?? [], ...(list.search ? { search: list.search } : {}) };
}

export const legacyKey = (table: string) => `alpha.page.${table}.lists`;

export function useSavedViews(client: Client, table: string, fields: FieldInfo[], initial: SavedView[] | null) {
  const [views, setViews] = useState<SavedView[]>(initial ?? []);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (initial) setViews(initial);
  }, [initial]);

  const migrated = useRef(false);
  useEffect(() => {
    if (migrated.current || initial === null) return;
    migrated.current = true;
    let legacy: LegacyList[] = [];
    try {
      legacy = JSON.parse(localStorage.getItem(legacyKey(table)) ?? "[]") as LegacyList[];
    } catch {
      legacy = [];
    }
    if (!legacy.length) return;
    void (async () => {
      const added: SavedView[] = [];
      for (const list of legacy) {
        if (!list.title || initial.some((v) => v.title === list.title)) continue;
        try {
          added.push(await client.saveView(table, list.title, legacyToConfig(list, fields)));
        } catch {
          /* a list that no longer fits the table is dropped, not retried forever */
        }
      }
      try {
        localStorage.removeItem(legacyKey(table));
      } catch {
        /* nothing to forget */
      }
      if (added.length) setViews((v) => [...v, ...added]);
    })();
  }, [client, table, fields, initial]);

  const run = useCallback(async <T>(work: () => Promise<T>): Promise<T | null> => {
    setError(null);
    try {
      return await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const save = (title: string, config: object) =>
    run(async () => {
      const view = await client.saveView(table, title, config);
      setViews((v) => [...v, view]);
      return view;
    });
  const update = (id: string, patch: { title?: string; config?: object; is_default?: boolean }) =>
    run(async () => {
      const view = await client.updateView(id, patch);
      setViews((v) => v.map((x) => (x.id === id ? view : patch.is_default ? { ...x, is_default: false } : x)));
      return view;
    });
  const remove = (id: string) =>
    run(async () => {
      await client.deleteView(id);
      setViews((v) => v.filter((x) => x.id !== id));
      return id;
    });
  return { views, error, setError, save, update, remove };
}
