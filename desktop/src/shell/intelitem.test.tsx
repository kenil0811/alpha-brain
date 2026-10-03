import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Intelligence } from "../core/client";
import { TooltipProvider } from "../ui";
import { IntelItemPage, type ItemContext } from "./IntelItem";

const data: Intelligence = {
  hands: [{ name: "files", title: "Files", description: "Reads the folders you connect.", tools: [{ name: "files_read", description: "Read a file", effect: "read" }], origin: "builtin" }],
  skills: [
    { name: "lumen_jobs", kind: "read", site: "lumen.example", module: null, url: "https://lumen.example/jobs", description: "Open roles on Lumen's careers page", when_to_use: null, effect: null, fields: ["title"], version: 2, health: "broken", last_problem: "the reader returned no rows", last_run_at: null, last_count: null, last_ok_count: 3, source: null, updated_at: "", notes: "Scroll to the end first." },
  ],
  automations: [],
  readers: [],
  connections: [],
  knowledge: {
    facts: [],
    goals: [{ id: "g_1", text: "A backend role by December", state: "active", module: null, since: "2026-10-01T10:00:00+00:00" }],
    notes: [{ id: "n_1", scope: "person", title: "Profile", body: "Backend engineer.", updated_at: "2026-10-01T10:00:00+00:00" }],
    permissions: [],
  },
};

function open(item: string, client: Partial<Client> = {}, tab = "knowledge") {
  const ctx: ItemContext = { client: client as Client, data, modules: [], onGo: vi.fn(), onAsk: vi.fn(), onChanged: vi.fn() };
  render(
    <TooltipProvider>
      <IntelItemPage tab={tab} item={item} ctx={ctx} />
    </TooltipProvider>,
  );
  return ctx;
}

describe("an Intelligence item's page", () => {
  it("saves a note's text straight to the core", async () => {
    const writeNote = vi.fn(async () => data.knowledge.notes[0]);
    const ctx = open("n_1", { writeNote });
    fireEvent.doubleClick(screen.getByText("Backend engineer."));
    const box = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(box, { target: { value: "Backend engineer, platform roles." } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(writeNote).toHaveBeenCalledWith("person", "Profile", "Backend engineer, platform roles."));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(ctx.onAsk).not.toHaveBeenCalled();
  });

  it("shows a learned skill with its kind, health and Alpha's notes, and a built-in hand by its own address", () => {
    open("lumen_jobs", {}, "skills");
    expect(screen.getByText("Being repaired")).toBeInTheDocument();
    expect(screen.getByText("Reads")).toBeInTheDocument();
    expect(screen.getByText("Scroll to the end first.")).toBeInTheDocument();
    cleanup();
    open("hand:files", {}, "skills");
    expect(screen.getByText("Files read")).toBeInTheDocument();
  });

  it("drafts a change the core can't make for Zazoo, and Esc puts it back", async () => {
    const ctx = open("g_1");
    fireEvent.click(screen.getByRole("button", { name: "Edit goal" }));
    let box = screen.getByRole("textbox", { name: "Goal" });
    fireEvent.change(box, { target: { value: "Something else" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(ctx.onAsk).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit goal" }));
    box = screen.getByRole("textbox", { name: "Goal" });
    fireEvent.change(box, { target: { value: "A platform role by January" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(ctx.onAsk).toHaveBeenCalledWith("Change the goal “A backend role by December” to “A platform role by January”.");
    expect(await screen.findByText("Drafted in Zazoo. Nothing changes until you send it.")).toBeInTheDocument();
  });
});
