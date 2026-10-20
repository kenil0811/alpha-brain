/**
 * One of Alpha's replies as one element, from the first words to the journal (slice 1 of
 * `docs/design/conversation-proposal.md`, 16 Oct 2026): the thinking line, the step rows and the
 * text live inside it; the text only ever grows; when the turn ends the same element shows the
 * journal's words and the meta line, so nothing on the page is replaced or moves. A reply read
 * back from the journal is the same element without the live part. The person's sentence is
 * `Said`. The poll stays the source for now (the pushed stream is the core's part of the slice).
 */
import { useEffect, useRef, useState } from "react";
import type { Ask, JournalEntry, Turn } from "../core/client";
import { Button, Rich } from "../ui";
import { Check, ChevronDown, ChevronRight, Spinner, X } from "../ui/icons";
import { provenance, withoutCarded } from "./turnWords";

interface Step {
  at: string;
  kind: string;
  text: string;
}

/** The key that keeps a running turn and the reply it becomes on one element: the sentence's
 *  journal id, which the reply's entry carries as `data.turn`. */
/** "Watson kept 1 fact · 2 decisions": what a turn led him to file (harness 4b, 18 Oct). */
export function keptWords(kept: NonNullable<JournalEntry["kept"]>): string {
  const parts = (["facts", "tasks", "decisions"] as const)
    .filter((k) => (kept[k] ?? 0) > 0)
    .map((k) => `${kept[k]} ${kept[k] === 1 ? k.slice(0, -1) : k}`);
  return parts.length ? `Watson kept ${parts.join(" · ")}` : "";
}

export function replyKey(e: JournalEntry): string {
  return e.kind === "replied" && typeof e.data.turn === "string" ? `turn-${e.data.turn}` : e.id;
}

export function turnKey(t: Turn): string {
  return t.said ? `turn-${t.said}` : `pending-${t.id ?? "new"}`;
}

/** The person's sentence: a quiet block on the right. Edit puts the words back in the composer;
 *  sending them is a new turn. */
export function Said({ entry, onEdit }: { entry: JournalEntry; onEdit?: () => void }) {
  return (
    <div className="said">
      {onEdit ? (
        <button type="button" className="said__edit" onClick={onEdit}>
          Edit
        </button>
      ) : null}
      <div className="said__text">{entry.text}</div>
    </div>
  );
}

/** The first sentence of a thought, for the thinking line. */
export function firstSentence(text: string, most = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(clean);
  const s = m ? m[1] : clean;
  return s.length > most ? `${s.slice(0, most - 1).trimEnd()}…` : s;
}

/** The words so far, grown by what the poll brought: appended when the new text continues the
 *  shown one, joined on the overlap when the core kept only the tail (`partial_chars`), and
 *  started afresh, the old words kept as the thought, when the core cleared it at a tool call. */
export function grow(shown: string, incoming: string): { text: string; cleared: string | null } {
  if (incoming === shown) return { text: shown, cleared: null };
  if (incoming.startsWith(shown)) return { text: incoming, cleared: null };
  if (!incoming) return { text: "", cleared: shown || null };
  const tail = shown.slice(-64);
  const at = tail ? incoming.indexOf(tail) : -1;
  if (at >= 0) return { text: shown + incoming.slice(at + tail.length), cleared: null };
  return { text: incoming, cleared: shown || null };
}

export function Reply({
  entry,
  turn,
  asks,
  elapsed = 0,
  onRetry,
  onStop,
}: {
  /** The journal's reply (or failure), once the turn is over or when read back. */
  entry?: JournalEntry;
  /** The running turn, polled: its words so far, its steps, what it is doing. */
  turn?: Turn | null;
  asks?: Ask[];
  elapsed?: number;
  onRetry?: () => void;
  onStop?: () => void;
}) {
  const running = Boolean(turn) && !entry;
  const [text, setText] = useState("");
  const [thought, setThought] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const shown = useRef("");
  const seen = useRef(new Set<string>());

  // The live part, on each poll: words appended, steps appended, the thought kept. Nothing is
  // ever taken away, so the element never shrinks or re-flows while the model works.
  useEffect(() => {
    if (!turn) return;
    const { text: next, cleared } = grow(shown.current, turn.live?.partial ?? "");
    if (next !== shown.current) {
      shown.current = next;
      setText(next);
    }
    if (cleared) setThought(cleared);
    else if (turn.live?.thought) setThought(turn.live.thought);
    const fresh = (turn.steps ?? []).filter((s) => {
      const key = `${s.at}|${s.text}`;
      if (seen.current.has(key)) return false;
      seen.current.add(key);
      return true;
    });
    if (fresh.length) setSteps((all) => [...all, ...fresh]);
  }, [turn]);

  const failed = entry?.kind === "failed";
  const finalText = entry ? (entry.kind === "replied" ? withoutCarded(entry.text, asks ?? [], entry.data.turn) : entry.text) : null;
  if (entry && finalText === null) return null; // a reply that was only the question its card carries
  const words = entry ? (finalText ?? "") : text;
  const fromThread = entry && typeof entry.data.from_thread === "string" ? entry.data.from_thread : null;
  const doing = running ? (turn?.live?.doing ?? null) : null;
  const prov = entry ? provenance(entry) : "";
  const kept = entry?.kept ? keptWords(entry.kept) : "";
  const list = running ? (open || steps.length <= 3 ? steps : steps.slice(-3)) : open ? steps : [];
  const copy = () => {
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    void clipboard
      .writeText(words)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  return (
    <div className={`reply${failed ? " reply--failed" : ""}${running ? " reply--running" : ""}`} data-turn={turn ? turnKey(turn) : entry ? replyKey(entry) : undefined}>
      {fromThread ? <div className="reply__label">From the thread · {fromThread}</div> : null}
      {entry && typeof entry.data.agent_name === "string" ? <div className="reply__label">{entry.data.agent_name} {entry.data.told ? "reports" : "answers"}</div> : null}
      {running ? (
        <div className="reply__head" role="status" aria-live="polite">
          {!text ? (
            <span className="reply__thinking">
              <Spinner size={13} className="reply__spin" aria-hidden="true" />
              <span className="shimmer">{doing ?? (thought ? firstSentence(thought) : "Thinking")}</span>
            </span>
          ) : null}
          <span className="reply__time faint">{elapsed} s</span>
          {onStop ? (
            <Button size="sm" variant="ghost" onClick={onStop}>
              Stop
            </Button>
          ) : null}
        </div>
      ) : null}
      {list.length ? (
        <ol className="reply__steps" aria-label="Steps">
          {list.map((s, i) => (
            <li key={`${s.at}-${i}`} className={`reply__step${s.kind === "failed" ? " reply__step--failed" : ""}`}>
              {s.kind === "failed" ? <X size={13} aria-label="failed" /> : <Check size={13} aria-label="done" />} <span>{s.text}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {running && steps.length > 3 ? (
        <button type="button" className="reply__fold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />} {open ? "fewer" : `all ${steps.length} steps`}
        </button>
      ) : null}
      {!running && steps.length ? (
        <button type="button" className="reply__fold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />} {steps.length === 1 ? "1 step" : `${steps.length} steps`}
        </button>
      ) : null}
      {words ? (
        <div className="reply__text">
          {failed ? (
            <>
              <X size={14} aria-hidden="true" />
              <span>{words}</span>
              {entry && typeof entry.repeats === "number" && entry.repeats > 1 ? <span className="faint reply__repeats">×{entry.repeats}</span> : null}
            </>
          ) : (
            <Rich text={words} streaming={running} />
          )}
        </div>
      ) : null}
      {!running ? (
        <div className="reply__meta">
          {prov ? <span>{prov}</span> : null}
          {kept ? <span className="reply__kept" title="What Watson kept from this turn; it is on his page and yours">{kept}</span> : null}
          {words && !failed ? (
            <button type="button" className="reply__act" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
          {onRetry ? (
            <button type="button" className="reply__act" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
