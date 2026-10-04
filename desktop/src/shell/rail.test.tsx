import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toRow } from "../core/client";
import { ToastProvider, TooltipProvider } from "../ui";
import { Rail, knownSurface, sameSurface } from "./Rail";
import { pathFor as surfacePath, surfaceFromPath } from "./address";

describe("the rail", () => {
  it("marks the right item current", () => {
    expect(sameSurface({ kind: "intelligence", tab: "connections" }, { kind: "intelligence" })).toBe(true);
    expect(knownSurface({ kind: "people" })).toEqual({ kind: "people" });
    expect(knownSurface({ kind: "entity", id: "e_1" })).toEqual({ kind: "entity", id: "e_1" });
    expect(sameSurface({ kind: "entity", id: "e_1" }, { kind: "people" })).toBe(true);
    expect(knownSurface({ kind: "nowhere" })).toEqual({ kind: "home" });
    expect(sameSurface({ kind: "module", id: "m_1" }, { kind: "module", id: "m_2" })).toBe(false);
    expect(surfaceFromPath(`#${surfacePath({ kind: "module", id: "m_1" })}`)).toEqual({ kind: "module", id: "m_1" });
  });

  it("keeps sections and Alpha's aliases in the address", () => {
    expect(surfacePath({ kind: "module", id: "m_1", section: "activity" })).toBe("/m/m_1/activity");
    expect(surfaceFromPath("#/m/m_1/settings")).toEqual({ kind: "module", id: "m_1", section: "settings" });
    expect(surfaceFromPath("#/settings/models")).toEqual({ kind: "settings", section: "models" });
    expect(surfaceFromPath("#/connections")).toEqual({ kind: "intelligence", tab: "connections" });
    expect(surfaceFromPath("#/settings/connections")).toEqual({ kind: "intelligence", tab: "connections" });
    expect(surfaceFromPath("#/about")).toEqual({ kind: "intelligence", tab: "knowledge" });
  });

  it("lists the projects with their sub projects nested, and no Activity item", () => {
    const card = (id: string, name: string, project: string | null = null) => ({ id, name, goal: null, project, tables: [], records: 0, last_at: null, last_text: null, threads: [], created_at: "" });
    const { container } = render(
      <TooltipProvider>
        <ToastProvider>
          <Rail surface={{ kind: "home" }} modules={[card("m_1", "School"), card("m_2", "Grades", "m_1"), card("m_3", "Food")]} runtime="connected" onGo={vi.fn()} onNew={vi.fn()} collapsed={false} onToggleCollapsed={vi.fn()} />
        </ToastProvider>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Food" })).toBeInTheDocument();
    expect(container.querySelector(".rail__nested")).toHaveTextContent("Grades");
    expect(screen.queryByRole("button", { name: "Activity" })).toBeNull();
    expect(screen.queryByText("Projects")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a project from a file" })).toBeNull();
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument();
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
