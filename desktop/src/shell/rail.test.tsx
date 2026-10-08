import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toRow } from "../core/client";
import { Rail, knownSurface, sameSurface, treeOf } from "./Rail";

describe("the rail", () => {
  it("marks the right item current", () => {
    expect(sameSurface({ kind: "intelligence", tab: "connections" }, { kind: "intelligence" })).toBe(true);
    expect(knownSurface({ kind: "people" })).toEqual({ kind: "people" });
    expect(knownSurface({ kind: "entity", id: "e_1" })).toEqual({ kind: "entity", id: "e_1" });
    expect(sameSurface({ kind: "entity", id: "e_1" }, { kind: "people" })).toBe(true);
    expect(knownSurface({ kind: "nowhere" })).toEqual({ kind: "home" });
    expect(sameSurface({ kind: "module", id: "m_1" }, { kind: "module", id: "m_2" })).toBe(false);
  });

  it("lists the modules and what needs the person", () => {
    render(
      <Rail surface={{ kind: "home" }} modules={[{ id: "m_1", name: "Food", goal: null, tables: [], records: 0, last_at: null, last_text: null, threads: [], created_at: "" }]} needs={2} runtime="connected" onGo={vi.fn()} onNew={vi.fn()} collapsed={false} onToggleCollapsed={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Food" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toHaveTextContent("2");
    expect(screen.getByRole("status")).toHaveTextContent("Alpha is running");
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(knownSurface({ kind: "settings" })).toEqual({ kind: "settings" });
    expect(screen.getByRole("button", { name: "People & Companies" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "About you" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Connections" })).toBeNull();
  });
});

describe("records from the core", () => {
  it("split values from the system fields", () => {
    const row = toRow({ id: "r_1", revision: 2, created_at: "a", updated_at: "b", _provenance: { by: "alpha", estimated: true }, food: "Eggs", kcal: 155 });
    expect(row.values).toEqual({ food: "Eggs", kcal: 155 });
    expect(row.provenance.estimated).toBe(true);
  });
});


describe("modules as a tree", () => {
  const card = (id: string, name: string, parent: string | null = null) => ({ id, name, parent, path: [], children: [], goal: null, tables: [], records: 0, last_at: null, last_text: null, threads: [], created_at: "" });
  it("nests each module under its parent, any depth, and shows an orphan at the top", () => {
    const tree = treeOf([card("m_s", "Search", "m_j"), card("m_j", "Job"), card("m_r", "Resume", "m_j"), card("m_d", "Drafts", "m_r"), card("m_x", "Lost", "m_gone")]);
    expect(tree.map((b) => b.module.name)).toEqual(["Job", "Lost"]);
    expect(tree[0].inside.map((b) => b.module.name)).toEqual(["Resume", "Search"]);
    expect(tree[0].inside[0].inside[0].module.name).toBe("Drafts");
  });

  it("lists the tree on the rail with a fold on each parent", () => {
    render(<Rail surface={{ kind: "home" }} modules={[card("m_j", "Job"), card("m_s", "Search", "m_j")]} needs={0} runtime="connected" onGo={vi.fn()} onNew={vi.fn()} collapsed={false} onToggleCollapsed={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fold Job" }));
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Unfold Job" }));
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  });
});


describe("an agent's last run", () => {
  it("shows its verdict and why on the list", async () => {
    const { AutomationList } = await import("./Automations");
    const a = { id: "a_1", title: "Daily brokers", module: null, thread: null, schedule: "daily 07:00", when: "every day at 07:00, or when your Mac next wakes", procedure: "", enabled: true, next_run_at: null, last_run_at: "2026-10-09T06:00:00+00:00", last_result: "Read 1 of 2 sources.", last_error: "walled couldn't be reached.", last_verdict: "partial" as const, last_why: "walled couldn't be reached.", goal: "deals" };
    render(<AutomationList client={{} as never} items={[a]} onChanged={vi.fn()} empty="none" />);
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(screen.getByText("walled couldn't be reached.")).toBeInTheDocument();
    expect(screen.getByText("deals")).toBeInTheDocument();
  });
});
