import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Ask, Client, Convo, JournalEntry, Thread } from "../core/client";
import { AskCard, pickWords } from "./AskCard";
import { Conversation } from "./AssistantPanel";

const entry = (id: string, kind: string, text: string, at: string, data: Record<string, unknown> = {}): JournalEntry => ({ id, at, kind, actor: kind === "said" ? "person" : "alpha", text, data, module: null, thread: "c_1", entity_ids: [], source: null });
const convo: Convo = { id: "c_1", title: "Food", kind: "chat", state: "open", module: null, scope: "Home", question: null, last: null, last_at: "2026-10-16T09:00:00Z", updated_at: "2026-10-16T09:00:00Z" };
const ask = (id: string, text: string, options: string[], over: Partial<Ask> = {}): Ask => ({ id, text, at: "2026-10-16T09:00:02Z", options, thread: "c_1", module: null, turn: "s_1", ...over });

describe("the question card", () => {
  it("picks a row by its key and answers at once; a typed answer goes with Answer", async () => {
    const client = { answerAsk: vi.fn().mockResolvedValue({ answered: "a1", turn: null }), dismissAsk: vi.fn() } as unknown as Client;
    const onAnswered = vi.fn();
    render(<AskCard ask={ask("a1", "Which size?", ["330 ml", "500 ml"])} client={client} onAnswered={onAnswered} />);
    const card = screen.getByRole("article", { name: "Alpha asks" });
    expect(screen.getByRole("button", { name: /330 ml/ })).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(card, { key: "2" });
    expect(client.answerAsk).toHaveBeenCalledWith("a1", "500 ml");
    await screen.findByRole("article", { name: "Alpha asks" });
    expect(onAnswered).toHaveBeenCalled();
  });

  it("lets several be ticked and sends them joined", async () => {
    const client = { answerAsk: vi.fn().mockResolvedValue({ answered: "a2", turn: null }), dismissAsk: vi.fn() } as unknown as Client;
    render(<AskCard ask={ask("a2", "Which days?", ["Mon", "Tue", "Wed"], { choose: "several", hint: "or the days in words" })} client={client} onAnswered={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Mon/ }));
    fireEvent.click(screen.getByRole("button", { name: /Wed/ }));
    expect(client.answerAsk).not.toHaveBeenCalled(); // several: a tick is a tick, not a send
    expect(screen.getByRole("button", { name: /Mon/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByPlaceholderText("or the days in words")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Answer" }));
    expect(client.answerAsk).toHaveBeenCalledWith("a2", "Mon, Wed");
    expect(pickWords(["a", "b"], true)).toBe("a, b");
    expect(pickWords(["a", "b"], false)).toBe("a");
  });
});

describe("one timeline", () => {
  it("puts the question where it was asked, folds an answered one, and places a thread's row at its time", async () => {
    const turns = [
      entry("s_1", "said", "log my lunch", "2026-10-16T09:00:00Z"),
      entry("r_1", "replied", "What did you have?", "2026-10-16T09:00:01Z", { turn: "s_1", duration_ms: 2000, num_turns: 1 }),
      entry("q_1", "asked", "What did you have for lunch?", "2026-10-16T09:00:02Z", { turn: "s_1", options: [], derived: true }),
      entry("s_2", "said", "a salad", "2026-10-16T09:05:00Z"),
      entry("r_2", "replied", "Logged a salad.", "2026-10-16T09:05:03Z", { turn: "s_2", duration_ms: 3000, num_turns: 2 }),
      // asked while the reply was still being written: it still shows after the reply
      entry("q_2", "asked", "Dressing?", "2026-10-16T09:05:01Z", { turn: "s_2", options: ["Olive oil", "None"] }),
    ];
    const thread: Thread = { id: "t_1", title: "Build: Lunch tracker", kind: "build", state: "working", module: null, created_at: "2026-10-16T09:02:00Z", updated_at: "2026-10-16T09:02:00Z", step_count: 3 } as Thread;
    const client = {
      conversation: vi.fn().mockResolvedValue({ turns, threads: [thread], actions: [], workflows: [], asks: [ask("q_2", "Dressing?", ["Olive oil", "None"], { turn: "s_2", at: "2026-10-16T09:05:04Z" })], conversations: [convo], conversation: convo }),
      newConversation: vi.fn(), agents: vi.fn().mockResolvedValue([]), thread: vi.fn().mockResolvedValue({ ...thread, journal: [] }),
    } as unknown as Client;
    const { container } = render(<Conversation layout="page" client={client} scopeName="Assistant" module={null} version={0} onChanged={vi.fn()} draft={null} onDraftTaken={vi.fn()} />);
    await screen.findByText("Dressing?");
    const kinds = [...container.querySelectorAll(".assist__content > *")].map((el) => (el.classList.contains("said") ? "said" : el.classList.contains("reply") ? "reply" : el.classList.contains("asked") ? "asked" : el.classList.contains("threadrow") ? "thread" : el.classList.contains("askcard") ? "ask" : el.classList.contains("intro") ? "intro" : el.className));
    expect(kinds).toEqual(["said", "reply", "asked", "thread", "said", "reply", "ask"]);
    expect(within(container.querySelector(".asked") as HTMLElement).getByText("What did you have for lunch?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Build: Lunch tracker: open the thread" })).toBeInTheDocument();
    expect(container.querySelector(".threadrow .badge")?.textContent).toBe("Working");
  });
});
