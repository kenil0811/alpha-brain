import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Convo, JournalEntry, Turn } from "../core/client";
import { Conversation, provenance, retryOf } from "./AssistantPanel";

const entry = (id: string, kind: string, text: string, data: Record<string, unknown> = {}): JournalEntry => ({ id, at: "2026-10-13T09:00:00Z", kind, actor: kind === "said" ? "person" : "alpha", text, data, module: null, thread: "c_1", entity_ids: [], source: null });
const convo = (id: string, title: string, over: Partial<Convo> = {}): Convo => ({ id, title, kind: "chat", state: "open", module: null, scope: "Home", question: null, last: null, last_at: "2026-10-13T09:00:00Z", updated_at: "2026-10-13T09:00:00Z", ...over });

function core(turns: JournalEntry[], conversations: Convo[]) {
  return {
    conversation: vi.fn().mockResolvedValue({ turns, threads: [], actions: [], asks: [], conversations, conversation: conversations[0] ?? null }),
    newConversation: vi.fn().mockResolvedValue({ id: "c_new" }),
    agents: vi.fn().mockResolvedValue([]),
    askAndWait: vi.fn().mockResolvedValue({ id: "t_2", state: "done", reply: "Done", conversation: conversations[0] } as unknown as Turn),
  };
}
const panel = (client: ReturnType<typeof core>) => render(<Conversation layout="panel" client={client as unknown as Client} scopeName="Home" module={null} version={0} onChanged={vi.fn()} draft={null} onDraftTaken={vi.fn()} />);

describe("each of Alpha's turns says what it was", () => {
  it("how long it took and how many steps, from the turn's own record", () => {
    expect(provenance(entry("e", "replied", "x", { duration_ms: 12400, num_turns: 4 }))).toBe("12 s · 4 steps");
    expect(provenance(entry("e", "replied", "x", { duration_ms: 300, num_turns: 1 }))).toBe("1 s · 1 step");
    expect(provenance(entry("e", "replied", "x"))).toBe("");
  });

  it("offers Retry only where a turn failed without a reply, with the sentence it answered", () => {
    const said = entry("s", "said", "log two eggs", { turn: "t_1" });
    const failed = entry("f", "failed", "The core stopped.", { turn: "t_1" });
    expect(retryOf(failed, [said, failed])).toBe("log two eggs");
    const replied = entry("r", "replied", "Logged.", { turn: "t_1" });
    expect(retryOf(failed, [said, failed, replied])).toBeNull(); // the turn went on and replied
    expect(retryOf(replied, [said, replied])).toBeNull(); // never on a reply that worked
  });
});

describe("the assistant panel", () => {
  it("keeps the picker in its place with one conversation, and switches from it", async () => {
    const client = core([entry("s", "said", "hi"), entry("r", "replied", "Hello.", { duration_ms: 3000, num_turns: 2 })], [convo("c_1", "Morning plan"), convo("c_2", "Deals", { state: "waiting", scope: "Deal Tracker" })]);
    panel(client);
    const pick = await screen.findByRole("button", { name: "Conversation: Morning plan. Pick another" });
    expect(screen.getByText("3 s · 2 steps")).toBeInTheDocument();
    fireEvent.click(pick);
    const list = await screen.findByRole("dialog", { name: "Conversations" });
    expect(within(list).getByText("Deal Tracker · needs you")).toBeInTheDocument();
    fireEvent.click(within(list).getByText("Deals"));
    await waitFor(() => expect(client.conversation).toHaveBeenLastCalledWith(null, "c_2"));
  });

  it("shows the picker with only one conversation too, and starts a new one from + New", async () => {
    const client = core([], [convo("c_1", "Morning plan")]);
    panel(client);
    expect(await screen.findByRole("button", { name: "Conversation: Morning plan. Pick another" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    await waitFor(() => expect(client.newConversation).toHaveBeenCalledWith(null, "New conversation"));
  });

  it("sends the sentence again on Retry under a turn that didn't finish", async () => {
    const client = core([entry("s", "said", "log two eggs", { turn: "t_1" }), entry("f", "failed", "The model stopped answering.", { turn: "t_1", duration_ms: 61000 })], [convo("c_1", "Food")]);
    panel(client);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(client.askAndWait).toHaveBeenCalledWith("log two eggs", expect.anything(), expect.any(Function), 500));
  });
});

describe("@ in the composer", () => {
  it("offers the agents whose name begins with what is typed, completes the name on a tap, and sends only a complete one", async () => {
    const client = core([], [convo("c_1", "Morning plan")]);
    client.agents.mockResolvedValue([
      { id: "a1", name: "Deal Scout", kind: "custom", description: "Read the brokers", module: null, thread: null, state: "on", on: true, may: [], done: null, schedule: "daily 07:00", when: "every day at 07:00", next_run_at: null, last_run_at: null, last_result: null, last_error: null },
      { id: "a2", name: "Doc", kind: "doc", description: "Keeps things working", module: null, thread: null, state: "on", on: true, may: [], done: null, schedule: null, when: "when something breaks", next_run_at: null, last_run_at: null, last_result: null, last_error: null },
    ]);
    panel(client);
    const box = (await screen.findAllByRole("textbox"))[0];
    fireEvent.change(box, { target: { value: "@d" } });
    const list = await screen.findByRole("listbox", { name: "Agents" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["@Deal Scout", "@Doc"]);
    fireEvent.keyDown(box, { key: "Enter" }); // Enter completes the first name rather than sending
    expect(client.askAndWait).not.toHaveBeenCalled();
    expect((box as HTMLTextAreaElement).value).toBe("@Deal Scout ");
    expect(screen.queryByRole("listbox", { name: "Agents" })).toBeNull();
    fireEvent.change(box, { target: { value: "@Deal Scout what's new?" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(client.askAndWait).toHaveBeenCalledWith("@Deal Scout what's new?", expect.anything(), expect.any(Function), 500));
    fireEvent.change(box, { target: { value: "@Do" } });
    fireEvent.click(within(await screen.findByRole("listbox", { name: "Agents" })).getByRole("option", { name: "@Doc" }));
    expect((box as HTMLTextAreaElement).value).toBe("@Doc ");
  });
});
