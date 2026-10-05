import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client, ModuleCard } from "../core/client";
import { TooltipProvider } from "../ui";
import { Interview } from "./Interview";
import { INTERVIEWER } from "./interviewPlan";

// Fake speech: Zazoo's voice finishes when the test says so; the ear hears what the test says.
const fake = vi.hoisted(() => {
  const state = {
    spoken: [] as string[],
    done: () => {},
    hear: (_final: string, _interim: string) => {},
    speech: { supported: true, listening: false, error: null as string | null, start: () => {}, stop: () => {}, toggle: () => {} },
  };
  state.speech.start = () => void (state.speech.listening = true);
  state.speech.stop = () => void (state.speech.listening = false);
  return state;
});
vi.mock("./say", () => ({
  say: (text: string) => {
    fake.spoken.push(text);
    return new Promise<void>((resolve) => (fake.done = resolve));
  },
  stopSaying: () => fake.done(),
}));
vi.mock("./voice", () => ({
  useSpeech: (onText: (final: string, interim: string) => void) => {
    fake.hear = onText;
    return fake.speech;
  },
}));

// Zazoo knows nothing about the person: "About you" opens, then Work and Alpha in the interview's drawn order.
const PLAN =
  '{"context": "New here.", "gaps": ["Who they are"], "topics": [{"name": "About you", "goal": "Who they are", "opening": true}, {"name": "Work", "goal": "What they work on"}, {"name": "Alpha", "goal": "What done means"}], "questions": [' +
  '{"id": "y1", "topic": "About you", "question": "What do you do?", "value": 6, "seconds": 12}, ' +
  '{"id": "w1", "topic": "Work", "question": "What are you working on?", "value": 9, "seconds": 12}, ' +
  '{"id": "w2", "topic": "Work", "question": "Who is in the way?", "parent": "w1", "when": "they are working on something", "value": 8, "seconds": 12}, ' +
  '{"id": "a1", "topic": "Alpha", "question": "What does done look like?", "value": 7, "seconds": 12}]}';
const DRAFTS = '{"summary": "Two things to keep.", "items": [{"kind": "fact", "about": "person", "label": "focus", "text": "Recruiting"}, {"kind": "note", "about": "alpha", "label": "Done means", "text": "A beta"}]}';

const zazoo = () => document.querySelector(".interview__zazoo")!.getAttribute("data-mood");
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Interview", () => {
  it("opens about the person, moves to the next topic when told to, and ends in the review", { timeout: 20_000 }, async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(Math, "random").mockReturnValue(0.5); // draws Work before Alpha
    localStorage.clear();
    fake.spoken = [];
    const asked: string[] = [];
    const client = {
      newConversation: vi.fn(async () => ({ id: "c_1" })),
      askAndWait: vi.fn(async (text: string) => {
        asked.push(text);
        return { id: "t", state: "done", text, reply: asked.length === 1 ? PLAN : DRAFTS };
      }),
      writeNote: vi.fn(async () => ({})),
    } as unknown as Client;
    render(
      <TooltipProvider>
        <Interview client={client} tool={INTERVIEWER} modules={[{ id: "alpha", name: "Alpha" }] as ModuleCard[]} onBack={vi.fn()} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Start the interview/ }));

    // The opening question is about the person, said aloud, mouth talking, and never written on screen.
    expect(fake.spoken[0]).toMatch(/What do you do\?$/);
    expect(zazoo()).toBe("talking");
    expect(screen.queryByText("What do you do?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show words/ }));
    expect(screen.getByText("What do you do?")).toBeInTheDocument();

    // Said: Zazoo listens; an answer and two seconds of quiet bring the next topic's gate question.
    await act(async () => fake.done());
    expect(zazoo()).toBe("listening");
    expect(fake.speech.listening).toBe(true);
    act(() => fake.hear("Recruiting", ""));
    await wait(3200);
    expect(fake.spoken[1]).toBe("Thanks. Next, work. What are you working on?");
    expect(zazoo()).toBe("talking");

    // Vikas's answer: the follow-up that assumed work is never asked; Zazoo bridges to the next topic.
    await act(async () => fake.done());
    act(() => fake.hear("I'm not working on anything, let's move on to a different topic", ""));
    await wait(3200);
    expect(fake.spoken[2]).toBe("OK, let's talk about alpha. What does done look like?");
    expect(screen.getByText("OK, let's talk about alpha.")).toBeInTheDocument(); // shown, since words are on

    // "skip" by voice moves on without an answer; nothing is left, so Zazoo drafts and the review lists it to tick.
    await act(async () => fake.done());
    act(() => fake.hear("skip", ""));
    await wait(3200);
    expect(await screen.findByText("Two things to keep.")).toBeInTheDocument();
    expect(fake.spoken).toHaveLength(3);
    expect(asked[1]).toContain("A: Recruiting");
    expect(asked[1]).not.toContain("Who is in the way?");
    expect(asked[1]).not.toContain("What does done look like?");
    fireEvent.click(screen.getByLabelText("Keep focus"));
    fireEvent.click(screen.getByRole("button", { name: "Keep 1" }));
    expect(await screen.findByText(/Kept 1 thing/)).toBeInTheDocument();
    expect(client.writeNote).toHaveBeenCalledWith("module:alpha", expect.stringMatching(/^Done means \(Interview me, /), "A beta");
    expect(asked).toHaveLength(2); // the unticked fact never reaches Zazoo
  });

  it("says at once when it didn't catch an answer, asks again, and offers typing after two misses", { timeout: 20_000 }, async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    localStorage.clear();
    fake.spoken = [];
    const client = {
      newConversation: vi.fn(async () => ({ id: "c_1" })),
      askAndWait: vi.fn(async (text: string) => ({ id: "t", state: "done", text, reply: PLAN })),
      writeNote: vi.fn(async () => ({})),
    } as unknown as Client;
    render(
      <TooltipProvider>
        <Interview client={client} tool={INTERVIEWER} modules={[]} onBack={vi.fn()} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Start the interview/ }));
    await act(async () => fake.done());

    // Something was heard, but no words came back: within a few seconds, not ten, Zazoo says so.
    act(() => fake.hear("", "um"));
    act(() => fake.hear("", ""));
    await wait(4000);
    expect(fake.spoken[1]).toBe("Sorry, I didn't catch that. Could you say it again?");
    expect(screen.queryByLabelText("Your answer")).toBeNull();

    // A second miss: the typed answer appears, and a typed answer moves the interview on.
    await act(async () => fake.done());
    act(() => fake.hear("", "um"));
    act(() => fake.hear("", ""));
    await wait(4000);
    expect(fake.spoken[2]).toMatch(/type it below/);
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "I run a fund" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(fake.spoken[3]).toMatch(/What are you working on\?$/);
  });
});
