import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RecordRow } from "../core/client";
import { availableTiles, computeTile, dashboardAvailable, defaultTiles, type Tile } from "./dashboard";
import type { FieldInfo } from "./fields";

const fields: FieldInfo[] = [
  { name: "title", kind: "text", required: true },
  { name: "amount", kind: "number", label: "Amount" },
  { name: "stage", kind: "status", label: "Stage", choices: ["open", "won", "lost"], done_choices: ["won", "lost"] },
  { name: "due", kind: "date", label: "Due date" },
];
const NOW = new Date(2026, 9, 9); // 9 Oct 2026
// dates in words leave the year out for this year: fix the clock the words are measured against
beforeAll(() => vi.useFakeTimers({ toFake: ["Date"], now: NOW }));
afterAll(() => vi.useRealTimers());
let n = 0;
const row = (values: Record<string, unknown>, extra: Partial<RecordRow> = {}): RecordRow => ({ id: `r${++n}`, revision: 1, values, created_at: "", updated_at: "", provenance: {}, ...extra });
const tile = (t: Partial<Tile> & Pick<Tile, "type">): Tile => ({ id: t.type, ...t });
const rows = [
  row({ title: "A", amount: 100, stage: "open", due: "2026-10-01" }), // overdue
  row({ title: "B", amount: 300, stage: "won", due: "2026-10-02" }), // done: not overdue
  row({ title: "C", amount: null, stage: "open", due: "2026-10-12" }),
  row({ title: "", amount: 50, stage: "lost", due: "2026-09-15" }, { provenance: { estimated: true } }), // missing required, estimated
  row({ title: "E", amount: 50, stage: null, due: null }),
];
const ctx = { fields, rows, titleField: "title", now: NOW };
const ids = (...i: number[]) => i.map((x) => rows[x].id);

describe("availability", () => {
  it("needs a number, status, choice or date field, and says so", () => {
    expect(dashboardAvailable(fields)).toBeNull();
    expect(dashboardAvailable([{ name: "t", kind: "text" }])).toBe("Dashboard needs a number, status or date field");
    expect(dashboardAvailable([{ name: "t", kind: "choice" }])).toBeNull();
  });
});

describe("the default tiles", () => {
  it("are chosen from field kinds, four to seven", () => {
    const ids = defaultTiles(fields).map((t) => t.id);
    expect(ids).toEqual(["metric:count", "metric:sum:amount", "metric:avg:amount", "breakdown:stage", "overtime:count:due", "attention", "metric:estimated"]);
    for (const only of [[{ name: "n", kind: "number" }], [{ name: "d", kind: "date" }], [{ name: "s", kind: "status" }]]) {
      const count = defaultTiles(only).length;
      expect(count).toBeGreaterThanOrEqual(4);
      expect(count).toBeLessThanOrEqual(7);
    }
  });
  it("offers only tiles these fields can have", () => {
    const labels = availableTiles([{ name: "d", kind: "date" }]).map((a) => a.label);
    expect(labels).toEqual(["Number of records", "Estimated by Alpha", "Records over time by d", "Needs attention"]);
  });
});

describe("metrics", () => {
  it("count what is shown", () => {
    const d = computeTile(tile({ type: "metric", measure: "count" }), ctx)!;
    expect(d).toMatchObject({ value: "5", cta: { text: "Show these 5", ids: ids(0, 1, 2, 3, 4) } });
  });
  it("average a number over the records that have one, and say how many", () => {
    const d = computeTile(tile({ type: "metric", field: "amount", measure: "avg" }), ctx)!;
    expect(d).toMatchObject({ title: "Average amount", value: "125", basis: "4 of 5 records have a value in Amount", cta: { text: "Show these 4", label: "Average amount · 4", ids: ids(0, 1, 3, 4) } });
  });
  it("say Unknown and disable the button when nothing has a value", () => {
    const d = computeTile(tile({ type: "metric", field: "amount", measure: "sum" }), { ...ctx, rows: [row({ amount: null })] })!;
    expect(d).toMatchObject({ value: "Unknown", cta: { disabledReason: "No record has a value in Amount yet." } });
    expect(computeTile(tile({ type: "metric", measure: "count" }), { ...ctx, rows: [] })).toMatchObject({ value: "0", cta: { disabledReason: "There are no records yet." } });
  });
  it("count what Alpha estimated", () => {
    expect(computeTile(tile({ type: "metric", measure: "estimated" }), ctx)).toMatchObject({ value: "1", cta: { ids: ids(3) } });
  });
});

describe("breakdown", () => {
  it("counts per choice, with the ids behind each and Unknown for no value", () => {
    const d = computeTile(tile({ type: "breakdown", field: "stage" }), ctx);
    if (d?.type !== "breakdown") throw new Error("wrong type");
    expect(d.segments.map((s) => [s.label, s.count])).toEqual([["Open", 2], ["Won", 1], ["Lost", 1], ["Unknown", 1]]);
    expect(d.segments[0]).toMatchObject({ ids: ids(0, 2), showLabel: "Stage · Open" });
    expect(d.basis).toBe("5 records, 1 with no value (Unknown)");
  });
  it("offers the largest segment that is not finished", () => {
    const d = computeTile(tile({ type: "breakdown", field: "stage" }), ctx)!;
    expect(d.cta).toMatchObject({ text: "Show Open (2)", label: "Stage · Open", ids: ids(0, 2) });
  });
  it("keeps its structure when empty, with a disabled button", () => {
    const d = computeTile(tile({ type: "breakdown", field: "stage" }), { ...ctx, rows: [] });
    if (d?.type !== "breakdown") throw new Error("wrong type");
    expect(d.segments).toHaveLength(3);
    expect(d).toMatchObject({ empty: "No records yet.", cta: { disabledReason: "There are no records yet." } });
  });
  it("folds a long tail into Other", () => {
    const many: FieldInfo = { name: "k", kind: "choice", choices: "abcdefghij".split("") };
    const rs = "abcdefghij".split("").map((c) => row({ k: c }));
    const d = computeTile(tile({ type: "breakdown", field: "k" }), { fields: [many], rows: rs, now: NOW });
    if (d?.type !== "breakdown") throw new Error("wrong type");
    expect(d.segments).toHaveLength(7);
    expect(d.segments[6]).toMatchObject({ label: "Other", count: 4 });
  });
});

describe("over time", () => {
  const dated = [row({ due: "2026-10-05" }), row({ due: "2026-10-08" }), row({ due: "2026-09-28" }), row({ due: null })];
  const d = computeTile(tile({ type: "overtime", field: "due", measure: "count" }), { fields, rows: dated, now: NOW });
  if (d?.type !== "overtime") throw new Error("wrong type");
  it("buckets by week, Monday first, with absolute labels and the gaps filled", () => {
    expect(d.period).toBe("week");
    expect(d.buckets.map((b) => [b.label, b.value])).toEqual([["Week of 28 Sep", 1], ["Week of 5 Oct", 2]]);
    expect(d.basis).toBe("Records per week · 3 of 4 records have a value in Due date");
  });
  it("offers this week, with its records", () => {
    expect(d.cta).toMatchObject({ text: "Show this week", label: "Week of 5 Oct · 2", ids: [dated[0].id, dated[1].id] });
  });
  it("goes by month over a long span, and adds up a number when asked", () => {
    const long = [row({ due: "2026-01-10", amount: 5 }), row({ due: "2026-03-02", amount: 7 }), row({ due: "2026-04-20", amount: 1 })];
    const m = computeTile(tile({ type: "overtime", field: "due", measure: "amount" }), { fields, rows: long, now: NOW });
    if (m?.type !== "overtime") throw new Error("wrong type");
    expect(m.buckets.map((b) => [b.label, b.value])).toEqual([["Jan 2026", 5], ["Feb 2026", 0], ["Mar 2026", 7], ["Apr 2026", 1]]);
    expect(m.cta.text).toBe("Show Apr 2026");
  });
  it("says so when no record has a date", () => {
    expect(computeTile(tile({ type: "overtime", field: "due", measure: "count" }), { fields, rows: [row({})], now: NOW })).toMatchObject({ empty: "No record has a value in Due date yet.", cta: { disabledReason: expect.any(String) } });
  });
});

describe("needs attention", () => {
  const d = computeTile(tile({ type: "attention" }), ctx);
  if (d?.type !== "attention") throw new Error("wrong type");
  it("finds overdue (a past date while the status is open), empty required and estimated, by mechanism", () => {
    const by = Object.fromEntries(d.items.map((i) => [i.id, i.reasons]));
    expect(by[rows[0].id]).toEqual(["Overdue · Due date 1 Oct"]);
    expect(by[rows[1].id]).toBeUndefined(); // past, but its status is finished
    expect(by[rows[2].id]).toBeUndefined(); // future
    expect(by[rows[3].id]).toEqual(["Missing title", "Alpha estimated a value"]); // 15 Sep is past but "lost" is finished
    expect(d.total).toBe(2);
    expect(d.items[0].id).toBe(rows[3].id); // most reasons first
  });
  it("shows an untitled record as Untitled, and offers all of them", () => {
    expect(d.items[0].title).toBe("Untitled");
    expect(d.cta).toMatchObject({ text: "Show all 2", label: "Needs attention · 2", ids: [rows[0].id, rows[3].id] });
  });
  it("finds assumed values and rows that are gone", () => {
    const r = [row({ title: "X" }, { provenance: { assumed: "USD" } }), row({ title: "Y" }, { gone_at: "2026-10-03T08:00:00+00:00" })];
    const a = computeTile(tile({ type: "attention" }), { fields, rows: r, now: NOW });
    if (a?.type !== "attention") throw new Error("wrong type");
    expect(a.items.map((i) => i.reasons)).toEqual([["Alpha assumed: USD"], ["Gone since 3 Oct"]]);
  });
  it("is not overdue without a status that can be finished", () => {
    const a = computeTile(tile({ type: "attention" }), { fields: [{ name: "due", kind: "date" }], rows: [row({ due: "2020-01-01" })], now: NOW });
    expect(a).toMatchObject({ total: 0, empty: "Nothing needs attention.", cta: { disabledReason: "Nothing needs attention right now." } });
  });
  it("caps the list at six and still offers every one", () => {
    const many = Array.from({ length: 9 }, () => row({ title: "" }));
    const a = computeTile(tile({ type: "attention" }), { fields, rows: many, now: NOW });
    if (a?.type !== "attention") throw new Error("wrong type");
    expect(a.items).toHaveLength(6);
    expect(a.cta.ids).toHaveLength(9);
  });
});
