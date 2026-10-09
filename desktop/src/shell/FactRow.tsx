/**
 * A fact as a row (the UI rulebook §8 and §12): what Alpha knows, a **Provenance** disclosure
 * that says where it came from and when it was seen, and what the person can do about it.
 * Only what the core already offers is wired: a suggested fact is remembered or forgotten
 * (`decideFact`); correcting is a sentence to Alpha, because there is no call that edits a fact;
 * forgetting one already accepted is disabled, with the reason and the next step.
 * Shared by Intelligence › Second Brain and a person's page. (9 Oct, the pages phase.)
 */
import { useId, useState } from "react";
import type { Client, Fact } from "../core/client";
import { humanize, when } from "../modules/format";
import { Button, ListRow, Notice, Tooltip } from "../ui";
import { ChevronDown, ChevronRight, ICON_SM } from "../ui/icons";
import { SUBTITLES } from "../ui/subtitles";

/** Where a fact came from, in words a person can check. */
export function sourceWords(f: Fact): string {
  if (f.source === "stated") return "You said so";
  if (f.source.startsWith("turn:")) return f.state === "suggested" || f.confidence < 0.9 ? "Alpha noticed it in a conversation" : "Your own words in a conversation";
  if (f.source === "alpha") return "Alpha worked it out";
  return `From ${f.source.replace(/^connector:/, "")}`;
}

/** The disclosure: closed by default, so the row stays one line. */
export function Provenance({ fact }: { fact: Fact }) {
  const [open, setOpen] = useState(false);
  const hint = useId();
  return (
    <div className="prov2">
      <Tooltip text={SUBTITLES.provenance}>
        <button type="button" className="prov2__toggle" aria-expanded={open} aria-describedby={hint} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown size={ICON_SM} aria-hidden="true" /> : <ChevronRight size={ICON_SM} aria-hidden="true" />} Provenance
        </button>
      </Tooltip>
      <span id={hint} hidden>
        {SUBTITLES.provenance}
      </span>
      {open ? <p className="scard__sub">{SUBTITLES.provenance}</p> : null}
      {open ? (
        <dl className="prov2__body">
          <div>
            <dt>Source</dt>
            <dd>{sourceWords(fact)}</dd>
          </div>
          <div>
            <dt>Seen</dt>
            <dd>{when(fact.recorded_at)}</dd>
          </div>
          {fact.valid_from && fact.valid_from !== fact.recorded_at ? (
            <div>
              <dt>True from</dt>
              <dd>{when(fact.valid_from)}</dd>
            </div>
          ) : null}
          {fact.why ? (
            <div>
              <dt>Because</dt>
              <dd>“{fact.why}”</dd>
            </div>
          ) : null}
          <div>
            <dt>State</dt>
            <dd>{fact.state === "suggested" ? "Waiting for your confirmation" : "Confirmed"}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

export function FactRow({ fact, client, onChanged, onAsk }: { fact: Fact; client: Client; onChanged: () => void; onAsk?: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggested = fact.state === "suggested";
  async function decide(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      await client.decideFact(fact.id, accept);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const label = humanize(fact.predicate);
  return (
    <ListRow
      title={fact.value}
      description={label}
      controls={
        suggested ? (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void decide(true)}>
              Remember
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decide(false)}>
              Forget
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabledReason={onAsk ? undefined : "Tell Alpha in a conversation"} onClick={() => onAsk?.(`Correct this fact: ${label.toLowerCase()} is “${fact.value}”, but it should be `)}>
              Correct
            </Button>
            <Button size="sm" variant="ghost" disabledReason="Forgetting a confirmed fact needs Alpha's core">
              Forget
            </Button>
          </>
        )
      }
    >
      <Provenance fact={fact} />
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </ListRow>
  );
}
