import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Client, Turn } from "../core/client";
import { TooltipProvider } from "../ui";
import { AvatarWindow } from "./AvatarWindow";

const turn = (over: Partial<Turn>): Turn => ({ id: "t1", state: "running", text: "log lunch", started_at: "2026-10-03T12:00:00Z", ...over }) as Turn;

beforeAll(() => {
  // jsdom has no ResizeObserver; the companion only uses it to tell the host where it is drawn.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function setup(needs: unknown[] = []) {
  let finishTurn: ((t: Turn) => void) | null = null;
  const client = {
    changes: async () => ({ at: "s1", journal: 0, kinds: [], tables: [], modules: [], entities: [], threads: false, plans: false, actions: false, working: false }),
    companion: async () => ({ focus: null, conversations: [], needs_you: [] }),
    conversation: async () => ({ turns: [{ id: "j0", at: "", kind: "said", actor: "person", text: "an older message", data: {}, module: null, thread: null, entity_ids: [], source: null }], threads: [], running: [], plans: [] }),
    home: async () => ({ date: "", needs_you: needs, ran_today: 0, failed_today: 0, modules: [], loose_tables: [], coming_up: [], threads: [], brief: null }),
    ask: vi.fn(async () => turn({})),
    waitTurn: () => new Promise<Turn>((resolve) => (finishTurn = resolve)),
  } as unknown as Client;
  render(
    <TooltipProvider>
      <AvatarWindow client={client} />
    </TooltipProvider>,
  );
  // The reply lands once the companion is waiting on the turn.
  const finish = async (t: Turn) => {
    await waitFor(() => expect(finishTurn).not.toBeNull());
    await act(async () => finishTurn!(t));
  };
  return { client, finish };
}

/** The character: a press and release without moving is its click. */
function clickCharacter(name: string) {
  const button = screen.getByRole("button", { name });
  fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(button, { button: 0, clientX: 10, clientY: 10 });
}

const box = () => screen.queryByRole("textbox", { name: "What should Zazoo do" });

describe("the companion's chat", () => {
  it("goes rest -> box -> working -> only the reply -> whole chat -> back", async () => {
    const { client, finish } = setup();
    expect(box()).toBeNull();

    clickCharacter("Ask Zazoo");
    expect(box()).toBeInTheDocument();
    expect(screen.queryByText("an older message")).toBeNull();

    fireEvent.change(box()!, { target: { value: "log lunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Working on it…")).toBeInTheDocument();
    expect(client.ask).toHaveBeenCalledWith("log lunch");

    await finish(turn({ state: "done", reply: "Logged lunch." }));
    expect(await screen.findByText("Logged lunch.")).toBeInTheDocument();
    expect(screen.queryByText("Working on it…")).toBeNull();
    expect(screen.queryByText("an older message")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show the whole chat" }));
    expect(await screen.findByText("an older message")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse the chat" }));
    expect(screen.queryByText("an older message")).toBeNull();
    expect(screen.getByText("Logged lunch.")).toBeInTheDocument();

    // Escape closes; opening again starts from the box alone.
    fireEvent.keyDown(box()!, { key: "Escape" });
    expect(box()).toBeNull();
    clickCharacter("Ask Zazoo");
    expect(box()).toBeInTheDocument();
    expect(screen.queryByText("Logged lunch.")).toBeNull();
  });

  it("closes the box and the reply on a click outside the chat, on the character, or when the window loses focus", async () => {
    const { finish } = setup();
    clickCharacter("Ask Zazoo");
    fireEvent.pointerDown(box()!);
    expect(box()).toBeInTheDocument();
    // Elsewhere in the window.
    fireEvent.pointerDown(document.body);
    expect(box()).toBeNull();

    // In another app: the window loses focus, and the reply goes with the box.
    clickCharacter("Ask Zazoo");
    fireEvent.change(box()!, { target: { value: "log lunch" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await finish(turn({ state: "done", reply: "Logged lunch." }));
    await screen.findByText("Logged lunch.");
    fireEvent.blur(window);
    expect(box()).toBeNull();
    expect(screen.queryByRole("region", { name: "Zazoo" })).toBeNull();

    // On the character itself.
    clickCharacter("Ask Zazoo");
    expect(box()).toBeInTheDocument();
    clickCharacter("Hide Zazoo's chat");
    expect(box()).toBeNull();
  });

  it("names what needs the person in one line that opens the whole chat", async () => {
    setup([
      { kind: "ask", id: "j_1", text: "Which board first?", at: "", options: ["LinkedIn"] },
      { kind: "ask", id: "j_2", text: "Which day?", at: "", options: [] },
    ]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ask Zazoo" })).toBeInTheDocument());
    clickCharacter("Ask Zazoo");
    fireEvent.click(await screen.findByRole("button", { name: "2 things need you" }));
    expect(await screen.findByRole("group", { name: "Zazoo asks" })).toBeInTheDocument();
  });
});
