/**
 * What every card shows the same way (P3 of the tasks-and-cards proposal): a No that says why in
 * one tap, the line saying where the card came from, and a decision's state in words and colour.
 */
import { useState } from "react";
import type { CardFrom, Client, DecisionCard, NeedItem, Staged } from "../core/client";
import { REASONS, say } from "../core/client";
import { when } from "../modules/format";
import { Button } from "../ui";
import { Menu, MenuHeading, MenuItem } from "../ui/Menu";

/** A No with its reason: the button opens the six reasons; picking one is the No. */
export function NoWithReason({ label = "Not now", disabled, onNo }: { label?: string; disabled?: boolean; onNo: (reason: string) => void }) {
  return (
    <Menu
      align="start"
      trigger={
        <Button variant="ghost" disabled={disabled}>
          {label}
        </Button>
      }
    >
      <MenuHeading>Why not?</MenuHeading>
      {REASONS.map((r) => (
        <MenuItem key={r} onSelect={() => onNo(r)}>
          {r}
        </MenuItem>
      ))}
    </Menu>
  );
}

/** "Drafted by Deal Analyst · from its run of 10:48 · for Ask the broker for the P&L", and
 *  what it rests on. Nothing when Alpha drafted it in the conversation. */
export function CardFromLine({ from }: { from?: CardFrom | null }) {
  if (!from || (!from.by && !from.task && !from.rests_on.length)) return null;
  const parts = [from.by ? `Drafted by ${from.by} for you` : null, from.run_at ? `from its run of ${when(from.run_at)}` : null, from.task ? `for ${from.task.title ?? "a task"}` : null].filter(Boolean);
  return (
    <div className="cardfrom faint">
      {parts.length ? <span>{parts.join(" · ")}</span> : null}
      {from.rests_on.length ? (
        <span>
          Rests on:{" "}
          {from.rests_on.map((r, i) => (
            <span key={`${r.text}-${i}`}>
              {i ? "; " : ""}
              {r.url ? (
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.text}
                </a>
              ) : (
                r.text
              )}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** A decision's state in words and colour (P3 item 8): yes and edited green, no red with its
 *  reason, allowed blue, withdrawn and skipped grey, waiting yellow. */
export const DECISION: Record<DecisionCard["state"], { words: string; cls: string }> = {
  waiting: { words: "Waiting", cls: "badge--waiting" },
  answered: { words: "Answered", cls: "badge--good" },
  yes: { words: "Yes", cls: "badge--good" },
  edited: { words: "Yes, edited", cls: "badge--good" },
  no: { words: "No", cls: "badge--failed" },
  allowed: { words: "Allowed", cls: "badge--running" },
  skipped: { words: "Skipped", cls: "" },
  withdrawn: { words: "Withdrawn", cls: "" },
};

/** What an agent's run brought in, held for the person's yes (P3 item 5): the rows with ticks
 *  (all ticked; Change edits them), or the file with where it would be kept; Yes lands what is
 *  ticked, Always when offered (item 6), Not now with its reason. */
export function StagedCard({ item, client, onDone }: { item: NeedItem; client: Client; onDone: (words: string) => void }) {
  const s = item.staged as Staged;
  const [ticks, setTicks] = useState<number[]>(() => s.rows.map((_, i) => i));
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});
  const [editing, setEditing] = useState(false);
  const [place, setPlace] = useState<string>(s.module ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fields = (s.fields ?? []).filter((f) => s.rows.some((r) => r.values[f.name] !== undefined && r.values[f.name] !== null));
  const decide = async (body: Parameters<Client["decideStaged"]>[1], words: string) => {
    setBusy(true);
    setError(null);
    try {
      await client.decideStaged(s.id, body);
      onDone(words);
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(false);
    }
  };
  const yes = (always = false) =>
    void decide(
      s.kind === "rows" ? { accept: true, ticks, edits: Object.keys(edits).length ? edits : undefined, always } : { accept: true, destination: place !== (s.module ?? "") ? place : undefined, always },
      always ? "Kept, and from now on without asking." : "Kept.",
    );
  const value = (i: number, f: string) => (edits[i]?.[f] ?? s.rows[i].values[f] ?? "") as string;
  return (
    <article className="card need staged" aria-label={`Staged: ${item.text}`}>
      <span className="frame__eyebrow">{item.by ? `${item.by} brought in` : "Brought in"}</span>
      <h3>{item.text}</h3>
      <CardFromLine from={item.from} />
      {s.kind === "rows" ? (
        <table className="staged__rows">
          <thead>
            <tr>
              <th aria-label="Keep" />
              {fields.map((f) => (
                <th key={f.name}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.rows.map((_, i) => (
              <tr key={i} className={ticks.includes(i) ? undefined : "faint"}>
                <td>
                  <input type="checkbox" checked={ticks.includes(i)} aria-label={`Keep row ${i + 1}`} onChange={(e) => setTicks((t) => (e.target.checked ? [...t, i].sort((a, b) => a - b) : t.filter((x) => x !== i)))} />
                </td>
                {fields.map((f) => (
                  <td key={f.name}>{editing ? <input value={String(value(i, f.name))} aria-label={`${f.label}, row ${i + 1}`} onChange={(e) => setEdits((x) => ({ ...x, [i]: { ...(x[i] ?? {}), [f.name]: e.target.value } }))} /> : String(value(i, f.name))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="because">
          <b>{s.name}</b> {s.size ? `· ${Math.max(1, Math.round(s.size / 1024))} KB` : ""} {s.origin ? `· from ${s.origin}` : ""}
          {s.duplicate_of ? <span className="staged__twin">You have this already: {s.duplicate_of.title}.</span> : null}
          <span className="staged__place">
            Keep it in{" "}
            <select className="btn btn--sm" value={place} aria-label="Where to keep it" onChange={(e) => setPlace(e.target.value)}>
              {(s.places ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </span>
        </p>
      )}
      <div className="row">
        <Button variant="primary" disabled={busy || (s.kind === "rows" && !ticks.length)} onClick={() => yes(false)}>
          {s.kind === "rows" ? `Yes, keep ${ticks.length}` : s.duplicate_of ? "Keep both" : "Yes, keep it"}
        </Button>
        {s.offers_always ? (
          <Button disabled={busy} title={`From now on, what it brings into ${s.place} lands without asking; you can revoke it in Intelligence › Knowledge`} onClick={() => yes(true)}>
            Always
          </Button>
        ) : null}
        {s.kind === "rows" ? (
          <Button disabled={busy} onClick={() => setEditing((v) => !v)}>
            {editing ? "Done changing" : "Change"}
          </Button>
        ) : null}
        <NoWithReason disabled={busy} onNo={(reason) => void decide({ accept: false, reason }, "Noted. Nothing was kept.")} />
      </div>
      {error ? <p className="notice">{error}</p> : null}
    </article>
  );
}
