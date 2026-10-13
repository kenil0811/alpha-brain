import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PROJECTS } from "../projects/registry";
import { ACTIVITY, PROPOSALS } from "./home";
import type { Activity, Collection, Project, Proposal, Rec, Role, Value } from "./types";

/** The demo's world: everything in memory, reset on reload, so every demo starts the same.
 *  ponytail: in-memory only; the real platform writes through the system of record's API. */

export { TODAY } from "./format";

interface Edit { at: string; who: string; field: string; from: Value; to: Value }

interface World {
  records: Record<string, Rec[]>;
  proposals: Proposal[];
  activity: Activity[];
  history: Record<string, Edit[]>;
  role: Role;
}

interface Api extends World {
  rows: (project: string, collection: string) => Rec[];
  setField: (project: string, collection: string, id: string, field: string, value: Value) => void;
  addRecord: (project: string, collection: string, seed?: Partial<Rec>) => string;
  removeRecords: (project: string, collection: string, ids: string[]) => void;
  decide: (id: string, yes: boolean) => void;
  setRole: (r: Role) => void;
  reset: () => void;
}

const key = (p: string, c: string) => `${p}/${c}`;

function initial(): World {
  const records: Record<string, Rec[]> = {};
  for (const p of PROJECTS) for (const c of p.collections) records[key(p.id, c.id)] = c.records.map((r) => ({ ...r }));
  return { records, proposals: PROPOSALS.map((p) => ({ ...p })), activity: [...ACTIVITY], history: {}, role: "assistant" };
}

const Ctx = createContext<Api | null>(null);

export function WorldProvider({ children }: { children: ReactNode }) {
  const [w, setW] = useState<World>(initial);

  const rows = useCallback((p: string, c: string) => w.records[key(p, c)] ?? [], [w.records]);

  const stamp = () => {
    const d = new Date();
    return `12 Oct, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const setField = useCallback((p: string, c: string, id: string, field: string, value: Value) => {
    setW((s) => {
      const list = s.records[key(p, c)] ?? [];
      const old = list.find((r) => r.id === id);
      if (!old || old[field] === value) return s;
      const edit: Edit = { at: stamp(), who: "You", field, from: (old[field] as Value) ?? null, to: value };
      return {
        ...s,
        records: { ...s.records, [key(p, c)]: list.map((r) => (r.id === id ? { ...r, [field]: value } : r)) },
        history: { ...s.history, [id]: [edit, ...(s.history[id] ?? [])] },
      };
    });
  }, []);

  const addRecord = useCallback((p: string, c: string, seed: Partial<Rec> = {}) => {
    const id = `new-${Math.random().toString(36).slice(2, 8)}`;
    setW((s) => ({ ...s, records: { ...s.records, [key(p, c)]: [...(s.records[key(p, c)] ?? []), { id, ...seed } as Rec] } }));
    return id;
  }, []);

  const removeRecords = useCallback((p: string, c: string, ids: string[]) => {
    setW((s) => ({ ...s, records: { ...s.records, [key(p, c)]: (s.records[key(p, c)] ?? []).filter((r) => !ids.includes(r.id)) } }));
  }, []);

  const decide = useCallback((id: string, yes: boolean) => {
    setW((s) => {
      const pr = s.proposals.find((x) => x.id === id);
      if (!pr || pr.state !== "open") return s;
      const entry: Activity = { id: `a-${id}`, when: stamp(), who: "You", what: `${yes ? "Approved" : "Declined"}: ${pr.task}`, link: pr.recordLink };
      return { ...s, proposals: s.proposals.map((x) => (x.id === id ? { ...x, state: yes ? "approved" : "declined" } : x)), activity: [entry, ...s.activity] };
    });
  }, []);

  const setRole = useCallback((role: Role) => setW((s) => ({ ...s, role })), []);
  const reset = useCallback(() => setW(initial()), []);

  const api = useMemo<Api>(() => ({ ...w, rows, setField, addRecord, removeRecords, decide, setRole, reset }), [w, rows, setField, addRecord, removeRecords, decide, setRole, reset]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useWorld(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorld outside WorldProvider");
  return v;
}

export function findProject(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id);
}

export function findCollection(p: string, c: string): Collection | undefined {
  return findProject(p)?.collections.find((x) => x.id === c);
}

export const ROLE_LABEL: Record<Role, string> = {
  assistant: "Legal assistant",
  attorney: "Attorney",
  owner: "Owner",
  intake: "Intake",
  finance: "Finance",
};

export const ROLE_PERSON: Record<Role, string> = {
  assistant: "Maria Alvarez",
  attorney: "Daniel Brooks",
  owner: "Jordan Hale",
  intake: "Priya Shah",
  finance: "Karen Liu",
};
