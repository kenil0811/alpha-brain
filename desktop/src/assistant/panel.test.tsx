import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Convo, JournalEntry, Turn } from "../core/client";
import { Conversation, provenance, retryOf } from "./AssistantPanel";

const entry = (id: string, kind: string, text: string, data: Record<string, unknown> = {}): JournalEntry => ({ id, at: "2026-10-13T09:00:00Z", kind, actor: kind === "said" ? "person" : "alpha", text, data, module: null, thread: "c_1", entity_ids: [], source: null });
const convo = (id: string, title: string, over: Partial<Convo> = {}): Convo => ({ id, title, kind: "work", state: "open", module: null, scope: "Home", question: null, last: null, last_at: "2026-10-13T09:00:00Z", updated_at: "2026-10-13T09:00:00Z", ...over });

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
  it("shows work beside the desk as one live message, then the desk's words on it with its chip and its steps", async () => {
    const working = { id: "w_1", title: "Deal research", state: "working", last_line: "Reading the deals", module: null, created_at: "2026-10-20T09:00:01Z", updated_at: "2026-10-20T09:00:05Z" };
    const started = { ...entry("d_1", "did", "Started work beside the conversation: Deal research", { work: "w_1" }), at: "2026-10-20T09:00:01Z" };
    const client = {
      ...core([entry("s", "said", "look into the deals"), started], []),
      thread: vi.fn().mockResolvedValue({ journal: [entry("j1", "did", "Asked to: Find which deals are new.", { brief: true }), entry("j2", "replied", "Two are new.", { outcome: true })] }),
      stopWork: vi.fn().mockResolvedValue({}),
    };
    client.conversation.mockResolvedValue({ turns: [entry("s", "said", "look into the deals"), started], threads: [], actions: [], asks: [], conversations: [], conversation: null, work: { w_1: working }, now: [working], needs: [] });
    panel(client);
    const live = await screen.findByRole("article", { name: "Work: Deal research" });
    expect(within(live).getByText("Reading the deals")).toBeInTheDocument();
    fireEvent.click(within(live).getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(client.stopWork).toHaveBeenCalledWith("w_1"));
    // the Now strip: the work running now, a filter
    expect(within(screen.getByLabelText("Now")).getByText("Deal research")).toBeInTheDocument();
    // "Show the work": its steps from its thread's journal, no model call
    fireEvent.click(within(live).getByRole("button", { name: "Show the work" }));
    expect(await within(live).findByText("Asked to: Find which deals are new.")).toBeInTheDocument();
    expect(client.thread).toHaveBeenCalledWith("w_1");
  });

  it("puts the desk's reply on finished work in place of its live message, and its chip filters the stream", async () => {
    const done = { id: "w_1", title: "Deal research", state: "done", last_line: "Two are new.", module: null, created_at: "2026-10-20T09:00:01Z", updated_at: "2026-10-20T09:02:00Z" };
    const turns = [
      entry("s", "said", "look into the deals"),
      { ...entry("d_1", "did", "Started work beside the conversation: Deal research", { work: "w_1" }), at: "2026-10-20T09:00:01Z" },
      { ...entry("r_1", "replied", "The deal research finished: two are new.", { work: ["w_1"] }), at: "2026-10-20T09:02:00Z" },
    ];
    const client = { ...core(turns, []), thread: vi.fn().mockResolvedValue({ journal: [] }) };
    client.conversation.mockResolvedValue({ turns, threads: [], actions: [], asks: [], conversations: [], conversation: null, work: { w_1: done }, now: [], needs: [] });
    panel(client);
    expect(await screen.findByText("The deal research finished: two are new.")).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Work: Deal research" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Deal research" }));
    await waitFor(() => expect(client.conversation).toHaveBeenLastCalledWith(null, null, "w_1"));
    expect(await screen.findByRole("button", { name: "Show everything" })).toBeInTheDocument();
  });

  it("shows a yes asked mid-turn while the turn waits on it, and a question only after the turn", async () => {
    const client = core([], []);
    const asks = [
      { id: "q_perm", text: 'Remove "Eggs" from Food log?', at: "2026-10-20T09:00:02Z", options: ["Yes, remove it", "No, keep it"], thread: "t_home", module: null, turn: "s_1", permission: "world_change" },
      { id: "q_plain", text: "Which size?", at: "2026-10-20T09:00:03Z", options: ["Small", "Large"], thread: "t_home", module: null, turn: "s_1" },
    ];
    client.conversation.mockResolvedValue({ turns: [], threads: [], actions: [], asks, conversations: [], conversation: null, work: {}, now: [], needs: [] });
    client.askAndWait.mockImplementation((_t: string, _o: unknown, onTick?: (t: Turn) => void) => {
      onTick?.({ id: "t_1", state: "running", text: "remove the eggs", said: "s_1", started_at: new Date().toISOString(), live: { thought: null, doing: "Waiting for your yes", tools: 1, at: Date.now() } } as unknown as Turn);
      return new Promise<Turn>(() => undefined);
    });
    panel(client);
    const box = (await screen.findAllByRole("textbox"))[0];
    fireEvent.change(box, { target: { value: "remove the eggs" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByText('Remove "Eggs" from Food log?')).toBeInTheDocument();
    expect(screen.queryByText("Which size?")).toBeNull();
    // the box points to the card's buttons while the turn waits on it (C4)
    expect(screen.getByText("Alpha is waiting for your yes on the card above: answer it with its buttons.")).toBeInTheDocument();
    expect((box as HTMLTextAreaElement).placeholder).toBe("Answer the card first");
  });

  it("keeps a card waiting on the person at the bottom, below what was said after it", async () => {
    const turns = [
      { ...entry("s_1", "said", "look into two sites"), at: "2026-10-20T09:00:00Z" },
      { ...entry("r_1", "replied", "Both helpers started."), at: "2026-10-20T09:00:05Z" },
      { ...entry("r_2", "replied", "The joke helper is back."), at: "2026-10-20T09:02:00Z" },
    ];
    const client = core(turns, []);
    const asks = [{ id: "q_host", text: "Let Alpha's scripts reach dog.ceo?", at: "2026-10-20T09:00:03Z", options: ["Yes, always", "No"], thread: "w_1", module: null, turn: "s_1", permission: "network" }];
    client.conversation.mockResolvedValue({ turns, threads: [], actions: [], asks, conversations: [], conversation: null, work: {}, now: [], needs: [] });
    const { container } = panel(client);
    await screen.findByText("Let Alpha's scripts reach dog.ceo?");
    const texts = [...container.querySelectorAll(".assist__content > *")].map((el) => el.textContent ?? "");
    const card = texts.findIndex((t) => t.includes("dog.ceo"));
    const later = texts.findIndex((t) => t.includes("The joke helper is back."));
    expect(card).toBeGreaterThan(later);
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
