/**
 * The person's choices of look kept in the world (`/api/preferences/<key>`), shared across the
 * window: one value per key, read once and handed to every component that shows it, so a change
 * made in one place (the sidebar's icon for a module) shows everywhere at once (Home's card, the
 * module's page). A change shows at once and is saved; if the save fails the old value comes
 * back and the caller gets the reason in words. (13 Oct, Q42 section 5.)
 */
import { useEffect, useState } from "react";
import type { Client } from "./client";

/** The keys the window keeps. */
export const PREF = {
  sidebarOrder: "sidebar_order",
  sidebarHidden: "sidebar_hidden",
  moduleIcons: "module_icons",
  workspaceName: "workspace_name",
} as const;

const values = new Map<string, unknown>();
const loading = new Map<string, Promise<void>>();
const listeners = new Map<string, Set<() => void>>();

function tell(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function load(client: Client, key: string) {
  if (values.has(key) || loading.has(key)) return;
  loading.set(
    key,
    Promise.resolve()
      .then(() => client.preference(key))
      .then((r) => {
        if (!values.has(key)) values.set(key, r.value ?? null);
      })
      .catch(() => undefined) // not kept yet, or the core is away: the default shows
      .finally(() => {
        loading.delete(key);
        tell(key);
      }),
  );
}

/** Forget every kept value (tests start from nothing). */
export function forgetPreferences() {
  values.clear();
  loading.clear();
}

/** The value kept under `key` (or `fallback` until it is read, or when there is none) and a
 *  setter that saves it, resolving to null or to why it couldn't be saved. */
export function usePreference<T>(client: Client | null, key: string, fallback: T): [T, (next: T) => Promise<string | null>] {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    let set = listeners.get(key);
    if (!set) listeners.set(key, (set = new Set()));
    set.add(l);
    if (client) load(client, key);
    return () => {
      set.delete(l);
    };
  }, [client, key]);
  const kept = values.get(key);
  const value = (kept === undefined || kept === null ? fallback : kept) as T;
  const save = async (next: T): Promise<string | null> => {
    if (!client) return "Alpha's core isn't connected yet.";
    const before = values.get(key);
    values.set(key, next);
    tell(key);
    try {
      await client.setPreference(key, next);
      return null;
    } catch (e) {
      values.set(key, before);
      tell(key);
      return e instanceof Error ? e.message : String(e);
    }
  };
  return [value, save];
}
