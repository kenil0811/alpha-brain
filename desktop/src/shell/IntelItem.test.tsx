import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, Intelligence as Data } from "../core/client";
import { TooltipProvider } from "../ui";
import { Activity } from "./Activity";
import { IntelItemPage, type ItemContext } from "./IntelItem";

const data: Data = {
  hands: [],
  skills: [],
  automations: [],
  readers: [],
  connections: [],
  knowledge: {
    facts: [{ id: "f1", subject: "person", predicate: "lives_in", value: "Lisbon", valid_from: "", valid_to: null, recorded_at: "", source: "stated", why: null, confidence: 1, state: "accepted" }],
    notes: [{ id: "n1", scope: "person", title: "Profile", body: "Backend engineer.", updated_at: "" }],
    goals: [],
  },
};

function page(item: string) {
  const client = { writeNote: vi.fn(async () => ({})) };
  const ctx: ItemContext = { client: client as unknown as Client, data, modules: {}, onGo: vi.fn(), onAsk: vi.fn(), onChanged: vi.fn() };
  render(
    <TooltipProvider>
      <IntelItemPage tab="knowledge" item={item} ctx={ctx} />
    </TooltipProvider>,
  );
  return { client, ctx };
}

describe("an Intelligence item's page", () => {
  it("saves a field the core can write: a note's text, on a double-click and Enter", async () => {
    const user = userEvent.setup();
    const { client, ctx } = page("n1");
    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    await user.dblClick(screen.getByText("Backend engineer."));
    const box = screen.getByRole("textbox", { name: "Note" });
    await user.clear(box);
    await user.type(box, "Platform engineer.{Enter}");
    await waitFor(() => expect(client.writeNote).toHaveBeenCalledWith("person", "Profile", "Platform engineer."));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(ctx.onAsk).not.toHaveBeenCalled();
  });

  it("drafts a field it can't for Zazoo, never sending: correcting a fact, from its pencil", async () => {
    const user = userEvent.setup();
    const { client, ctx } = page("f1");
    await user.click(screen.getByRole("button", { name: "Edit lives in" }));
    const box = screen.getByRole("textbox", { name: "Lives in" });
    await user.clear(box);
    await user.type(box, "Porto{Enter}");
    expect(ctx.onAsk).toHaveBeenCalledWith("Correct what you know about me: my lives in is “Porto”, not “Lisbon”.");
    expect(await screen.findByRole("status")).toHaveTextContent("Drafted for Zazoo. Nothing changes until you send it.");
    expect(client.writeNote).not.toHaveBeenCalled();
  });

  it("says so when the item is gone", () => {
    page("nope");
    expect(screen.getByText("This is no longer here.")).toBeInTheDocument();
  });
});

describe("Activity", () => {
  it("lists automations whose last run failed and runs one again", async () => {
    const user = userEvent.setup();
    const auto = { id: "a1", title: "Read the openings", module: null, thread: null, schedule: "", when: "daily", procedure: "", enabled: true, next_run_at: null, last_run_at: null, last_result: null, last_error: "The page moved", running: false };
    const client = { activity: vi.fn(async () => []), automations: vi.fn(async () => [auto, { ...auto, id: "a2", last_error: null }]), runAutomation: vi.fn(async () => auto) };
    const onChanged = vi.fn();
    render(<Activity client={client as unknown as Client} version={0} onChanged={onChanged} />);
    const again = await screen.findAllByRole("button", { name: "Run it again" });
    expect(again).toHaveLength(1);
    expect(screen.getByText("The page moved")).toBeInTheDocument();
    await user.click(again[0]);
    expect(client.runAutomation).toHaveBeenCalledWith("a1");
    expect(onChanged).toHaveBeenCalled();
  });
});
