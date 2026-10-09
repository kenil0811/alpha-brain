import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Turn } from "../core/client";
import { Conversation } from "./AssistantPanel";

const empty = { turns: [], threads: [], plans: [], actions: [], asks: [], conversations: [], conversation: null };

describe("the reply as it is written", () => {
  it("shows the partial text and the steps so far while a turn runs", async () => {
    const running: Turn = {
      id: "t_1",
      state: "running",
      text: "log two eggs",
      started_at: new Date().toISOString(),
      steps: [{ at: "2026-10-09T09:00:00+00:00", kind: "did", text: "Added a row to Food Log." }],
      live: { thought: null, doing: null, tools: 1, at: Date.now(), partial: "Logged **two eggs**, 140 kcal" },
    };
    const client = {
      conversation: vi.fn().mockResolvedValue(empty),
      newConversation: vi.fn().mockResolvedValue({ id: "c_1" }),
      askAndWait: vi.fn((_text: string, _opts: unknown, onTick?: (t: Turn) => void) => {
        onTick?.(running);
        return new Promise<Turn>(() => undefined);
      }),
    } as unknown as Client;
    render(<Conversation layout="page" client={client} scopeName="Assistant" module={null} version={0} onChanged={vi.fn()} draft={null} onDraftTaken={vi.fn()} />);
    const box = await screen.findByLabelText("Message Alpha");
    fireEvent.change(box, { target: { value: "log two eggs" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByText("Writing")).toBeInTheDocument();
    expect(screen.getByText("two eggs")).toBeInTheDocument();
    expect(screen.getByText("Added a row to Food Log.")).toBeInTheDocument();
    expect(client.askAndWait).toHaveBeenCalledWith("log two eggs", expect.anything(), expect.any(Function), 500);
  });
});
