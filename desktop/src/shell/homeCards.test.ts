import { describe, expect, it } from "vitest";
import type { CalendarItem, Home, JournalEntry, NeedItem } from "../core/client";
import { HOLDS, homeCards, laterToday, sizeFor } from "./homeCards";

const quiet: Home = { date: "", needs_you: [], ran_today: 0, failed_today: 0, modules: [], loose_tables: [], coming_up: [], threads: [], brief: null };
const need = (id: string, kind: NeedItem["kind"] = "ask"): NeedItem => ({ kind, id, text: id, at: "" });
const fail = (id: string) => ({ id, kind: "failed", text: id, data: {}, at: "" }) as unknown as JournalEntry;

describe("home cards", () => {
  it("sizes by how much there is: S one, M up to three, L above, wide past ten", () => {
    expect(sizeFor(1)).toEqual({ size: "s", wide: false });
    expect(sizeFor(3)).toEqual({ size: "m", wide: false });
    expect(sizeFor(4)).toEqual({ size: "l", wide: false });
    expect(sizeFor(11)).toEqual({ size: "l", wide: true });
  });

  it("leaves out what has nothing to act on, and puts what needs a yes and what broke first", () => {
    expect(homeCards({ home: quiet, failures: [] })).toEqual([]);
    const cards = homeCards({ home: { ...quiet, ran_today: 2, needs_you: [need("f", "fact"), need("a")] }, failures: [fail("x")], goals: [{ id: "g", text: "Ship", state: "active", module: null, since: "" }, { id: "g2", text: "Old", state: "done", module: null, since: "" }] });
    expect(cards.map((c) => c.kind)).toEqual(["needs", "failed", "hypotheses", "goals", "done"]);
    expect(cards.find((c) => c.kind === "goals")!.items).toHaveLength(1); // only active goals
  });

  it("keeps a card to what its height holds and counts the rest as more, with a page to open", () => {
    const many = Array.from({ length: 7 }, (_, i) => need(`a${i}`));
    const [card] = homeCards({ home: { ...quiet, needs_you: many }, failures: [] });
    expect(card.size).toBe("l");
    expect(card.items).toHaveLength(HOLDS.l);
    expect(card.more).toBe(2);
    expect(card.opens).toEqual({ kind: "needs" });
  });

  it("keeps today's events still to come", () => {
    const now = new Date(2026, 9, 12, 12);
    const at = (h: number, d = 12) => new Date(2026, 9, d, h).toISOString();
    const ev = (id: string, s: string, e: string) => ({ id, title: id, starts_at: s, ends_at: e, all_day: false, location: null, calendar: "", attendees: [] }) as unknown as CalendarItem;
    expect(laterToday([ev("past", at(9), at(10)), ev("now", at(11), at(13)), ev("later", at(15), at(16)), ev("tomorrow", at(9, 13), at(10, 13))], now).map((e) => e.id)).toEqual(["now", "later"]);
  });
});
