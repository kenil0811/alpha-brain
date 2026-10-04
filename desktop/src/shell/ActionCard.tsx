/**
 * An outward action Alpha proposed (a draft, a message, something to send): the exact text
 * that would be typed, a screenshot of the dry run, what cannot be undone, and the decision.
 * Nothing leaves until the person says yes here or in words.
 */
import { useEffect, useState } from "react";
import type { Action, Client } from "../core/client";
import { when } from "../modules/format";
import { Button, Dialog } from "../ui";

const isShort = (v: string) => v.length <= 90 && !v.includes("\n");
/** A field a person has no use for on the card: an identifier the procedure needs (a urn, a
 *  slug, an opaque token), not words. It still travels with the action and the title names the
 *  person. */
const isIdentifier = (field: string, value: string) =>
  /(^|_)(urn|id|slug|key|token|uid|guid|handle)$/.test(field) || /^urn:/i.test(value) || (/^[A-Za-z0-9_-]{24,}$/.test(value) && !/\s/.test(value));
const EVIDENCE_SHORT = 150;

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
  const [full, setFull] = useState(false);
  const [moreWhy, setMoreWhy] = useState(false);
  const fields = Object.entries(action.payload).filter(([f, v]) => editing || !isIdentifier(f, v));
  const why = action.evidence ?? "";
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
      {why ? (
        <p className="because">
          <b>Because</b> {moreWhy || why.length <= EVIDENCE_SHORT ? why : `${why.slice(0, EVIDENCE_SHORT).trimEnd()}…`}
          {why.length > EVIDENCE_SHORT ? (
            <button type="button" className="linkbtn faint" style={{ marginLeft: 6 }} onClick={() => setMoreWhy((v) => !v)}>
              {moreWhy ? "less" : "more"}
            </button>
          ) : null}
        </p>
      ) : null}
      <div className={`action__body${compact ? " action__body--compact" : ""}`}>
        {!compact ? (
          <div className="action__payload">
            {fields.filter(([, v]) => isShort(v)).length ? (
              <p className="action__line">
                {fields
                  .filter(([, v]) => isShort(v))
                  .map(([field, value]) => (
                    <span key={field}>
                      <span className="faint">{field.replace(/_/g, " ")}</span> {action.files?.[field] ? `${action.files[field].name} (${Math.max(1, Math.round(action.files[field].size / 1024))} KB)` : editing ? <input value={draft[field] ?? ""} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} /> : value}
                    </span>
                  ))}
              </p>
            ) : null}
            {fields
              .filter(([, v]) => !isShort(v))
              .map(([field, value]) => (
                <div key={field} className="action__block">
                  <span className="faint">{field.replace(/_/g, " ")}</span>
                  {editing ? <textarea value={draft[field] ?? ""} rows={Math.min(14, Math.max(4, (draft[field] ?? "").split("\n").length + 1))} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} /> : <pre className="action__text">{value}</pre>}
                </div>
              ))}
          </div>
        ) : null}
        {shot ? (
          <button type="button" className="action__thumb" onClick={() => setFull(true)} title="See it full size">
            <img src={shot} alt={open ? "How it looks before the last step" : "How it ended"} onError={() => setShot(null)} />
            <span className="action__thumb-cap">{open ? "Before the last step" : "How it ended"} · click to enlarge</span>
          </button>
        ) : null}
      </div>
      {!shot && open && action.preview_note ? <p className="faint">{action.preview_note}</p> : null}
      {shot ? (
        <Dialog open={full} onOpenChange={setFull} title="Screenshot, full size" bare>
          <img src={shot} alt="Screenshot, full size" onClick={() => setFull(false)} />
        </Dialog>
      ) : null}
      <p className="because">
        <b>Undo</b> {action.undo}
      </p>
      {action.state === "done" && action.result ? <p className="because">{action.result}</p> : null}
      {action.state === "failed" && action.error ? <p className="notice">{action.error} Alpha looks at the page again and proposes it afresh.</p> : null}
      {open ? (
        <div className="row">
          {editing ? (
            <>
              <Button variant="primary" disabled={busy} onClick={() => void save()}>
                Save changes
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => { setEditing(false); setDraft(action.payload); }}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" disabled={busy || !action.preview} title={!action.preview ? "Wait for the preview" : undefined} onClick={() => void act(() => client.approveAction(action.id, false), action.effect === "send" ? "Sending it now." : "Doing it now.")}>
                {action.effect === "send" ? "Send it" : "Do it"}
              </Button>
              {action.effect === "prepare" ? (
                <Button disabled={busy || !action.preview} title="Alpha may do this kind of thing without asking; you can revoke it in Intelligence › Knowledge" onClick={() => void act(() => client.approveAction(action.id, true), "Doing it now, and from now on without asking.")}>
                  Always allow
                </Button>
              ) : null}
              <Button disabled={busy} onClick={() => setEditing(true)}>
                Change
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void act(() => client.declineAction(action.id), "Left it.")}>
                Not now
              </Button>
            </>
          )}
        </div>
      ) : null}
      {error ? <p className="notice">{error}</p> : null}
    </article>
  );
}
