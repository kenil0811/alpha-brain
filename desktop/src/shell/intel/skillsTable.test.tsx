import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Skill } from "../../core/client";
import { DataPage } from "../../modules/DataPage";
import { skillRow, skillsHeld, skillsTable } from "./skillsTable";

const skill = (name: string, over: Partial<Skill> = {}): Skill => ({ name, kind: "read", site: "example.com", module: null, url: null, description: `Reads ${name}`, when_to_use: null, effect: null, fields: [], version: 2, health: "ok", last_problem: null, last_run_at: "2026-10-12T07:50:00Z", last_count: 4, last_ok_count: 4, source: null, updated_at: "2026-10-12T07:50:00Z", notes: null, ...over });

describe("Intelligence's skills as a table", () => {
  it("makes a row per skill in plain words, the module column only when a skill has one", () => {
    const row = skillRow(skill("linkedin_connections", { module: "m_n" }), { m_n: "Network" });
    expect(row.id).toBe("linkedin_connections");
    expect(row.values).toMatchObject({ skill: "Linkedin connections", kind: "Reader", module: "Network", health: "Working", last_read: 4 });
    expect(skillRow(skill("gmail_draft", { kind: "act", health: "broken" }), {}).values).toMatchObject({ kind: "Action", health: "Being repaired", last_read: null });
    expect(skillsTable([skill("a")], {}).fields.map((f) => f.name)).not.toContain("module");
    expect(skillsTable([skill("a", { module: "m_n" })], { m_n: "Network" }).fields.map((f) => f.name)).toContain("module");
  });

  it("draws them read-only in the data view: no ticks, lists or editor, health coloured, › opens the page", async () => {
    const skills = [skill("linkedin_connections"), skill("gmail_draft", { kind: "act", health: "broken" })];
    const onOpen = vi.fn();
    const client = { preference: vi.fn().mockRejectedValue(new Error("none")) } as unknown as Client;
    render(<DataPage client={client} table={skillsTable(skills, {})} held={skillsHeld(skills, {})} version={0} onChanged={vi.fn()} onOpenRecord={onOpen} />);
    const cell = await screen.findByText("Gmail draft");
    expect(screen.queryByRole("checkbox", { name: /Select every row/ })).toBeNull();
    expect(screen.queryByRole("tablist", { name: "Saved lists" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.getByText("Changed by asking Alpha")).toBeInTheDocument();
    expect(screen.getByText("Being repaired")).toHaveClass("pill--bad");
    expect(screen.getAllByText("Working")[0]).toHaveClass("pill--good");
    fireEvent.doubleClick(cell.closest("td")!);
    expect(screen.queryByRole("textbox", { name: /Name/ })).toBeNull();
    const row = cell.closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: /Open/ }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("intel_skills", "gmail_draft"));
  });
});
