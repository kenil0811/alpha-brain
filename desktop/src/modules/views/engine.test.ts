import { describe, expect, it } from "vitest";
import type { RecordRow } from "../../core/client";
import { applyQuery, byDay, byMonth, compare, groupBy, nextSort, ofKinds, pageOf, provenanceCounts, totalsFor } from "./engine";

const row = (id: string, values: Record<string, unknown>, extra: Partial<RecordRow> = {}): RecordRow => ({ id, revision: 1, values, created_at: "2026-10-01T08:00:00+00:00", updated_at: "2026-10-01T08:00:00+00:00", provenance: {}, ...extra });
const status = { name: "status", kind: "status", choices: ["Active", "Pending", "Sold"], done_choices: ["Sold"] };
const rows = [
  row("a", { title: "Bakery", price: 300, status: "Active", when: "2026-10-02" }),
  row("b", { title: "Cafe", price: 120, status: "Sold", when: "2026-10-02" }),
  row("c", { title: "Dental practice", price: null, status: "Pending", when: "2026-10-05" }, { provenance: { estimated: true } }),
  row("d", { title: "Gone shop", price: 50, status: "Active" }, { gone_at: "2026-10-03T00:00:00+00:00", provenance: { assumed: "the price" } }),
];
const base = { search: "", searchable: ["title"], filters: {}, hideDone: false, statusField: status, showGone: false, sort: null };

describe("a view's query", () => {
  it("hides gone rows unless asked, and done rows when asked", () => {
    expect(applyQuery(rows, base).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(applyQuery(rows, { ...base, showGone: true }).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(applyQuery(rows, { ...base, hideDone: true }).map((r) => r.id)).toEqual(["a", "c"]);
  });
  it("searches the searchable fields and filters by exact value", () => {
    expect(applyQuery(rows, { ...base, search: "CAF" }).map((r) => r.id)).toEqual(["b"]);
    expect(applyQuery(rows, { ...base, filters: { status: "Pending" } }).map((r) => r.id)).toEqual(["c"]);
    expect(applyQuery(rows, { ...base, filters: { status: "" } }).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("sorts with empty values last, numbers by value", () => {
    expect(applyQuery(rows, { ...base, sort: { field: "price", direction: "asc" } }).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(applyQuery(rows, { ...base, sort: { field: "price", direction: "desc" } }).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(compare("item 2", "item 10")).toBeLessThan(0);
  });
  it("cycles a column's sort: ascending, descending, none", () => {
    const a = nextSort(null, "price");
    expect(a).toEqual({ field: "price", direction: "asc" });
    expect(nextSort(a, "price")).toEqual({ field: "price", direction: "desc" });
    expect(nextSort({ field: "price", direction: "desc" }, "price")).toBeNull();
    expect(nextSort(a, "title")).toEqual({ field: "title", direction: "asc" });
  });
  it("pages, clamping the page to what exists", () => {
    expect(pageOf([1, 2, 3, 4, 5], 1, 2)).toEqual({ rows: [3, 4], at: 1, pages: 3 });
    expect(pageOf([1, 2, 3], 9, 2)).toEqual({ rows: [3], at: 1, pages: 2 });
    expect(pageOf([], 0, 10)).toEqual({ rows: [], at: 0, pages: 1 });
  });
  it("totals numeric columns and counts estimates and assumptions", () => {
    const byName = new Map([["price", { name: "price", kind: "number" }], ["title", { name: "title", kind: "text" }]]);
    expect(totalsFor(rows, ["title", "price"], byName)).toEqual([{ field: "price", value: 470 }]);
    expect(provenanceCounts(rows)).toEqual({ estimated: 1, assumed: 1 });
  });
  it("groups by a field in the field's own order and buckets days", () => {
    expect(groupBy(rows, status).map((g) => [g.key, g.rows.length])).toEqual([["Active", 2], ["Pending", 1], ["Sold", 1]]);
    const days = byDay(rows, { name: "when", kind: "date" });
    expect([...days.keys()]).toEqual(["2026-10-02", "2026-10-05"]);
    expect(days.get("2026-10-02")?.length).toBe(2);
  });
});

describe("time and field helpers", () => {
  it("buckets months newest first and lists the fields of some kinds", () => {
    const months = byMonth([...rows, row("e", { title: "Older", when: "2026-09-12" })], { name: "when", kind: "date" });
    expect(months.map((m) => [m.month, m.rows.map((r) => r.id)])).toEqual([["2026-10", ["c", "a", "b"]], ["2026-09", ["e"]]]);
    expect(ofKinds([status, { name: "when", kind: "date" }, { name: "n", kind: "number" }], new Set(["date", "datetime"])).map((f) => f.name)).toEqual(["when"]);
  });
});
