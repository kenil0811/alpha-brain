/**
 * Home's cards (the owner, 12 Oct): the one place where what matters now shows, each card with a
 * purpose (its objective is its title), an action on every item, and one of three fixed heights.
 * Alpha is meant to compose these (core-changes G10); until the core can, this builds the same
 * specs from what Home already loads, with a plain rule set: most urgent first, and a card with
 * nothing to act on is never made.
 */
import type { CalendarItem, Goal, Home, JournalEntry, ModuleCard, NeedItem, Thread } from "../core/client";
import type { Surface } from "./Rail";

/** S = 1 row (one line or a number), M = 2 rows, L = 3 rows. Wide spans two columns. */
export type Size = "s" | "m" | "l";
/** The kit a card is drawn with; chosen by what the card is for. */
export type Presentation = "decisions" | "timeline" | "preview" | "number";

type Base = { id: string; objective: string; presentation: Presentation; size: Size; wide: boolean; more: number; opens: Surface | null };
export type HomeCard =
  | (Base & { kind: "needs"; items: NeedItem[] })
  | (Base & { kind: "hypotheses"; items: NeedItem[] })
  | (Base & { kind: "failed"; items: JournalEntry[] })
  | (Base & { kind: "today"; items: CalendarItem[] })
  | (Base & { kind: "working"; items: Thread[] })
  | (Base & { kind: "goals"; items: Goal[] })
  | (Base & { kind: "done"; items: []; count: number })
  | (Base & { kind: "project"; items: [ModuleCard] });

/** How many one-line items each height holds. */
export const HOLDS: Record<Size, number> = { s: 1, m: 3, l: 5 };

/** The height a list of `n` items needs: S for one, M up to three, L above; wide past ten. */
export function sizeFor(n: number): { size: Size; wide: boolean } {
  return { size: n <= HOLDS.s ? "s" : n <= HOLDS.m ? "m" : "l", wide: n > HOLDS.l * 2 };
}

function list<K extends HomeCard["kind"]>(kind: K, objective: string, presentation: Presentation, all: unknown[], opens: Surface | null) {
  const { size, wide } = sizeFor(all.length);
  const holds = HOLDS[size] * (wide ? 2 : 1);
  return { id: kind, kind, objective, presentation, size, wide, items: all.slice(0, holds), more: Math.max(0, all.length - holds), opens } as unknown as HomeCard;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Today's events still to come, from the connected calendar. */
export function laterToday(items: CalendarItem[], now = new Date()): CalendarItem[] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return items.filter((e) => new Date(e.starts_at).getTime() < end && (e.all_day || new Date(e.ends_at).getTime() >= now.getTime()));
}

/** The cards, most urgent first: what needs a yes, what broke, what's on today, Alpha's guesses
 *  to check, what's running, goals, what got done, then the projects. */
export function homeCards({ home, failures, goals = [], modules = [], now = new Date() }: { home: Home; failures: JournalEntry[]; goals?: Goal[]; modules?: ModuleCard[]; now?: Date }): HomeCard[] {
  const asks = home.needs_you.filter((n) => n.kind !== "fact");
  const guesses = home.needs_you.filter((n) => n.kind === "fact");
  const today = laterToday(home.coming_up, now);
  const active = goals.filter((g) => g.state === "active");
  const cards: HomeCard[] = [];
  if (asks.length) cards.push(list("needs", `Answer ${plural(asks.length, "thing")} so Alpha can go on`, "decisions", asks, { kind: "needs" }));
  if (failures.length) cards.push(list("failed", `Fix ${plural(failures.length, "thing")} that didn't work`, "decisions", failures, { kind: "activity" }));
  if (today.length) cards.push(list("today", `Get ready for ${plural(today.length, "event")} today`, "timeline", today, null));
  if (guesses.length) cards.push(list("hypotheses", `Check ${plural(guesses.length, "guess", "guesses")} Alpha made`, "decisions", guesses, { kind: "intelligence", tab: "second-brain" }));
  if (home.threads.length) cards.push(list("working", `Follow ${plural(home.threads.length, "thing")} Alpha is doing`, "preview", home.threads, { kind: "assistant" }));
  if (active.length) cards.push(list("goals", `Move ${plural(active.length, "goal")} forward`, "preview", active, { kind: "intelligence", tab: "second-brain" }));
  if (home.ran_today) cards.push({ id: "done", kind: "done", objective: "See what Alpha did today", presentation: "number", size: "s", wide: false, items: [], count: home.ran_today, more: 0, opens: { kind: "activity" } });
  for (const m of modules.filter((x) => !x.parent)) cards.push({ id: `project:${m.id}`, kind: "project", objective: m.name, presentation: "preview", size: "s", wide: false, items: [m], more: 0, opens: { kind: "module", id: m.id } });
  return cards;
}
