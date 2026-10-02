import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Intelligence } from "../core/client";
import { TooltipProvider } from "../ui";
import { IntelItemPage, type ItemContext } from "./IntelItem";

const data: Intelligence = {
  skills: [],
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

function open(item: string, client: Partial<Client> = {}) {
  const ctx: ItemContext = { client: client as Client, data, modules: [], onGo: vi.fn(), onAsk: vi.fn(), onChanged: vi.fn() };
  render(
    <TooltipProvider>
      <IntelItemPage tab="knowledge" item={item} ctx={ctx} />
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
