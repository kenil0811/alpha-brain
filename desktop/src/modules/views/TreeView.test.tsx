import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { TreeView, placesOf } from "./TreeView";

const fields: FieldInfo[] = [
  { name: "title", kind: "text" },
  { name: "state", kind: "status", choices: ["Open", "Done"], done_choices: ["Done"] },
  { name: "anchor", kind: "text" },
  { name: "parent", kind: "relation", relation: "alpha_tasks" },
];
const task = (id: string, title: string, words: string | null, parent?: string): RecordRow => ({
  id, revision: 1, created_at: "", updated_at: "", provenance: {},
  values: { title, state: "Open", anchor: words ? `#/${id}` : null, parent: parent ?? null },
  ...(words ? { words: { anchor: words } } : {}),
});
const rows = [
  task("t1", "Diligence", "DealPilot › Deals › Midwest HVAC"),
  task("t2", "Check the price", "DealPilot › Deals › Midwest HVAC › Price", "t1"),
  task("t3", "Read the CIM", "DealPilot"),
  task("t4", "Renew the passport", null),
];

describe("a tree of places (P1)", () => {
  it("nests places by their words, widest first, with nowhere last", () => {
    const places = placesOf(rows, fields[2]);
    expect(places.map((p) => p.words)).toEqual(["DealPilot", "No place yet"]);
    expect(places[0].rows.map((r) => r.id)).toEqual(["t3"]);
    expect(places[0].places[0].words).toBe("Deals");
  });

  it("shows a row under the row it is part of, saying the field it lives on, and folds a place", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<TreeView table="alpha_tasks" rows={rows} fields={fields} titleField="title" groupField={fields[2]} onOpen={onOpen} />);
    expect(screen.getByText("Check the price")).toBeInTheDocument();
    expect(screen.getByText("on Price")).toBeInTheDocument(); // not an empty "Price" place
    expect(screen.queryByRole("button", { name: "Fold Price" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check the price" }));
    expect(onOpen).toHaveBeenCalledWith("t2");
    await user.click(screen.getByRole("button", { name: "Fold DealPilot" }));
    expect(screen.queryByText("Read the CIM")).not.toBeInTheDocument();
    expect(screen.getByText("Renew the passport")).toBeInTheDocument();
  });
});

describe("a place's own address (P1)", () => {
  it("cuts a window address to each step", async () => {
    const { addressAt } = await import("./TreeView");
    expect(addressAt("#/m/m1/deals/r1/price", 0)).toBe("#/m/m1");
    expect(addressAt("#/m/m1/deals/r1/price", 2)).toBe("#/m/m1/deals/r1");
    expect(addressAt("#/m/m1/~page/overview", 1)).toBe("#/m/m1/~page/overview");
    expect(addressAt("#/records/food_log/r9", 0)).toBeUndefined();
    expect(addressAt("#/records/food_log/r9", 1)).toBe("#/records/food_log/r9");
    expect(addressAt("not an address", 0)).toBeUndefined();
  });
});
