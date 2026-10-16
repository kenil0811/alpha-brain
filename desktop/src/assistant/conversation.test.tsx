import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, JournalEntry, Turn } from "../core/client";
import { Conversation } from "./AssistantPanel";
import { firstSentence, grow } from "./Reply";

const empty = { turns: [], threads: [], actions: [], asks: [], conversations: [], conversation: null };
const entry = (id: string, kind: string, text: string, data: Record<string, unknown> = {}): JournalEntry => ({ id, at: "2026-10-16T09:00:00Z", kind, actor: kind === "said" ? "person" : "alpha", text, data, module: null, thread: "c_1", entity_ids: [], source: null });
const running: Turn = {
  id: "t_1",
  state: "running",
  text: "log two eggs",
  said: "s_1",
  started_at: new Date().toISOString(),
  steps: [{ at: "2026-10-16T09:00:00+00:00", kind: "did", text: "Added a row to Food Log." }],
  live: { thought: null, doing: null, tools: 1, at: Date.now(), partial: "Logged **two eggs**, 140 kcal" },
};
const page = (client: Client) => render(<Conversation layout="page" client={client} scopeName="Assistant" module={null} version={0} onChanged={vi.fn()} draft={null} onDraftTaken={vi.fn()} />);
const send = async (words: string) => {
  const box = await screen.findByLabelText("Message Alpha");
  fireEvent.change(box, { target: { value: words } });
  fireEvent.keyDown(box, { key: "Enter" });
};

describe("the reply as it is written", () => {
  it("shows the words so far and the steps so far, the time and Stop, and no headline that flips", async () => {
    const client = {
      conversation: vi.fn().mockResolvedValue(empty),
      newConversation: vi.fn().mockResolvedValue({ id: "c_1" }),
      agents: vi.fn().mockResolvedValue([]),
      askAndWait: vi.fn((_text: string, _opts: unknown, onTick?: (t: Turn) => void) => {
        onTick?.(running);
        return new Promise<Turn>(() => undefined);
      }),
    } as unknown as Client;
    page(client);
    await send("log two eggs");
    expect(await screen.findByText("two eggs")).toBeInTheDocument();
    expect(screen.getByText("Added a row to Food Log.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.getByText(/^\d+ s$/)).toBeInTheDocument();
    expect(screen.queryByText("Writing")).toBeNull();
    expect(screen.queryByText("Thinking")).toBeNull(); // the words are there; the thinking line has gone
    expect(client.askAndWait).toHaveBeenCalledWith("log two eggs", expect.anything(), expect.any(Function), 500);
  });

  it("keeps one element from the first words to the journal's reply, so nothing is replaced", async () => {
    let over = false;
    const withTurns = { ...empty, turns: [entry("s_1", "said", "log two eggs"), entry("r_1", "replied", "Logged **two eggs**, 140 kcal.", { turn: "s_1", duration_ms: 3000, num_turns: 1 })] };
    const client = {
      conversation: vi.fn(() => Promise.resolve(over ? withTurns : empty)),
      newConversation: vi.fn().mockResolvedValue({ id: "c_1" }),
      agents: vi.fn().mockResolvedValue([]),
      askAndWait: vi.fn((_text: string, _opts: unknown, onTick?: (t: Turn) => void) => {
        onTick?.(running);
        return new Promise<Turn>((resolve) =>
          setTimeout(() => {
            over = true;
            resolve({ ...running, state: "done", reply: "Logged **two eggs**, 140 kcal.", replied: "r_1" });
          }, 20),
        );
      }),
    } as unknown as Client;
    page(client);
    await send("log two eggs");
    const element = (await screen.findByText("two eggs")).closest(".reply");
    expect(element?.getAttribute("data-turn")).toBe("turn-s_1");
    await waitFor(() => expect(screen.getByText("3 s · 1 step")).toBeInTheDocument());
    expect(screen.getByText("two eggs").closest(".reply")).toBe(element);
    expect(element?.textContent).toContain("140 kcal.");
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("grows the words only forward, and keeps what the core cleared as the thought", () => {
    expect(grow("", "Logged")).toEqual({ text: "Logged", cleared: null });
    expect(grow("Logged", "Logged two")).toEqual({ text: "Logged two", cleared: null });
    expect(grow("Logged two", "Logged two")).toEqual({ text: "Logged two", cleared: null });
    expect(grow("Let me check the table first.", "")).toEqual({ text: "", cleared: "Let me check the table first." });
    const long = "x".repeat(100) + " the tail of what was kept";
    expect(grow(long, long.slice(40) + " and more")).toEqual({ text: `${long} and more`, cleared: null });
    expect(firstSentence("Let me look at the Food Log table. Then I'll add the row.")).toBe("Let me look at the Food Log table.");
    expect(firstSentence("a".repeat(200))).toHaveLength(140);
  });
});
