import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Convo } from "../core/client";
import { AssistantPage } from "./AssistantPage";
import { Conversation } from "./AssistantPanel";

const convo = (id: string, title: string): Convo => ({ id, title, kind: "chat", state: "open", module: null, scope: "Home", question: null, last: null, last_at: "2026-10-13T09:00:00Z", updated_at: "2026-10-13T09:00:00Z" });

function core(list: Convo[]) {
  return {
    conversation: vi.fn().mockResolvedValue({ turns: [], threads: [], actions: [], asks: [], conversations: list, conversation: list[0] ?? null }),
    conversations: vi.fn().mockResolvedValue(list),
    newConversation: vi.fn(),
    agents: vi.fn().mockResolvedValue([]),
    renameConversation: vi.fn().mockResolvedValue(list[0]),
    conversationRemoval: vi.fn().mockResolvedValue({ conversation: list[0].id, title: list[0].title, what: "its 1 open question closed; what Alpha learned from it stays" }),
    deleteConversation: vi.fn().mockResolvedValue({}),
  };
}

describe("a conversation renamed and deleted (slice 2)", () => {
  it("from the panel's picker: Rename in place, Delete asking with what it does", async () => {
    const c = core([convo("c_1", "Morning plan")]);
    render(<Conversation layout="panel" client={c as unknown as Client} scopeName="Home" module={null} version={0} onChanged={vi.fn()} draft={null} onDraftTaken={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Conversation: Morning plan. Pick another" }));
    fireEvent.click(await screen.findByRole("button", { name: "Rename…" }));
    const box = screen.getByRole("textbox", { name: "New title for Morning plan" });
    fireEvent.change(box, { target: { value: "Deal review" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(c.renameConversation).toHaveBeenCalledWith("c_1", "Deal review"));
    fireEvent.click(await screen.findByRole("button", { name: "Conversation: Morning plan. Pick another" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete…" }));
    const d = await screen.findByRole("dialog", { name: 'Delete "Morning plan"?' });
    expect(d).toHaveTextContent("Deletes it from your lists: its 1 open question closed; what Alpha learned from it stays. Activity keeps its turns");
    fireEvent.click(within(d).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(c.deleteConversation).toHaveBeenCalledWith("c_1"));
  });

  it("from the Assistant page: a right-click on a conversation", async () => {
    const c = core([convo("c_1", "Morning plan"), convo("c_2", "Deals")]);
    const onOpen = vi.fn();
    render(<AssistantPage client={c as unknown as Client} version={0} onChanged={vi.fn()} conversationId="c_1" onOpen={onOpen} draft={null} onDraftTaken={vi.fn()} />);
    const row = (await screen.findAllByText("Morning plan"))[0].closest("button")!;
    fireEvent.contextMenu(row);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(c.deleteConversation).toHaveBeenCalledWith("c_1"));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith("c_2")); // the one open went: the next opens
  });
});
