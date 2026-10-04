/**
 * A table's saved views (its Lists), kept in this window's storage. One may be starred as the
 * list the table opens on.
 *
 * ponytail: per-device storage; they move into the core (and survive another Mac) once it has
 * a views API (docs/development/backend-requests.md).
 */
import { useState } from "react";

export interface SavedView {
  id: string;
  title: string;
  config: Record<string, unknown>;
  is_default: boolean;
}

export const listsKey = (table: string) => `alpha.dv.${table}.lists`;

function readLists(table: string): SavedView[] {
  try {
    const raw = localStorage.getItem(listsKey(table));
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function useSavedViews(table: string) {
  const [views, setViews] = useState<SavedView[]>(() => readLists(table));
  const commit = (next: SavedView[]) => {
    setViews(next);
    try {
      localStorage.setItem(listsKey(table), JSON.stringify(next));
    } catch {
      /* the lists last this session */
    }
  };

  const save = async (title: string, config: object): Promise<SavedView> => {
    const view: SavedView = { id: `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, title, config: config as Record<string, unknown>, is_default: false };
    commit([...views, view]);
    return view;
  };
  const update = async (id: string, patch: { title?: string; config?: object; is_default?: boolean }): Promise<SavedView | null> => {
    const found = views.find((v) => v.id === id);
    if (!found) return null;
    const view: SavedView = { ...found, ...patch, config: (patch.config as Record<string, unknown> | undefined) ?? found.config };
    // One starred list per table.
    commit(views.map((v) => (v.id === id ? view : patch.is_default ? { ...v, is_default: false } : v)));
    return view;
  };
  const remove = async (id: string) => {
    commit(views.filter((v) => v.id !== id));
    return id;
  };
  return { views, save, update, remove };
}
