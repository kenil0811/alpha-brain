import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Turn } from "../core/client";
import { TooltipProvider } from "../ui";
import { AvatarWindow } from "./AvatarWindow";

const turn = (over: Partial<Turn>): Turn => ({ id: "t1", state: "running", text: "log lunch", started_at: "2026-10-03T12:00:00Z", ...over });

function setup(needs: unknown[] = []) {
  let finishTurn: (t: Turn) => void = () => undefined;
  const client = {
    companion: async () => ({ focus: null, conversations: [], needs_you: [] }),
    conversation: async () => ({ turns: [{ id: "j0", at: "", kind: "said", actor: "person", text: "an older message", data: {}, module: null, thread: null, entity_ids: [], source: null }], threads: [], running: [], plans: [] }),
    home: async () => ({ date: "", needs_you: needs, ran_today: 0, failed_today: 0, modules: [], loose_tables: [], coming_up: [], threads: [], brief: null }),
    claude: async () => ({ installed: true, signed_in: true }),
    ask: vi.fn(async () => turn({})),
    waitTurn: () => new Promise<Turn>((resolve) => (finishTurn = resolve)),
  } as unknown as Client;
  render(
    <TooltipProvider>
      <AvatarWindow client={client} />
    </TooltipProvider>,
  );
  return { client, finish: (t: Turn) => act(() => finishTurn(t)) };
}

describe("the companion", () => {
  it("goes rest -> box -> working -> only the reply -> whole chat -> back", async () => {
    const { client, finish } = setup();
    expect(screen.queryByRole("textbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ask Zazoo" }));
    const box = screen.getByRole("textbox", { name: "What should Zazoo do" });
    expect(screen.queryByText("an older message")).toBeNull();

    fireEvent.change(box, { target: { value: "log lunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Working out your request")).toBeInTheDocument();
    expect(client.ask).toHaveBeenCalledWith("log lunch");

    await finish(turn({ state: "done", reply: "Logged lunch." }));
    expect(await screen.findByText("Logged lunch.")).toBeInTheDocument();
    expect(screen.queryByText("an older message")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show the whole chat" }));
    expect(await screen.findByText("an older message")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse the chat" }));
    expect(screen.queryByText("an older message")).toBeNull();
    expect(screen.getByText("Logged lunch.")).toBeInTheDocument();

    // Closing and opening again starts from the box alone.
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ask Zazoo" }));
    expect(screen.queryByText("Logged lunch.")).toBeNull();
  });

  it("names what needs the person in one line that opens the whole chat", async () => {
    setup([{ kind: "ask", id: "j_1", text: "Which board first?", at: "", options: ["LinkedIn"] }, { kind: "ask", id: "j_2", text: "Which day?", at: "", options: [] }]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ask Zazoo" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Ask Zazoo" }));
    fireEvent.click(await screen.findByRole("button", { name: "2 things need you" }));
    expect(await screen.findByRole("group", { name: "Zazoo asks" })).toBeInTheDocument();
  });
});
