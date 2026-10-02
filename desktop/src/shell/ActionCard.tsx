/**
 * An outward action Alpha proposed (a draft, a message, something to send): the exact text
 * that would be typed, a screenshot of the dry run, what cannot be undone, and the decision.
 * Nothing leaves until the person says yes here or in words.
 */
import { useEffect, useState } from "react";
import type { Action, Client } from "../core/client";
import { when } from "../modules/format";

const EFFECT: Record<string, string> = {
  prepare: "Stays in your account; reaches nobody",
  send: "Reaches someone: it asks every time",
};

export function ActionCard({ action, client, onDecided, compact }: { action: Action; client: Client; onDecided: (note: string) => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(action.payload);
  const [shot, setShot] = useState<string | null>(null);
  const previewName = action.state === "proposed" ? action.preview : action.shots.after ?? action.shots.preview ?? action.shots.error ?? null;

  useEffect(() => {
    let url: string | null = null;
    if (!previewName) {
      setShot(null);
      return;
    }
    client
      .actionShot(action.id, previewName)
      .then((u) => {
        url = u;
        setShot(u);
      })
      .catch(() => setShot(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, action.id, previewName, action.updated_at]);

  const act = async (fn: () => Promise<unknown>, note: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDecided(note);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = () => act(() => client.editAction(action.id, draft).then(() => setEditing(false)), "Changed. The preview is redone when you approve.");
  const open = action.state === "proposed";
  const badge = open ? (action.effect === "send" ? "Send?" : "Make?") : action.state === "done" ? (action.effect === "send" ? "Sent" : "Made") : action.state === "running" ? "Doing it" : action.state === "failed" ? "Didn't happen" : action.state === "declined" ? "Not now" : "Approved";

  return (
    <article className={`card need action ${open ? "" : "action--settled"}`} aria-label={`Action: ${action.title}`}>
      <h3>
        {action.title}
        <span className={`badge ${action.state === "failed" ? "badge--failed" : action.state === "done" ? "badge--good" : "badge--waiting"}`} style={{ marginLeft: 8 }}>
          {badge}
        </span>
      </h3>
      <p className="because">
        <b>{action.effect === "send" ? "Sends" : "Prepares"}</b> on {action.site} · {EFFECT[action.effect]} · {when(action.created_at)}
      </p>
      {action.evidence ? (
        <p className="because">
          <b>Because</b> {action.evidence}
        </p>
      ) : null}
      {!compact ? (
        <dl className="action__payload">
          {Object.entries(action.payload).map(([field, value]) => (
            <div key={field}>
              <dt>{field.replace(/_/g, " ")}</dt>
              <dd>
                {editing ? (
                  value.length > 80 || value.includes("\n") ? (
                    <textarea value={draft[field] ?? ""} rows={Math.min(12, Math.max(3, (draft[field] ?? "").split("\n").length + 1))} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />
                  ) : (
                    <input value={draft[field] ?? ""} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />
                  )
                ) : (
                  <pre className="action__text">{value}</pre>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {shot ? <img className="action__shot" src={shot} alt={open ? "How it looks before the last step" : "How it ended"} /> : action.preview_note && open ? <p className="notice">{action.preview_note}</p> : null}
      <p className="because">
        <b>Undo</b> {action.undo}
      </p>
      {action.state === "done" && action.result ? <p className="because">{action.result}</p> : null}
      {action.state === "failed" && action.error ? <p className="notice">{action.error} Alpha looks at the page again and proposes it afresh.</p> : null}
      {open ? (
        <div className="row">
          {editing ? (
            <>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void save()}>
                Save changes
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setEditing(false); setDraft(action.payload); }}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void act(() => client.approveAction(action.id, false), action.effect === "send" ? "Sending it now." : "Doing it now.")}>
                {action.effect === "send" ? "Send it" : "Do it"}
              </button>
              {action.effect === "prepare" ? (
                <button type="button" className="btn" disabled={busy} title="Alpha may do this kind of thing without asking; you can revoke it in Intelligence › Knowledge" onClick={() => void act(() => client.approveAction(action.id, true), "Doing it now, and from now on without asking.")}>
                  Always allow
                </button>
              ) : null}
              <button type="button" className="btn" disabled={busy} onClick={() => setEditing(true)}>
                Change
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void act(() => client.declineAction(action.id), "Left it.")}>
                Not now
              </button>
            </>
          )}
        </div>
      ) : null}
      {error ? <p className="notice">{error}</p> : null}
    </article>
  );
}
