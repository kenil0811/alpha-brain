/**
 * What changed, asked once: the window polls `/api/changes` (every 3 s while Alpha works, every
 * 15 s when it is quiet, never while the window is hidden) and turns the answer into versions
 * per scope, so each page refetches only when something it shows moved. Before 3 Oct every page
 * refetched on a global counter bumped every 5 s during a turn, and kept polling when hidden.
 * The same poll is the window's view of whether the core answers at all.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Changed, Client } from "./client";

export interface Versions {
  /** Bumped with everything: the person did something, or the core came back. */
  all: number;
  home: number;
  people: number;
  intelligence: number;
  activity: number;
  conversation: number;
  tables: Record<string, number>;
  modules: Record<string, number>;
}

export const FRESH: Versions = { all: 0, home: 0, people: 0, intelligence: 0, activity: 0, conversation: 0, tables: {}, modules: {} };

const KNOW_HOW = new Set(["made", "changed", "failed", "did"]);

export function bumpAll(v: Versions): Versions {
  const n = v.all + 1;
  const tables = Object.fromEntries(Object.entries(v.tables).map(([k, x]) => [k, x + 1]));
  const modules = Object.fromEntries(Object.entries(v.modules).map(([k, x]) => [k, x + 1]));
  return { all: n, home: v.home + 1, people: v.people + 1, intelligence: v.intelligence + 1, activity: v.activity + 1, conversation: v.conversation + 1, tables, modules };
}

/** The versions after a change report: only the scopes it touched move. */
export function fold(v: Versions, c: Changed, moduleOf: (table: string) => string | null | undefined): Versions {
  const any = c.journal > 0 || c.threads || c.plans || c.actions;
  if (!any) return v;
  const tables = { ...v.tables };
  const modules = { ...v.modules };
  for (const t of c.tables) {
    tables[t] = (tables[t] ?? 0) + 1;
    const m = moduleOf(t);
    if (m) modules[m] = (modules[m] ?? 0) + 1;
  }
  for (const m of c.modules) modules[m] = (modules[m] ?? 0) + 1;
  const knowHow = c.kinds.some((k) => KNOW_HOW.has(k));
  return {
    all: v.all,
    home: v.home + 1,
    people: v.people + (c.entities.length || c.kinds.includes("noticed") ? 1 : 0),
    intelligence: v.intelligence + (knowHow ? 1 : 0),
    activity: v.activity + (c.journal > 0 ? 1 : 0),
    conversation: v.conversation + 1,
    tables,
    modules,
  };
}

/** Whether this window is on screen; a hidden window asks the core nothing. */
export function useVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

export const WORKING_EVERY_MS = 3000;
export const QUIET_EVERY_MS = 15000;
export const DOWN_EVERY_MS = 4000;
/** Missed polls before the window says the core isn't answering. */
export const MISSES_BEFORE_DOWN = 3;

export function useChanges(client: Client | null, moduleOf: (table: string) => string | null | undefined, options: { workingEveryMs?: number; quietEveryMs?: number } = {}) {
  const [versions, setVersions] = useState<Versions>(FRESH);
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const [down, setDown] = useState<string | null>(null);
  const since = useRef<string | null>(null);
  const misses = useRef(0);
  const wasDown = useRef(false);
  const visible = useVisible();
  const moduleOfRef = useRef(moduleOf);
  moduleOfRef.current = moduleOf;

  const bump = useCallback(() => setVersions(bumpAll), []);

  const poll = useCallback(async () => {
    if (!client) return;
    try {
      const c = await client.changes(since.current);
      since.current = c.at;
      misses.current = 0;
      workingRef.current = c.working;
      setWorking(c.working);
      if (wasDown.current) {
        wasDown.current = false;
        setDown(null);
        setVersions(bumpAll);
      } else {
        setVersions((v) => fold(v, c, moduleOfRef.current));
      }
    } catch (e) {
      misses.current += 1;
      if (misses.current >= MISSES_BEFORE_DOWN) {
        wasDown.current = true;
        setDown(e instanceof Error ? e.message : String(e));
      }
    }
  }, [client]);

  // One loop while the window is visible; the pace is read each tick, so a change of pace
  // never starts a second loop or an extra request.
  const workingEvery = options.workingEveryMs ?? WORKING_EVERY_MS;
  const quietEvery = options.quietEveryMs ?? QUIET_EVERY_MS;
  useEffect(() => {
    if (!client || !visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      await poll();
      if (cancelled) return;
      const every = wasDown.current ? DOWN_EVERY_MS : workingRef.current ? workingEvery : quietEvery;
      timer = setTimeout(() => void tick(), every);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, visible, poll, workingEvery, quietEvery]);

  return { versions, working, down, bump, poll };
}
