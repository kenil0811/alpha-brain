/** Which views a table is offered, and how a view's config follows a switch or a removed field. */
import { describe, expect, it } from "vitest";
import { computeEligibleKinds, ineligibleReason, migrateViewConfig, viewConfigForKind, type TableShape } from "./eligibility";

const plain: TableShape = { name: "notes", fields: [{ name: "title", kind: "text" }, { name: "body", kind: "long_text" }] };
const deals: TableShape = {
  name: "deals",
  fields: [
    { name: "name", kind: "text" },
    { name: "stage", kind: "status", choices: ["sourced", "closed"] },
    { name: "close_date", kind: "date" },
    { name: "tags", kind: "multichoice", choices: ["ai"] },
    { name: "company", kind: "relation", relation: "companies" },
    { name: "parent", kind: "relation", relation: "deals" },
    { name: "location", kind: "text" },
  ],
};

describe("eligibility", () => {
  it("offers a plain table only the views that need no driver field", () => {
    expect(computeEligibleKinds(plain)).toEqual(["table", "list", "gallery", "form"]);
  });
  it("offers all eleven when every driver is there", () => {
    expect(computeEligibleKinds(deals)).toHaveLength(11);
  });
  it("tells a graph from a tree by where the link points", () => {
    const graphOnly = { name: "deals", fields: [{ name: "company", kind: "relation", relation: "companies" }] };
    const treeOnly = { name: "deals", fields: [{ name: "parent", kind: "relation", relation: "deals" }] };
    expect(computeEligibleKinds(graphOnly)).toContain("graph");
    expect(computeEligibleKinds(graphOnly)).not.toContain("tree");
    expect(computeEligibleKinds(treeOnly)).toContain("tree");
    expect(computeEligibleKinds(treeOnly)).not.toContain("graph");
  });
  it("finds a place field by its name or label", () => {
    expect(computeEligibleKinds({ name: "t", fields: [{ name: "hq", kind: "text", label: "Head office city" }] })).toContain("map");
    expect(computeEligibleKinds({ name: "t", fields: [{ name: "where", kind: "number" }] })).not.toContain("map");
  });
  it("says why a view isn't offered", () => {
    expect(ineligibleReason("calendar")).toBe("Needs a date field");
    expect(ineligibleReason("table")).toBe("");
  });
});

describe("switching views", () => {
  it("fills the field that drives the view", () => {
    expect(viewConfigForKind(deals, "board").groupBy).toBe("stage");
    expect(viewConfigForKind(deals, "calendar").dateBy).toBe("close_date");
    expect(viewConfigForKind(deals, "map").locationBy).toBe("location");
    expect(viewConfigForKind(deals, "graph").relationBy).toBe("company");
    expect(viewConfigForKind(deals, "tree").parentBy).toBe("parent");
  });
  it("keeps what the person set when it still fits", () => {
    const next = viewConfigForKind(deals, "chart", { kind: "table", groupBy: "tags", sorts: [{ id: "name", dir: "asc" }] });
    expect(next).toMatchObject({ kind: "chart", groupBy: "tags", sorts: [{ id: "name", dir: "asc" }] });
    expect(viewConfigForKind(deals, "board", { groupBy: "tags" }).groupBy).toBe("stage");
  });
  it("drops removed fields and falls back to a table for a view that no longer fits", () => {
    const read = migrateViewConfig(plain, { kind: "board", groupBy: "stage", sorts: [{ id: "gone", dir: "asc" }], rowFilters: [{ field: "title", op: "contains", value: "x" }] });
    expect(read.kind).toBe("table");
    expect(read.groupBy).toBeNull();
    expect(read.sorts).toEqual([]);
    expect(read.rowFilters).toHaveLength(1);
    expect(migrateViewConfig(deals, { kind: "nonsense" as never }).kind).toBe("table");
  });
});
