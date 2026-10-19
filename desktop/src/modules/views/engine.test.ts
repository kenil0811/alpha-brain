import { describe, expect, it } from "vitest";
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { activeRules, applyQuery, isComplete, tintOf, toneOf, NO_COLOURS, groupItems, groupRows, pageOfGroups, byDay, byMonth, compare, groupBy, matchRule, nextSort, ofKinds, opsFor, pageOf, provenanceCounts, ruleFor, sortRows, sortsAfterClick, footerValue, footersOf, withRule, type FilterRule } from "./engine";

const row = (id: string, values: Record<string, unknown>, extra: Partial<RecordRow> = {}): RecordRow => ({ id, revision: 1, values, created_at: "2026-10-01T08:00:00+00:00", updated_at: "2026-10-01T08:00:00+00:00", provenance: {}, ...extra });
const status = { name: "status", kind: "status", choices: ["Active", "Pending", "Sold"], done_choices: ["Sold"] };
const rows = [
  row("a", { title: "Bakery", price: 300, status: "Active", when: "2026-10-02" }),
  row("b", { title: "Cafe", price: 120, status: "Sold", when: "2026-10-02" }),
  row("c", { title: "Dental practice", price: null, status: "Pending", when: "2026-10-05" }, { provenance: { estimated: true } }),
  row("d", { title: "Gone shop", price: 50, status: "Active" }, { gone_at: "2026-10-03T00:00:00+00:00", provenance: { assumed: "the price" } }),
];
const base = { search: "", searchable: ["title"], filters: {}, hideDone: false, statusField: status, showGone: false, sorts: [] };

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
    expect(applyQuery(rows, { ...base, sorts: [{ field: "price", direction: "asc" }] }).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(applyQuery(rows, { ...base, sorts: [{ field: "price", direction: "desc" }] }).map((r) => r.id)).toEqual(["a", "b", "c"]);
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
    expect(footersOf(["title", "price"], byName, {})).toEqual({ title: "none", price: "sum" });
    expect(footerValue(rows, { name: "price", kind: "number" }, "sum")).toBe("470");
    expect(provenanceCounts(rows)).toEqual({ estimated: 1, assumed: 1, checked: 0 });
    const mark = { at: "2026-10-16T10:00:00Z", by: "a_1", agree: true, source: "ocado.com" };
    expect(provenanceCounts([...rows, row("e", { title: "Shake" }, { provenance: { checked: mark } }), row("f", { title: "Site" }, { provenance: { fields: { households: { part: "checks", checked: mark } } } })]).checked).toBe(2);
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

describe("filter rules and several sorts (section 3a)", () => {
  const fields = new Map<string, FieldInfo>([
    ["title", { name: "title", kind: "text" }],
    ["price", { name: "price", kind: "number" }],
    ["status", status],
    ["when", { name: "when", kind: "date" }],
    ["done", { name: "done", kind: "bool" }],
    ["tags", { name: "tags", kind: "multichoice", choices: ["red", "blue"] }],
  ]);
  const one = (values: Record<string, unknown>, rule: FilterRule, now = new Date("2026-10-13T12:00:00")) => matchRule(row("x", values), rule, fields.get(rule.field), now);

  it("offers conditions that fit the field's kind", () => {
    expect(opsFor("text")[0]).toBe("is");
    expect(opsFor("number")).toContain("between");
    expect(opsFor("date")).toContain("within");
    expect(opsFor("bool")).toEqual(["checked", "unchecked"]);
    expect(opsFor("status")).toEqual(["in"]); // a choice column is a ticklist
  });

  it("matches text, numbers, dates, choices, ticks and empties", () => {
    expect(one({ title: "Bakery Hill" }, { field: "title", op: "contains", value: "bakery" })).toBe(true);
    expect(one({ title: "Bakery Hill" }, { field: "title", op: "starts", value: "hill" })).toBe(false);
    expect(one({ title: "Bakery Hill" }, { field: "title", op: "ends", value: "HILL" })).toBe(true);
    expect(one({ price: 300 }, { field: "price", op: "gt", value: "120" })).toBe(true);
    expect(one({ price: 120 }, { field: "price", op: "lte", value: "120" })).toBe(true);
    expect(one({ price: null }, { field: "price", op: "gt", value: "1" })).toBe(false);
    expect(one({ when: "2026-10-10" }, { field: "when", op: "within", value: "7" })).toBe(true);
    expect(one({ when: "2026-10-01" }, { field: "when", op: "within", value: "7" })).toBe(false);
    expect(one({ when: "2026-10-02" }, { field: "when", op: "before", value: "2026-10-05" })).toBe(true);
    expect(one({ status: "Sold" }, { field: "status", op: "is_not", value: "Sold" })).toBe(false);
    expect(one({ tags: ["red"] }, { field: "tags", op: "contains", value: "red" })).toBe(true);
    expect(one({ done: true }, { field: "done", op: "checked", value: "" })).toBe(true);
    expect(one({ price: "" }, { field: "price", op: "empty", value: "" })).toBe(true);
    expect(one({ price: 150 }, { field: "price", op: "between", value: "100", value2: "200" })).toBe(true);
    expect(one({ price: 250 }, { field: "price", op: "between", value: "", value2: "200" })).toBe(false);
    expect(one({ status: "Sold" }, { field: "status", op: "in", value: "", values: ["Active", ""] })).toBe(false);
    expect(one({ status: null }, { field: "status", op: "in", value: "", values: ["Active", ""] })).toBe(true);
    // a rule still missing its value holds for every row, so a half-made rule hides nothing
    expect(one({ title: "x" }, { field: "title", op: "is", value: "" })).toBe(true);
  });

  it("all or any of the rules, through the view's query", () => {
    const rules = { match: "all" as const, rules: [{ field: "price", op: "gt" as const, value: "100" }, { field: "status", op: "is" as const, value: "Active" }] };
    expect(applyQuery(rows, { ...base, rules, byName: fields }).map((r) => r.id)).toEqual(["a"]);
    expect(applyQuery(rows, { ...base, rules: { ...rules, match: "any" }, byName: fields }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(activeRules({ match: "all", rules: [{ field: "title", op: "is", value: "" }, { field: "price", op: "empty", value: "" }] }, fields)).toHaveLength(1);
  });

  it("sorts by several fields, the first deciding first, empty values last", () => {
    const xs = [row("1", { s: "b", p: 1 }), row("2", { s: "a", p: 2 }), row("3", { s: "a", p: 9 }), row("4", { s: null, p: 5 })];
    expect(sortRows(xs, [{ field: "s", direction: "asc" }, { field: "p", direction: "desc" }]).map((r) => r.id)).toEqual(["3", "2", "1", "4"]);
    expect(sortRows(xs, [{ field: "s", direction: "desc" }]).map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("a column's header and menu (section 3a)", () => {
  it("a click sorts by that column alone; shift adds it as the next level, or turns it around", () => {
    const one = sortsAfterClick([], "price", false);
    expect(one).toEqual([{ field: "price", direction: "asc" }]);
    const two = sortsAfterClick(one, "title", true);
    expect(two).toEqual([{ field: "price", direction: "asc" }, { field: "title", direction: "asc" }]);
    expect(sortsAfterClick(two, "title", true)[1].direction).toBe("desc");
    expect(sortsAfterClick(two, "title", false)).toEqual([{ field: "title", direction: "asc" }]);
  });

  it("one filter per column, set and taken off", () => {
    const r = withRule({ match: "all", rules: [] }, "price", { field: "price", op: "gt", value: "1" });
    expect(ruleFor(withRule(r, "price", { field: "price", op: "lt", value: "9" }), "price")?.op).toBe("lt");
    expect(withRule(r, "price", null).rules).toEqual([]);
  });
});

describe("grouping a table (section 3b)", () => {
  it("keeps a choice's own order, puts Empty last, and labels ticks, months and links", () => {
    const xs = [row("1", { s: "Sold" }), row("2", { s: "Active" }), row("3", { s: null }), row("4", { s: "Active" })];
    const byStatus = groupRows(xs, { name: "s", kind: "status", choices: ["Active", "Pending", "Sold"] });
    expect(byStatus.map((g) => [g.label, g.rows.length])).toEqual([["Active", 2], ["Sold", 1], ["Empty", 1]]);
    expect(groupRows([row("1", { t: true }), row("2", { t: null })], { name: "t", kind: "bool" }).map((g) => g.label)).toEqual(["Ticked", "Not ticked"]);
    const months = groupRows([row("1", { d: "2026-10-02" }), row("2", { d: "2026-09-30" }), row("3", { d: "2026-10-20" })], { name: "d", kind: "date" });
    expect(months.map((g) => g.rows.length)).toEqual([1, 2]);
    const links = groupRows([row("1", { c: "c1" }), row("2", { c: "c2" })], { name: "c", kind: "relation" }, { c: { c1: "Zeta Ltd", c2: "Acme" } });
    expect(links.map((g) => g.label)).toEqual(["Acme", "Zeta Ltd"]);
  });

  it("lists each group's header then its rows, a folded group without them; a page inside a group repeats its header", () => {
    const groups = groupRows([row("1", { s: "A" }), row("2", { s: "A" }), row("3", { s: "B" })], { name: "s", kind: "choice", choices: ["A", "B"] });
    const items = groupItems(groups, new Set(["B"]));
    expect(items.map((i) => (i.kind === "group" ? `#${i.key}${i.folded ? "-" : ""}` : i.row.id))).toEqual(["#A", "1", "2", "#B-"]);
    const second = pageOfGroups(groupItems(groups, new Set()), 1, 2);
    expect(second.items.map((i) => (i.kind === "group" ? `#${i.key}${i.continued ? "…" : ""}` : i.row.id))).toEqual(["#A…", "2", "#B"]);
  });
});

describe("a table's colours (section 4d)", () => {
  const status = { name: "s", kind: "status", choices: ["Active", "Sold"] };
  it("a value's tone, a row's tint, and a condition's tone", () => {
    const colours = { ...NO_COLOURS, tint: "s", values: { s: { Sold: "bad" as const } }, rules: { p: { op: "gt" as const, value: "100", tone: "warn" as const } } };
    expect(toneOf(row("1", { s: "Sold" }), status, colours)).toBe("bad");
    expect(toneOf(row("1", { s: "Active" }), status, colours)).toBeNull();
    expect(tintOf(row("1", { s: "Sold" }), colours)).toBe("bad");
    expect(toneOf(row("1", { p: 150 }), { name: "p", kind: "number" }, colours)).toBe("warn");
    expect(toneOf(row("1", { p: 50 }), { name: "p", kind: "number" }, colours)).toBeNull();
    expect(toneOf(row("1", { p: null }), { name: "p", kind: "number" }, colours)).toBeNull();
    const empties = { ...NO_COLOURS, rules: { t: { op: "empty" as const, value: "", tone: "bad" as const } } };
    expect(toneOf(row("1", { t: "" }), { name: "t", kind: "text" }, empties)).toBe("bad");
    expect(toneOf(row("1", { t: "x" }), { name: "t", kind: "text" }, empties)).toBeNull();
  });
});

describe("days that move with the clock (P1)", () => {
  const f = { name: "due", kind: "date" } as const;
  const row = (due: string) => ({ id: due, revision: 1, created_at: "", updated_at: "", provenance: {}, values: { due } });
  const now = new Date(2026, 9, 21, 12); // a Wednesday
  it("today, this week, before today and the next days", () => {
    expect(matchRule(row("2026-10-21"), { field: "due", op: "today", value: "" }, f, now)).toBe(true);
    expect(matchRule(row("2026-10-22"), { field: "due", op: "today", value: "" }, f, now)).toBe(false);
    expect(matchRule(row("2026-10-19"), { field: "due", op: "this_week", value: "" }, f, now)).toBe(true);
    expect(matchRule(row("2026-10-25"), { field: "due", op: "this_week", value: "" }, f, now)).toBe(true);
    expect(matchRule(row("2026-10-26"), { field: "due", op: "this_week", value: "" }, f, now)).toBe(false);
    expect(matchRule(row("2026-10-20"), { field: "due", op: "before_today", value: "" }, f, now)).toBe(true);
    expect(matchRule(row("2026-10-21"), { field: "due", op: "before_today", value: "" }, f, now)).toBe(false);
    expect(matchRule(row("2026-10-24"), { field: "due", op: "next_days", value: "3" }, f, now)).toBe(true);
    expect(matchRule(row("2026-10-25"), { field: "due", op: "next_days", value: "3" }, f, now)).toBe(false);
    expect(isComplete({ field: "due", op: "today", value: "" })).toBe(true);
  });
});

