import { describe, expect, it } from "vitest";
import type { RecordRow } from "../../core/client";
import { applyQuery, byDay, byMonth, chartPoints, colorsOf, compare, groupBy, groupRows, matchRule, nextSort, ofKinds, opsFor, pageOf, pinnedFirst, provenanceCounts, resolveDay, sortRows, summarize, summaryOpsFor, defaultSummary } from "./engine";

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
  it("counts estimates and assumptions", () => {
    expect(provenanceCounts(rows)).toEqual({ estimated: 1, assumed: 1 });
  });
  it("narrows to an id set, as the dashboard's Show these records does", () => {
    expect(applyQuery(rows, { ...base, ids: new Set(["b", "c", "d"]) }).map((r) => r.id)).toEqual(["b", "c"]);
    expect(applyQuery(rows, { ...base, ids: null }).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("puts pinned records first, each group keeping its order", () => {
    expect(pinnedFirst(rows, ["c", "b"]).map((r) => r.id)).toEqual(["b", "c", "a", "d"]);
    expect(pinnedFirst(rows, [])).toBe(rows);
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

describe("footer summaries", () => {
  const price = { name: "price", kind: "number", unit: "£" };
  const when = { name: "when", kind: "date" };
  it("offers each kind its own choices, and numbers add up by default", () => {
    expect(summaryOpsFor("number")).toContain("sum");
    expect(summaryOpsFor("date")).toContain("earliest");
    expect(summaryOpsFor("text")).toEqual(["none", "count_all", "count", "unique", "empty", "not_empty", "percent_empty", "filled"]);
    expect(summaryOpsFor("bool")).toContain("percent_checked");
    expect(summaryOpsFor("status")).toContain("per_group");
    expect(summaryOpsFor("text")).not.toContain("sum");
    expect(defaultSummary("number")).toBe("sum");
    expect(defaultSummary("text")).toBe("none");
  });
  it("works each one out over the records, and says '—' rather than guess", () => {
    expect(summarize(rows, price, "sum")).toEqual({ label: "Sum", value: "470 £" });
    expect(summarize(rows, price, "average")?.value).toBe("156.7 £");
    expect(summarize(rows, price, "min")?.value).toBe("50 £");
    expect(summarize(rows, price, "max")?.value).toBe("300 £");
    expect(summarize(rows, price, "count")?.value).toBe("3");
    expect(summarize(rows, price, "filled")?.value).toBe("75%");
    expect(summarize(rows, when, "earliest")?.value).toBe("2 Oct");
    expect(summarize(rows, when, "latest")?.value).toBe("5 Oct");
    expect(summarize([], price, "sum")?.value).toBe("—");
    expect(summarize(rows, price, "none")).toBeNull();
  });
  it("has Notion's whole set: counts, percents, median, range, date range, checks, per group", () => {
    expect(summarize(rows, price, "count_all")?.value).toBe("4");
    expect(summarize(rows, price, "empty")?.value).toBe("1");
    expect(summarize(rows, price, "percent_empty")?.value).toBe("25%");
    expect(summarize(rows, status, "unique")?.value).toBe("3");
    expect(summarize(rows, price, "median")?.value).toBe("120 £");
    expect(summarize(rows, price, "range")?.value).toBe("250 £");
    expect(summarize(rows, when, "date_range")?.value).toBe("3 days");
    expect(summarize(rows, status, "per_group")?.value).toBe("Active 2 · Pending 1 · Sold 1");
    const done = { name: "done", kind: "bool" };
    const ticks = [row("x", { done: true }), row("y", { done: false }), row("z", { done: null })];
    expect(summarize(ticks, done, "checked")?.value).toBe("1");
    expect(summarize(ticks, done, "unchecked")?.value).toBe("2");
    expect(summarize(ticks, done, "percent_checked")?.value).toBe("33%");
  });
});

describe("Notion's filters, sorts, groups and colours", () => {
  const fields = [{ name: "title", kind: "text" }, { name: "price", kind: "number" }, status, { name: "when", kind: "date" }, { name: "tags", kind: "multichoice" }, { name: "done", kind: "bool" }];
  const byName = new Map(fields.map((f) => [f.name, f]));
  const ids = (rs: RecordRow[]) => rs.map((r) => r.id);
  const now = new Date(2026, 9, 9);
  const live = rows.slice(0, 3);
  const match = (rule: import("./engine").FilterRule) => ids(live.filter((r) => matchRule(r, rule, byName.get(rule.field), now)));

  it("has per-kind operators, and an unfinished rule narrows nothing", () => {
    expect(opsFor("number")).toContain("ge");
    expect(opsFor("date")).toContain("within");
    expect(opsFor("bool")).toEqual(["checked", "unchecked"]);
    expect(opsFor("text")).toContain("starts");
    expect(match({ field: "title", op: "contains", value: "" })).toEqual(["a", "b", "c"]);
  });
  it("matches text, numbers, choices and emptiness", () => {
    expect(match({ field: "title", op: "starts", value: "ca" })).toEqual(["b"]);
    expect(match({ field: "title", op: "ends", value: "PRACTICE" })).toEqual(["c"]);
    expect(match({ field: "title", op: "not_contains", value: "a" })).toEqual([]);
    expect(match({ field: "price", op: "gt", value: "150" })).toEqual(["a"]);
    expect(match({ field: "price", op: "le", value: "120" })).toEqual(["b"]);
    expect(match({ field: "price", op: "empty" })).toEqual(["c"]);
    expect(match({ field: "status", op: "is_not", value: "Sold" })).toEqual(["a", "c"]);
  });
  it("matches dates by exact day, by relative words and within a span", () => {
    expect(resolveDay("tomorrow", now)).toBe("2026-10-10");
    expect(resolveDay("month_ago", now)).toBe("2026-09-09");
    expect(match({ field: "when", op: "is", value: "2026-10-02" })).toEqual(["a", "b"]);
    expect(match({ field: "when", op: "on_after", value: "2026-10-05" })).toEqual(["c"]);
    expect(match({ field: "when", op: "within", value: "past_week" })).toEqual(["a", "b", "c"]);
    expect(match({ field: "when", op: "within", value: "next_week" })).toEqual([]);
  });
  it("matches checkboxes and multi-choices", () => {
    const r = [row("x", { done: true, tags: ["Hot", "New"] }), row("y", { done: false, tags: ["Cold"] })];
    expect(r.filter((x) => matchRule(x, { field: "done", op: "checked" }, byName.get("done"))).map((x) => x.id)).toEqual(["x"]);
    expect(r.filter((x) => matchRule(x, { field: "tags", op: "contains", value: "new" }, byName.get("tags"))).map((x) => x.id)).toEqual(["x"]);
  });
  it("joins rules with And or Or, one group nested", () => {
    const g = { join: "or" as const, rules: [{ field: "status", op: "is" as const, value: "Sold" }, { join: "and" as const, rules: [{ field: "price", op: "gt" as const, value: "100" }, { field: "title", op: "contains" as const, value: "bak" }] }] };
    expect(ids(applyQuery(rows, { ...base, fields, advanced: g }))).toEqual(["a", "b"]);
    expect(ids(applyQuery(rows, { ...base, fields, advanced: { ...g, join: "and" } }))).toEqual([]);
    expect(ids(applyQuery(rows, { ...base, fields, rules: [{ field: "price", op: "ne", value: "300" }] }))).toEqual(["b", "c"]);
  });
  it("sorts by several fields, the first deciding first, choices by their order", () => {
    const sorted = sortRows(live, [{ field: "when", direction: "asc" }, { field: "price", direction: "desc" }], byName);
    expect(ids(sorted)).toEqual(["a", "b", "c"]);
    expect(ids(sortRows(live, [{ field: "status", direction: "desc" }], byName))).toEqual(["b", "c", "a"]);
    expect(ids(applyQuery(rows, { ...base, fields, sorts: [{ field: "price", direction: "asc" }] }))).toEqual(["b", "a", "c"]);
  });
  it("groups by any field, empty last, sorted or hidden when empty", () => {
    expect(groupRows(live, status).map((g) => [g.label, g.rows.length])).toEqual([["Active", 1], ["Pending", 1], ["Sold", 1]]);
    expect(groupRows(live, byName.get("when")!).map((g) => g.label)).toEqual(["Oct 2026"]);
    expect(groupRows(live, byName.get("price")!, { order: "desc" }).map((g) => g.key)).toEqual(["300", "120", ""]);
    expect(groupRows(live, byName.get("price")!).at(-1)?.label).toBe("No price");
    expect(groupRows([live[0]], status, { hideEmpty: true }).map((g) => g.key)).toEqual(["Active"]);
    expect(groupRows([row("x", { done: true })], byName.get("done")!).map((g) => [g.label, g.rows.length])).toEqual([["Checked", 1], ["Unchecked", 0]]);
  });
  it("colours a row or a cell by the first rule that matches", () => {
    const rules = [{ field: "price", op: "gt" as const, value: "200", tone: "good" as const, target: "row" as const }, { field: "price", op: "gt" as const, value: "100", tone: "bad" as const, target: "row" as const }, { field: "status", op: "is" as const, value: "Sold", tone: "info" as const, target: "cell" as const }];
    expect(colorsOf(live[0], rules, byName)).toEqual({ row: "good", cells: {} });
    expect(colorsOf(live[1], rules, byName)).toEqual({ row: "bad", cells: { status: "info" } });
    expect(colorsOf(live[2], rules, byName)).toEqual({ cells: {} });
  });
  it("charts a count per day or a sum per group", () => {
    expect(chartPoints(live, byName.get("when")!, { agg: "count" }).map((p) => p.value)).toEqual([2, 1]);
    expect(chartPoints(live, status, { agg: "sum", field: "price" }).map((p) => [p.label, p.value])).toEqual([["Active", 300], ["Pending", 0], ["Sold", 120]]);
  });
});
