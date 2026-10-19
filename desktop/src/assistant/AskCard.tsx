/**
 * The question card (visual 5 of `docs/design/conversation-proposal.md`, slice 2, 16 Oct 2026):
 * what Alpha asks with `ask_person`, or what the core made from a question left in prose (Q35).
 * An eyebrow, the question, the options as rows with a dot (or ticks when several may be
 * chosen), "Say it your way" as the last row, Answer and Skip. Keys 1 to 9 pick a row, Enter
 * answers. Several questions from one turn are one card with numbered sections, answered
 * together (11 Oct: "after i selected one, it submitted"). A question that was answered folds
 * to one dim line where it was asked.
 */
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Ask, Client, JournalEntry, Turn } from "../core/client";
import { say } from "../core/client";
import { Button, Card } from "../ui";
import { Check } from "../ui/icons";

const SEVERAL = ", ";

/** One option as a row: a dot (one of them) or a tick (several), the words, the key. */
function Row({ words, on, several, index, disabled, onPick }: { words: string; on: boolean; several: boolean; index: number; disabled?: boolean; onPick: () => void }) {
  return (
    <button type="button" className={`askrow${on ? " askrow--on" : ""}${several ? " askrow--tick" : ""}`} aria-pressed={on} disabled={disabled} onClick={onPick}>
      <span className="askrow__mark" aria-hidden="true">
        {several && on ? <Check size={11} /> : null}
      </span>
      <span className="askrow__words">{words}</span>
      {index < 9 ? <span className="askrow__key" aria-hidden="true">{index + 1}</span> : null}
    </button>
  );
}

/** The picks of one question: a row's words, or several joined; "" when nothing is picked. */
export function pickWords(picked: string[], several: boolean): string {
  return several ? picked.join(SEVERAL) : (picked[0] ?? "");
}

function togglePick(picked: string[], words: string, several: boolean): string[] {
  if (picked.includes(words)) return picked.filter((p) => p !== words);
  return several ? [...picked, words] : [words];
}

/** Keys on a card, outside its input: 1 to 9 pick a row; Enter answers when something is picked. */
function keys(e: KeyboardEvent<HTMLElement>, options: string[], onPick: (words: string) => void, onEnter: () => void): void {
  const target = e.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
  if (/^[1-9]$/.test(e.key)) {
    const words = options[Number(e.key) - 1];
    if (words !== undefined) {
      e.preventDefault();
      onPick(words);
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    onEnter();
  }
}

/** A question on its own: a tap on a row answers it (one step, as before); a typed answer or
 *  several ticks go with Answer. */
/** The card takes the keyboard when it appears: the question is the next thing to do. */
function useKeysOnArrival() {
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
  }, []);
  return card;
}

export function AskCard({ ask, client, onAnswered }: { ask: Ask; client: Client; onAnswered: (turn: Turn | null) => void }) {
  const several = ask.choose === "several";
  const card = useKeysOnArrival();
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (words: string) => {
    if (!words.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const out = await client.answerAsk(ask.id, words.trim());
      onAnswered(out.turn);
    } catch (e) {
      setError(say(e));
      setBusy(false);
    }
  };
  const pick = (words: string) => {
    if (several) {
      setPicked((p) => togglePick(p, words, true));
      setText("");
    } else {
      void answer(words);
    }
  };
  const chosen = text.trim() || pickWords(picked, several);
  return (
    <Card
      ref={card}
      tabIndex={0}
      className="askcard"
      eyebrow={`${ask.by ?? "Alpha"} asks`}
      aria-label={`${ask.by ?? "Alpha"} asks`}
      onKeyDown={(e) => keys(e, ask.options, pick, () => void answer(chosen))}
      foot={
        <>
          <Button size="sm" variant="primary" disabled={busy || !chosen} onClick={() => void answer(chosen)}>
            Answer
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void client.dismissAsk(ask.id).then(() => onAnswered(null)).catch(() => undefined)}>
            Skip
          </Button>
          {error ? <span className="notice">{error}</span> : null}
        </>
      }
    >
      <p className="askcard__q">{ask.text}</p>
      {ask.options.length ? (
        <div className="askcard__rows" role="group" aria-label={several ? "Tick what applies" : "Pick one"}>
          {ask.options.map((o, i) => (
            <Row key={o} words={o} on={picked.includes(o)} several={several} index={i} disabled={busy} onPick={() => pick(o)} />
          ))}
        </div>
      ) : null}
      <form
        className="askcard__other"
        onSubmit={(e) => {
          e.preventDefault();
          void answer(chosen);
        }}
      >
        <input className="askcard__input" value={text} onChange={(e) => { setText(e.target.value); if (e.target.value.trim()) setPicked([]); }} placeholder={ask.hint ?? (ask.options.length ? "Say it your way" : "Your answer")} aria-label="Your answer" disabled={busy} />
      </form>
    </Card>
  );
}

/** Questions Alpha asked together (one turn, several `ask_person` calls) are one card: each
 *  with its rows or words, one Answer for all of them, so the person is never sent on after the
 *  first tap. What is left blank stays open as its own card. */
export function AskGroup({ asks, client, onAnswered }: { asks: Ask[]; client: Client; onAnswered: (turn: Turn | null) => void }) {
  const card = useKeysOnArrival();
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answerOf = (a: Ask) => (typed[a.id] ?? "").trim() || pickWords(picked[a.id] ?? [], a.choose === "several");
  const answered = asks.filter((a) => answerOf(a));
  const send = async () => {
    if (!answered.length) return;
    setBusy(true);
    setError(null);
    try {
      const out = await client.answerAsks(Object.fromEntries(answered.map((a) => [a.id, answerOf(a)])));
      onAnswered(out.turn);
    } catch (e) {
      setError(say(e));
      setBusy(false);
    }
  };
  const pick = (a: Ask, words: string) => {
    setPicked((p) => ({ ...p, [a.id]: togglePick(p[a.id] ?? [], words, a.choose === "several") }));
    setTyped((t) => ({ ...t, [a.id]: "" }));
  };
  return (
    <Card ref={card} tabIndex={0} className="askcard askcard--group" eyebrow={`${asks[0].by ?? "Alpha"} asks ${asks.length} things`} aria-label={`${asks[0].by ?? "Alpha"} asks`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {asks.map((a, i) => (
          <fieldset
            className="askcard__one"
            key={a.id}
            aria-label={a.text}
            onKeyDown={(e) => keys(e, a.options, (words) => pick(a, words), () => void send())}
          >
            <p className="askcard__q">
              <span className="askcard__n">{i + 1}.</span> {a.text}
            </p>
            {a.options.length ? (
              <div className="askcard__rows" role="group" aria-label={a.choose === "several" ? "Tick what applies" : "Pick one"}>
                {a.options.map((o, j) => (
                  <Row key={o} words={o} on={(picked[a.id] ?? []).includes(o)} several={a.choose === "several"} index={j} disabled={busy} onPick={() => pick(a, o)} />
                ))}
              </div>
            ) : null}
            <input className="askcard__input" value={typed[a.id] ?? ""} onChange={(e) => { setTyped({ ...typed, [a.id]: e.target.value }); if (e.target.value.trim()) setPicked((p) => ({ ...p, [a.id]: [] })); }} placeholder={a.hint ?? (a.options.length ? "Say it your way" : "Your answer")} aria-label={`Your answer: ${a.text}`} disabled={busy} />
          </fieldset>
        ))}
        <div className="frame__foot">
          <Button size="sm" variant="primary" type="submit" disabled={busy || !answered.length}>
            {answered.length && answered.length < asks.length ? `Answer ${answered.length} of ${asks.length}` : "Answer"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void Promise.all(asks.map((a) => client.dismissAsk(a.id))).then(() => onAnswered(null)).catch(() => undefined)}>
            Skip all
          </Button>
          {answered.length && answered.length < asks.length ? <span className="faint">The rest stay open.</span> : null}
          {error ? <span className="notice">{error}</span> : null}
        </div>
      </form>
    </Card>
  );
}

/** A question that was answered or skipped: one dim line where it was asked, so the
 *  conversation still reads in order. An answer that went back to the agent that asked is no
 *  message of the conversation's, so the line shows it (Q92). */
export function AskedRow({ entry }: { entry: JournalEntry }) {
  return (
    <>
      <div className="asked">
        <span className="asked__who">{entry.by ?? "Alpha"} asked</span>
        <span className="asked__q">{entry.text}</span>
      </div>
      {entry.answer ? (
        <div className="asked">
          <span className="asked__who">You answered</span>
          <span className="asked__q">{entry.answer}</span>
        </div>
      ) : null}
    </>
  );
}

/** Open questions grouped by the turn that asked them: one form per turn with several, a
 *  card for a question on its own. */
export function groupAsks(asks: Ask[]): Ask[][] {
  const groups: Ask[][] = [];
  const byTurn = new Map<string, Ask[]>();
  asks.forEach((a) => {
    const key = a.turn && !a.derived ? a.turn : `one:${a.id}`;
    const found = byTurn.get(key);
    if (found) found.push(a);
    else {
      const group = [a];
      byTurn.set(key, group);
      groups.push(group);
    }
  });
  return groups;
}
