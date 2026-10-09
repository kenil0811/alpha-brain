/**
 * The person's choices about their own world that the window keeps for them (the UI rulebook,
 * 9 Oct): the workspace's name, the order, icons and hiding of modules, pinned records, footer
 * summaries, dashboards and the sections a record page shows. They live in the world through the
 * core's existing preference route, so every window sees the same; the layout of one window
 * (widths, what is folded) stays in localStorage. Every reader of a key in this window hears a
 * change at once; another window sees it when it next reads.
 */
import { useCallback, useEffect, useState } from "react";
import type { Client } from "./client";

/** The keys, one per kind of choice (the core takes letters, digits and underscores). */
export const PREF = {
  workspaceName: "workspace_name",
  moduleOrder: "module_order",
  moduleIcons: "module_icons",
  hiddenModules: "hidden_modules",
  pinnedRecords: "pinned_records",
  footerSummaries: "footer_summaries",
  dashboards: "dashboards",
  recordSections: "record_sections",
  companionLook: "companion_look",
  workspaceLogo: "workspace_logo",
  /** Per module: { always: string[]; never: string[] } — saved only; the runtime does not read them yet. */
  governance: "governance_rules",
  /** Per agent id: a companion Look; an agent without one wears the companion's. */
  agentLooks: "agent_looks",
  /** Saved lists for data the core keeps no lists for (agents, skills, automations…), per source key. */
  windowLists: "window_lists",
} as const;
export type PrefKey = (typeof PREF)[keyof typeof PREF];

const cache = new Map<string, unknown>();
/** How many times this window has written a key: a read that began before a write is stale. */
const writes = new Map<string, number>();
const listeners = new Map<string, Set<(value: unknown) => void>>();

function announce(key: string, value: unknown) {
  cache.set(key, value);
  for (const hear of listeners.get(key) ?? []) hear(value);
}

/** Forget what this window has seen (the tests; a later sign-out). Readers keep what they show
 *  until the next change or read. */
export function forgetPreferences() {
  cache.clear();
  writes.clear();
}

/** A preference and a way to change it. Until the core answers, the last value this window saw,
 *  else `fallback`. A failed write keeps the old value and returns the problem. */
export function usePreference<T>(client: Client | null, key: PrefKey, fallback: T): [T, (next: T) => Promise<string | null>] {
  const [value, setValue] = useState<T>(() => (cache.has(key) ? (cache.get(key) as T) : fallback));
  useEffect(() => {
    const hear = (v: unknown) => setValue((v ?? fallback) as T);
    const set = listeners.get(key) ?? new Set();
    set.add(hear);
    listeners.set(key, set);
    return () => {
      set.delete(hear);
    };
    // the fallback is a default, not a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (!client) return;
    let live = true;
    const seen = writes.get(key) ?? 0;
    client
      .preference(key)
      .then((r) => {
        // a write made while this read was on its way is newer than what it brings
        if (live && (writes.get(key) ?? 0) === seen) announce(key, r.value ?? fallback);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);
  const change = useCallback(
    async (next: T): Promise<string | null> => {
      if (!client) return "Alpha's core isn't running.";
      const before = cache.has(key) ? cache.get(key) : fallback;
      writes.set(key, (writes.get(key) ?? 0) + 1);
      announce(key, next);
      try {
        await client.setPreference(key, next);
        return null;
      } catch (e) {
        writes.set(key, (writes.get(key) ?? 0) + 1);
        announce(key, before);
        return e instanceof Error ? e.message : String(e);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, key],
  );
  return [value, change];
}
