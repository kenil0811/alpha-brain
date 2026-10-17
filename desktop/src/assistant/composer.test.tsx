import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Convo, JournalEntry, Turn } from "../core/client";
import { Conversation } from "./AssistantPanel";

const convo: Convo = { id: "c_1", title: "Food", kind: "work", state: "open", module: null, scope: "Home", question: null, last: null, last_at: "2026-10-16T09:00:00Z", updated_at: "2026-10-16T09:00:00Z" };
const turns: JournalEntry[] = [];

function core() {
  return {
    conversation: vi.fn().mockResolvedValue({ turns, threads: [], actions: [], workflows: [], asks: [], conversations: [convo], conversation: convo }),
    newConversation: vi.fn().mockResolvedValue({ id: "c_1" }),
    agents: vi.fn().mockResolvedValue([]),
    askAndWait: vi.fn().mockResolvedValue({ id: "t_1", state: "done", reply: "Done.", conversation: convo } as unknown as Turn),
    addFiles: vi.fn().mockResolvedValue({ documents: [{ id: "d_1", title: "menu.pdf" }], turn: null }),
  };
}
const page = (client: ReturnType<typeof core>) => render(<Conversation layout="page" client={client as unknown as Client} scopeName="Assistant" module={{ id: "m_1", name: "Nutrition", path: ["Nutrition"] } as never} version={0} onChanged={vi.fn()} draft={null} onDraftTaken={vi.fn()} />);

describe("the composer", () => {
  it("sends with the round button and with Enter, and keeps Shift+Enter for a new line", async () => {
    const client = core();
    page(client);
    const box = await screen.findByLabelText("Message Alpha");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    fireEvent.change(box, { target: { value: "log two eggs" } });
    expect(send).toBeEnabled();
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true }); // a new line, not a send
    expect(client.askAndWait).not.toHaveBeenCalled();
    fireEvent.click(send);
    await waitFor(() => expect(client.askAndWait).toHaveBeenCalledWith("log two eggs", expect.anything(), expect.any(Function), 500));
    expect(screen.getByText("⏎ to send · ⇧⏎ new line")).toBeInTheDocument();
  });

  it("adds files from the plus through the same route as a drop, in the page's module", async () => {
    const client = core();
    const { container } = page(client);
    await screen.findByLabelText("Message Alpha");
    const picker = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["%PDF"], "menu.pdf", { type: "application/pdf" });
    fireEvent.change(picker, { target: { files: [file] } });
    await waitFor(() => expect(client.addFiles).toHaveBeenCalledWith([file], { module: "m_1" }));
    expect(screen.getByRole("button", { name: "Add files" })).toBeInTheDocument();
  });
});
