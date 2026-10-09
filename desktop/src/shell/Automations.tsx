/**
 * Agents (Q33): each automation is an agent's process, as the sentence the person reads, what
 * it is for, when it runs next, its last run's verdict, an on/off switch and Run now. One row
 * layout (icon, title, one-line description, controls on the right) shared with Skills and
 * Connections (the UI rulebook §12). `bare` drops the card, for a list already in a section card.
 */
import { useState } from "react";
import type { Automation, Client } from "../core/client";
import { when } from "../modules/format";
import { Badge, Button, EmptyCard, ListRow, Notice } from "../ui";
import { Check, ICON, ICON_SM, X, Zap } from "../ui/icons";

/** A run's verdict, judged by code (Q33), as one of the five chip tones. */
export const VERDICT: Record<"succeeded" | "partial" | "failed", { tone: "good" | "warn" | "bad"; words: string }> = {
  succeeded: { tone: "good", words: "Succeeded" },
  partial: { tone: "warn", words: "Partial" },
  failed: { tone: "bad", words: "Failed" },
};

export function AutomationList({ client, items, onChanged, empty, onOpen, bare }: { client: Client; items: Automation[]; onChanged: () => void; empty: string; onOpen?: (id: string) => void; bare?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // While one runs its steps arrive through the window's one poll (core/changes.ts), which
  // asks every 3 s while anything works; no clock here.
  async function act(id: string, work: () => Promise<unknown>, words: string) {
    setBusy(id);
    setMessage(null);
    try {
      await work();
      setMessage({ ok: true, text: words });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  if (!items.length) {
    return (
      <EmptyCard icon={<Zap size={ICON} />} title="No agents yet">
        {empty || undefined}
      </EmptyCard>
    );
  }
  return (
    <>
      <div className={bare ? "lrows" : "card lrows"}>
        {items.map((a) => (
          <ListRow
            key={a.id}
            icon={<Zap size={ICON} />}
            title={a.title}
            onOpen={onOpen ? () => onOpen(a.id) : undefined}
            description={
              <>
                {a.goal ? `${a.goal} · ` : ""}
                {a.enabled ? `${a.when}${a.next_run_at ? ` · next ${when(a.next_run_at)}` : ""}` : `Off · ${a.when}`}
                {a.last_run_at ? ` · last ran ${when(a.last_run_at)}` : ""}
              </>
            }
            controls={
              <>
                <Button size="sm" disabled={busy === a.id || a.running} onClick={() => void act(a.id, () => client.runAutomation(a.id), "Started.")}>
                  {a.running ? "Running…" : "Run now"}
                </Button>
                <button type="button" className={`switch${a.enabled ? "" : " switch--off"}`} role="switch" aria-checked={a.enabled} aria-label={a.enabled ? `Switch off: ${a.title}` : `Switch on: ${a.title}`} disabled={busy === a.id} onClick={() => void act(a.id, () => client.switchAutomation(a.id, !a.enabled), a.enabled ? "Switched off." : "Switched on.")} />
              </>
            }
          >
            {a.running ? (
              <div className="run__live" role="status">
                <Badge tone="info">Running now</Badge>
                {a.steps?.length ? (
                  <ul className="stages">
                    {a.steps.map((s, i) => (
                      <li key={`${s.at}-${i}`} className={s.kind === "failed" ? "notice" : "stages__done"}>
                        {s.kind === "failed" ? <X size={ICON_SM} aria-label="failed" /> : <Check size={ICON_SM} aria-label="done" />} {s.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="faint"> Starting…</span>
                )}
              </div>
            ) : a.last_verdict ? (
              <span className="row" style={{ gap: "var(--space-2)" }}>
                <Badge tone={VERDICT[a.last_verdict].tone}>{VERDICT[a.last_verdict].words}</Badge>
                {a.last_why ? <span className="faint">{a.last_why}</span> : null}
              </span>
            ) : a.last_error ? (
              <Notice tone="bad">Last run didn't work: {a.last_error}</Notice>
            ) : null}
          </ListRow>
        ))}
      </div>
      {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
    </>
  );
}
