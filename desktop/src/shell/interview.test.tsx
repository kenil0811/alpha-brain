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

const PLAN =
  '{"context": "Busy term.", "gaps": ["No targets"], "questions": [' +
  '{"id": "q1", "topic": "Work", "question": "What matters most this month?", "value": 9, "minutes": 1}, ' +
  '{"id": "q2", "topic": "Work", "question": "Who is in the way?", "value": 8, "minutes": 1}, ' +
  '{"id": "q3", "topic": "Alpha", "question": "What does done look like?", "value": 7, "minutes": 1}]}';
const DRAFTS = '{"summary": "Two things to keep.", "items": [{"kind": "fact", "about": "person", "label": "focus", "text": "Recruiting"}, {"kind": "note", "about": "alpha", "label": "Done means", "text": "A beta"}]}';

const zazoo = () => document.querySelector(".interview__zazoo")!.getAttribute("data-mood");
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

afterEach(() => vi.useRealTimers());

describe("Interview", () => {
  it("speaks, listens, hears skip, and ends in the review", { timeout: 20_000 }, async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
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

    // The first question is said aloud, mouth talking, and never written on screen.
    expect(fake.spoken[0]).toMatch(/What matters most this month\?$/);
    expect(zazoo()).toBe("talking");
    expect(screen.queryByText("What matters most this month?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show words/ }));
    expect(screen.getByText("What matters most this month?")).toBeInTheDocument();

    // Said: Zazoo listens; an answer and two seconds of quiet bring the next question.
    await act(async () => fake.done());
    expect(zazoo()).toBe("listening");
    expect(fake.speech.listening).toBe(true);
    act(() => fake.hear("Recruiting", ""));
    await wait(3200);
    expect(fake.spoken[1]).toBe("Who is in the way?");
    expect(zazoo()).toBe("talking");

    // "skip" by voice moves on without an answer.
    await act(async () => fake.done());
    act(() => fake.hear("skip", ""));
    await wait(3200);
    expect(fake.spoken[2]).toMatch(/What does done look like\?$/);

    // End: Zazoo drafts from what was said, and the review lists it to tick.
    fireEvent.click(screen.getByRole("button", { name: /End/ }));
    expect(await screen.findByText("Two things to keep.")).toBeInTheDocument();
    expect(asked[1]).toContain("A: Recruiting");
    expect(asked[1]).not.toContain("Who is in the way?");
    fireEvent.click(screen.getByLabelText("Keep focus"));
    fireEvent.click(screen.getByRole("button", { name: "Keep 1" }));
    expect(await screen.findByText(/Kept 1 thing/)).toBeInTheDocument();
    expect(client.writeNote).toHaveBeenCalledWith("module:alpha", expect.stringMatching(/^Done means \(Interview me, /), "A beta");
    expect(asked).toHaveLength(2); // the unticked fact never reaches Zazoo
  });
});
