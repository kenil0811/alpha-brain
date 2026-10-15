/**
 * Agents (Q44, Q50): each as its name and the sentence the person reads, what it is for, when
 * it works next, its last run's verdict, how its last run went, Pause / Set going and Run now.
 */
import { useState } from "react";
import type { Agent, Client } from "../core/client";
import { when } from "../modules/format";
import { Button } from "../ui";
import { Check, X } from "../ui/icons";
import { say } from "../core/client";

export const VERDICT: Record<"succeeded" | "partial" | "failed", { cls: string; words: string }> = {
  succeeded: { cls: "badge--succeeded", words: "Succeeded" },
  partial: { cls: "badge--waiting", words: "Partial" },
  failed: { cls: "badge--failed", words: "Failed" },
};

/** The words for an agent's write list ("What it may touch"), one per kind of thing. */
export const MAY_WORDS: Record<string, string> = {
  records: "rows in its module's tables",
  notes: "pages and notes",
  facts: "facts about people and companies",
  goals: "goals",
  asks: "questions to you",
  proposals: "proposals for your yes",
  instructions: "your standing instructions",
  skills: "readers and procedures",
  agents: "its own settings",
  modules: "modules",
  threads: "its own threads",
  files: "files",
  workflows: "workflow pages",
  actions: "actions",
  connections: "connections",
};

export function mayWords(may: string[]): string {
  const words = may.map((m) => MAY_WORDS[m] ?? m);
  if (!words.length) return "nothing: it only reads";
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function AgentList({ client, items, onChanged, empty, onOpen }: { client: Client; items: Agent[]; onChanged: () => void; empty: string; onOpen?: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // While one runs its steps arrive through the window's one poll (core/changes.ts), which
  // asks every 3 s while anything works; no clock here.
  async function act(id: string, work: () => Promise<unknown>, words: string) {
    setBusy(id);
    setMessage(null);
    try {
      await work();
      setMessage(words);
      onChanged();
    } catch (e) {
      setMessage(say(e));
    } finally {
      setBusy(null);
    }
  }
  if (!items.length) {
    return (
      <div className="card">
        <p className="empty">{empty}</p>
      </div>
    );
  }
  return (
    <>
      <div className="card list">
        {items.map((a) => (
          <div key={a.id} className="item item--top">
            <button type="button" className={`switch${a.on ? "" : " switch--off"}`} role="switch" aria-checked={a.on} aria-label={a.on ? `Pause: ${a.name}` : `Set going: ${a.name}`} disabled={busy === a.id} onClick={() => void act(a.id, () => client.changeAgent(a.id, { state: a.on ? "paused" : "on" }), a.on ? "Paused." : "Going.")} />
            <div className="item__body">
              {onOpen ? (
                <button type="button" className="linkbtn" onClick={() => onOpen(a.id)}>
                  {a.name}
                </button>
              ) : (
                a.name
              )}
              {a.description !== a.name ? <div className="muted">{a.description}</div> : null}
              {a.goal ? <div className="faint">{a.goal}</div> : null}
              <div className="item__sub">
                {a.on ? `${a.when}${a.next_run_at ? ` · next ${when(a.next_run_at)}` : ""}` : `Paused · ${a.when} when going`}
                {a.last_run_at ? ` · last ran ${when(a.last_run_at)}` : " · hasn't run on its own yet"}
              </div>
              {a.last_verdict ? (
                <div className="row" style={{ marginTop: 4, gap: 8 }}>
                  <span className={`badge ${VERDICT[a.last_verdict].cls}`}>{VERDICT[a.last_verdict].words}</span>
                  {a.last_why ? <span className="faint">{a.last_why}</span> : null}
                </div>
              ) : null}
              {a.running ? (
                <div className="run__live" role="status">
                  <span className="badge badge--running">Running now</span>
                  {a.steps?.length ? (
                    <ul className="stages">
                      {a.steps.map((s, i) => (
                        <li key={`${s.at}-${i}`} className={s.kind === "failed" ? "notice" : "stages__done"}>
                          {s.kind === "failed" ? <X size={12} aria-label="failed" /> : <Check size={12} aria-label="done" />} {s.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="faint"> Starting…</span>
                  )}
                </div>
              ) : a.last_error && !a.last_verdict ? (
                <div className="notice" style={{ fontSize: "var(--text-sm)" }}>Last run didn't work: {a.last_error}</div>
              ) : null}
            </div>
            <Button size="sm" disabled={busy === a.id || a.running} onClick={() => void act(a.id, () => client.runAgent(a.id), "Started. Its steps show here as it goes.")}>
              {a.running ? "Running…" : "Run now"}
            </Button>
          </div>
        ))}
      </div>
      {message ? (
        <p className="notice notice--quiet" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
