/** The table engine: filter, sort, group, footer reductions, search and places. */
import { describe, expect, it } from "vitest";
import { applyFilters, applySorts, computeAggregate, dayFromToday, filterOpsForKind, filterRowsByQuery, groupBy, NO_VALUE, parseLocationValue, type DataRow } from "./engine";

const rows: DataRow[] = [
  { id: "1", name: "Ember", stage: "sourced", amount: 300, close: "2026-09-06", tags: ["ai", "saas"], done: true },
  { id: "2", name: "Kite", stage: "closed", amount: 120, close: "2026-10-01T10:00:00", tags: ["ai"], done: false },
  { id: "3", name: "Atlas", stage: "sourced", amount: null, close: "", tags: [], done: false },
  { id: "4", name: "Vela", stage: null, amount: 50, close: "2026-11-20", tags: ["health"], done: true },
];
const ids = (xs: DataRow[]) => xs.map((r) => r.id);
const kinds = { amount: "number", close: "date", stage: "status" };

describe("filters", () => {
  it("matches all or any of several conditions", () => {
    const f = [
      { field: "stage", op: "is" as const, value: "sourced" },
      { field: "amount", op: "gt" as const, value: "100" },
    ];
    expect(ids(applyFilters(rows, f, "all", kinds))).toEqual(["1"]);
    expect(ids(applyFilters(rows, f, "any", kinds))).toEqual(["1", "2", "3"]);
  });
  it("never lets a number comparison match an empty cell", () => {
    expect(ids(applyFilters(rows, [{ field: "amount", op: "lt", value: "1000" }], "all", kinds))).toEqual(["1", "2", "4"]);
  });
  it("fills in a day relative to today, so a saved list stays current", () => {
    const today = dayFromToday(0);
    const near: DataRow[] = [
      { id: "a", close: dayFromToday(-3) },
      { id: "b", close: dayFromToday(-10) },
      { id: "c", close: `${today}T09:00:00` },
    ];
    expect(ids(applyFilters(near, [{ field: "close", op: "on_or_after", value: { $today: -6 } }], "all", kinds))).toEqual(["a", "c"]);
    expect(ids(applyFilters(near, [{ field: "close", op: "is", value: { $today: 0 } }], "all", kinds))).toEqual(["c"]);
    expect(dayFromToday(-1, new Date(2026, 2, 1))).toBe("2026-02-28");
  });
  it("compares dates as days", () => {
    expect(ids(applyFilters(rows, [{ field: "close", op: "is", value: "2026-10-01" }], "all", kinds))).toEqual(["2"]);
    expect(ids(applyFilters(rows, [{ field: "close", op: "before", value: "2026-10-01" }], "all", kinds))).toEqual(["1"]);
  });
  it("reads any-of and none-of over lists and empties", () => {
    expect(ids(applyFilters(rows, [{ field: "tags", op: "is_any_of", value: "health, saas" }]))).toEqual(["1", "4"]);
    expect(ids(applyFilters(rows, [{ field: "stage", op: "is_none_of", value: "closed" }]))).toEqual(["1", "3", "4"]);
    expect(ids(applyFilters(rows, [{ field: "amount", op: "is_empty", value: "" }]))).toEqual(["3"]);
    expect(ids(applyFilters(rows, [{ field: "done", op: "is_checked", value: "" }]))).toEqual(["1", "4"]);
  });
  it("ignores a condition with no value yet", () => {
    expect(applyFilters(rows, [{ field: "name", op: "contains", value: "" }])).toHaveLength(4);
  });
  it("offers the operators that make sense for a kind", () => {
    expect(filterOpsForKind("number")).toContain("gt");
    expect(filterOpsForKind("number")).not.toContain("contains");
    expect(filterOpsForKind("bool")).toContain("is_checked");
    expect(filterOpsForKind("date")).toContain("before");
  });
});

describe("sorts", () => {
  it("sorts by several fields and keeps empties last", () => {
    expect(ids(applySorts(rows, [{ id: "amount", dir: "desc" }]))).toEqual(["1", "2", "4", "3"]);
    expect(ids(applySorts(rows, [{ id: "amount", dir: "asc" }]))).toEqual(["4", "2", "1", "3"]);
    expect(ids(applySorts(rows, [{ id: "stage", dir: "asc" }, { id: "name", dir: "desc" }]))).toEqual(["2", "1", "3", "4"]);
  });
});

describe("groups", () => {
  it("keeps the field's choice order and puts no value last", () => {
    const groups = groupBy(rows, "stage", ["sourced", "closed"]);
    expect(groups.map(([k, g]) => [k, ids(g)])).toEqual([
      ["sourced", ["1", "3"]],
      ["closed", ["2"]],
      [NO_VALUE, ["4"]],
    ]);
  });
});

describe("footer reductions", () => {
  const amounts = rows.map((r) => r.amount);
  it("skips empty cells instead of counting them as zero", () => {
    expect(computeAggregate(amounts, "sum").value).toBe(470);
    expect(computeAggregate(amounts, "average").value).toBeCloseTo(156.67, 2);
    expect(computeAggregate(amounts, "median").value).toBe(120);
    expect(computeAggregate(amounts, "range").value).toBe(250);
  });
  it("counts rows, filled, empty and unique", () => {
    expect(computeAggregate(amounts, "count")).toEqual({ kind: "count", value: 4, isCount: true });
    expect(computeAggregate(amounts, "empty").value).toBe(1);
    expect(computeAggregate(amounts, "filled").value).toBe(3);
    expect(computeAggregate(rows.map((r) => r.stage), "unique").value).toBe(2);
  });
  it("has no average of nothing", () => {
    expect(computeAggregate([null, ""], "average").value).toBeNull();
  });
});

describe("search", () => {
  it("finds a row by any value but not by its id", () => {
    expect(ids(filterRowsByQuery(rows, "HEALTH"))).toEqual(["4"]);
    expect(filterRowsByQuery([{ id: "r_zz", name: "Atlas" }], "r_zz")).toEqual([]);
  });
});

describe("places", () => {
  it("reads names, coordinates and both", () => {
    expect(parseLocationValue("Lisbon, Portugal")).toEqual({ label: "Lisbon, Portugal", coordinate: null });
    expect(parseLocationValue("38.72, -9.14")?.coordinate).toEqual({ latitude: 38.72, longitude: -9.14 });
    expect(parseLocationValue("Lisbon | 38.72, -9.14")).toEqual({ label: "Lisbon", coordinate: { latitude: 38.72, longitude: -9.14 } });
    expect(parseLocationValue("95, 10")?.coordinate).toBeNull();
    expect(parseLocationValue(42)).toBeNull();
  });
});
