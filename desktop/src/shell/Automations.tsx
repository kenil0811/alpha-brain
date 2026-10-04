/**
 * What runs on its own: each automation as the sentence the person reads, when it runs next,
 * how its last run went, an on/off switch and Run now.
 */
import { useEffect, useState } from "react";
import type { Automation, Client, ModuleCard } from "../core/client";
import { when } from "../modules/format";
import { ModuleIcon } from "../ui/ModuleIcon";
import { projectIcon } from "./projectIcons";
import "../dataviews/dataviews.css";
import { Button } from "../ui";
import { Check, X } from "../ui/icons";

export function AutomationList({ client, items, onChanged, empty, onOpen }: { client: Client; items: Automation[]; onChanged: () => void; empty: string; onOpen?: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // While one runs, look again every few seconds so its steps and result show up here.
  const running = items.some((a) => a.running);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(onChanged, 4000);
    return () => clearInterval(timer);
  }, [running, onChanged]);
  async function act(id: string, work: () => Promise<unknown>, words: string) {
    setBusy(id);
    setMessage(null);
    try {
      await work();
      setMessage(words);
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
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
            <button type="button" className={`switch${a.enabled ? "" : " switch--off"}`} role="switch" aria-checked={a.enabled} aria-label={a.enabled ? `Switch off: ${a.title}` : `Switch on: ${a.title}`} disabled={busy === a.id} onClick={() => void act(a.id, () => client.switchAutomation(a.id, !a.enabled), a.enabled ? "Switched off." : "Switched on.")} />
            <div className="item__body">
              {onOpen ? (
                <button type="button" className="linkbtn" onClick={() => onOpen(a.id)}>
                  {a.title}
                </button>
              ) : (
                a.title
              )}
              <div className="item__sub">
                {a.enabled ? `${a.when}${a.next_run_at ? ` · next ${when(a.next_run_at)}` : ""}` : `Off · ${a.when} when on`}
                {a.last_run_at ? ` · last ran ${when(a.last_run_at)}` : " · hasn't run on its own yet"}
              </div>
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
              ) : a.last_error ? (
                <div className="notice notice--sm">Last run didn't work: {a.last_error}</div>
              ) : null}
            </div>
            <Button size="sm" disabled={busy === a.id || a.running} onClick={() => void act(a.id, () => client.runAutomation(a.id), "Started. Its steps show here as it goes.")}>
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

/** Intelligence › Automations (Alpha's): every schedule across the projects as one table. */
export function AutomationTable({ client, items, modules, onOpenModule, onChanged }: { client: Client; items: Automation[]; modules: ModuleCard[]; onOpenModule: (id: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return <p className="empty">Nothing runs on its own yet.</p>;
  return (
    <div className="card tablewrap">
      <table className="table table--wrap" aria-label="Automations">
        <thead>
          <tr>
            <th>Project</th>
            <th>What</th>
            <th>When</th>
            <th>Last ran</th>
            <th>On</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => {
            const m = modules.find((x) => x.id === a.module);
            return (
              <tr key={a.id}>
                <td>
                  {m ? (
                    <button type="button" className="linklike" onClick={() => onOpenModule(m.id)}>
                      <ModuleIcon icon={projectIcon(m)} /> {m.name}
                    </button>
                  ) : (
                    <span className="faint">No project</span>
                  )}
                </td>
                <td title={a.title}>{a.title}</td>
                <td>{a.when}</td>
                <td className={a.last_error ? "notice" : undefined} title={a.last_error ?? undefined}>
                  {a.running ? "Running now" : a.last_error ? "Failed last time" : a.last_run_at ? new Date(a.last_run_at).toLocaleString() : "Not yet"}
                </td>
                <td>
                  <button
                    type="button"
                    className={`switch${a.enabled ? "" : " switch--off"}`}
                    role="switch"
                    aria-checked={a.enabled}
                    aria-label={`${a.title} on`}
                    disabled={busy === a.id}
                    onClick={() => {
                      setBusy(a.id);
                      void client
                        .switchAutomation(a.id, !a.enabled)
                        .catch(() => undefined)
                        .finally(() => {
                          setBusy(null);
                          onChanged();
                        });
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
