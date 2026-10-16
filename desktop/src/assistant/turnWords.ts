/**
 * What a turn says about itself, read from the journal's own fields (nothing guessed): the reply
 * without the question its card carries, how long it took and how many steps it ran, and the
 * sentence Retry would send again. Shared by the reply element and the panel.
 */
import type { Ask, JournalEntry } from "../core/client";

/** A reply whose trailing question became a card (Q35) shows without that question: the card
 *  carries it, so the person reads it once. A reply that was only the question shows nothing. */
export function withoutCarded(text: string, asks: Ask[], turn: unknown): string | null {
  const carded = asks.find((a) => a.derived && a.turn === turn);
  if (!carded) return text;
  const question = carded.text.trim();
  const plain = text.trim();
  const at = plain.lastIndexOf(question.replace(/\?$/, ""));
  if (at < 0) return text;
  const rest = plain.slice(0, at).replace(/[*_\s]+$/, "").trim();
  return rest.length ? rest : null;
}

/** What a turn already says about itself (13 Oct, Q42 section 8b; the journal's own fields,
 *  nothing guessed): how long it took and how many steps it ran. Who answered and which records
 *  it used aren't recorded per turn, so they aren't shown. */
export function provenance(e: JournalEntry): string {
  const parts: string[] = [];
  if (typeof e.data.duration_ms === "number") parts.push(`${Math.max(1, Math.round(e.data.duration_ms / 1000))} s`);
  if (typeof e.data.num_turns === "number" && e.data.num_turns > 0) parts.push(e.data.num_turns === 1 ? "1 step" : `${e.data.num_turns} steps`);
  return parts.join(" · ");
}

/** The sentence a failed turn answered, when the turn ended without a reply (section 8c): Retry
 *  sends it again. Never offered on a reply that worked: sending "log two eggs" again would log
 *  four. */
export function retryOf(e: JournalEntry, turns: JournalEntry[]): string | null {
  if (e.kind !== "failed") return null;
  const turn = e.data.turn;
  if (turn !== undefined && turns.some((x) => x.kind === "replied" && x.data.turn === turn)) return null;
  const at = turns.indexOf(e);
  for (let i = at - 1; i >= 0; i--) {
    if (turns[i].kind === "said") return turns[i].text;
    if (turns[i].kind === "replied") return null; // the failure belongs to no sentence of the person's
  }
  return null;
}
