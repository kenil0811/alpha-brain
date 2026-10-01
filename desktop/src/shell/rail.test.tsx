import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toRow } from "../core/client";
import { Rail, knownSurface, sameSurface } from "./Rail";

describe("the rail", () => {
  it("marks the right item current", () => {
    expect(sameSurface({ kind: "intelligence", tab: "connections" }, { kind: "intelligence" })).toBe(true);
    expect(knownSurface({ kind: "people" })).toEqual({ kind: "home" });
    expect(sameSurface({ kind: "module", id: "m_1" }, { kind: "module", id: "m_2" })).toBe(false);
  });

  it("lists the modules and what needs the person", () => {
    render(
      <Rail surface={{ kind: "home" }} modules={[{ id: "m_1", name: "Food", goal: null, tables: [], records: 0, last_at: null, last_text: null, threads: [], created_at: "" }]} needs={2} runtime="connected" onGo={vi.fn()} onNew={vi.fn()} theme="dark" onTheme={vi.fn()} collapsed={false} onToggleCollapsed={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Food" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toHaveTextContent("2");
    expect(screen.getByRole("status")).toHaveTextContent("Alpha is running");
    expect(screen.queryByRole("button", { name: "People & Companies" })).toBeNull();
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
