/**
 * What runs on its own: each automation as the sentence the person reads, when it runs next,
 * how its last run went, an on/off switch and Run now.
 */
import { useState } from "react";
import type { Automation, Client } from "../core/client";
import { when } from "../modules/format";

export function AutomationList({ client, items, onChanged, empty }: { client: Client; items: Automation[]; onChanged: () => void; empty: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
              {a.title}
              <div className="item__sub">
                {a.enabled ? `${a.when}${a.next_run_at ? ` · next ${when(a.next_run_at)}` : ""}` : `Off · ${a.when} when on`}
                {a.last_run_at ? ` · last ran ${when(a.last_run_at)}` : " · hasn't run on its own yet"}
              </div>
              {a.last_error ? <div className="notice" style={{ fontSize: 12 }}>Last run didn't work: {a.last_error}</div> : a.last_result ? <div className="item__sub">{a.last_result}</div> : null}
            </div>
            <button type="button" className="btn btn--sm" disabled={busy === a.id} onClick={() => void act(a.id, () => client.runAutomation(a.id), "Running now; the result shows here when it's done.")}>
              Run now
            </button>
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
