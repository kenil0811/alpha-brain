import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, JournalEntry } from "../core/client";
import { AssistantProvider, TooltipProvider } from "../ui";
import { ActivityPage } from "./ActivityPage";
import { DescribeAdd } from "./DescribeAdd";

const failed: JournalEntry = { id: "j1", at: "2026-10-09T07:00:00", kind: "failed", actor: "alpha", text: "Checking deals didn't work", data: { automation: "a1", error: "the site asked for a sign-in" }, module: "m1", thread: null, entity_ids: ["p1"], source: null };

function mount(id: string) {
  const onGo = vi.fn();
  const client = {
    activity: vi.fn(async () => [failed]),
    modules: vi.fn(async () => [{ id: "m1", name: "Deals" }]),
    intelligence: vi.fn(async () => ({ automations: [{ id: "a1", title: "Check deals every morning" }], skills: [] })),
    people: vi.fn(async () => [{ id: "p1", name: "Ada", kind: "person" }]),
    runAutomation: vi.fn(async () => ({})),
  } as unknown as Client;
  render(
    <TooltipProvider>
      <ActivityPage client={client} id={id} version={0} onGo={onGo} onOpenThread={vi.fn()} onChanged={vi.fn()} />
    </TooltipProvider>,
  );
  return { client, onGo };
}

describe("an Activity entry's page", () => {
  it("says what happened, who, when, the project, what it touched, why, and tries again", async () => {
    const { client, onGo } = mount("j1");
    expect(await screen.findByText("The automation \"Check deals every morning\"")).toBeInTheDocument();
    expect(screen.getByText("What went wrong: the site asked for a sign-in")).toBeInTheDocument();
    expect(screen.getByText(/October, 07:00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Ada" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "entity", id: "p1" });
    await userEvent.click(screen.getByRole("button", { name: "Check deals every morning" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "automation", id: "a1" });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(client.runAutomation).toHaveBeenCalledWith("a1"));
  });

  it("says plainly when the entry isn't among the recent ones, with the way back", async () => {
    const { onGo } = mount("j_gone");
    expect(await screen.findByText("This entry isn't among the recent ones")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open Activity" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "activity" });
  });
});

describe("Add goal, agent or automation", () => {
  it("sends the description to Alpha and says it will ask for a yes", async () => {
    const say = vi.fn();
    render(
      <TooltipProvider>
        <AssistantProvider say={say}>
          <DescribeAdd thing="goal" />
        </AssistantProvider>
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add goal" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Describe the goal you want" }), "Run a marathon");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(say).toHaveBeenCalledWith("Add a goal: Run a marathon");
    expect(screen.getByRole("status")).toHaveTextContent("Sent to Alpha — it will ask you to approve.");
  });
});
