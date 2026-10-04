import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { ToastProvider, TooltipProvider } from "../ui";
import { type Answers, back, beginRequests, commit, nextGroup, NOTE_TITLE, noteBody, professionKind, speciesFromText } from "./onboarding";
import { Onboarding, saveFirstSteps } from "./OnboardingDialog";

/** Walks the screens, answering each question with its first option or a sales profession. */
function walk(): string[][] {
  let answers: Answers = {};
  const screens: string[][] = [];
  for (let group = nextGroup(answers); group; group = nextGroup(answers)) {
    screens.push(group.questions.map((q) => q.id));
    const drafts: Answers = {};
    for (const q of group.questions) drafts[q.id] = q.kind === "text" ? "Sales lead; I run" : q.kind === "multi" ? [q.options![0].value] : q.options![0].value;
    answers = { ...answers, ...commit(group.questions, drafts) };
  }
  return screens;
}

describe("first steps questions", () => {
  it("asks Bridge's six questions on three screens, in order", () => {
    expect(walk()).toEqual([
      ["companion_name", "profession"],
      ["workday", "work_context"],
      ["work_lives", "begin"],
    ]);
  });

  it("templates the later questions by profession", () => {
    expect(professionKind("Account executive")).toBe("sales");
    expect(professionKind("Lecturer in economics")).toBe("teaching");
    expect(professionKind("Chef")).toBe("operating");
    const sales = nextGroup({ companion_name: "Rex", profession: "Sales lead" })!;
    const teacher = nextGroup({ companion_name: "Rex", profession: "Teacher" })!;
    expect(sales.questions[0].options![0].label).toBe("Moving deals forward");
    expect(sales.questions[0].max).toBe(3);
    expect(teacher.questions[1].prompt).toMatch(/look someone up/);
  });

  it("caps picks at three and drops ones a changed profession no longer offers", () => {
    const group = nextGroup({ companion_name: "Rex", profession: "Sales lead" })!;
    expect(commit(group.questions, { workday: ["pipeline", "people", "research", "planning", "making"], work_context: "nope" })).toEqual({ workday: ["pipeline", "people", "research"], work_context: "" });
  });

  it("goes back a screen with its answers as drafts", () => {
    const answers = { companion_name: "Rex", profession: "Sales lead", workday: ["pipeline"], work_context: "amount" };
    const step = back(answers, 2);
    expect(step.answers).toEqual({ companion_name: "Rex", profession: "Sales lead" });
    expect(step.drafts).toEqual({ workday: ["pipeline"], work_context: "amount" });
    expect(nextGroup(step.answers)!.index).toBe(1);
  });

  it("matches an animal it can be as a whole word only", () => {
    expect(speciesFromText("Rex the Fox")?.id).toBe("freya");
    expect(speciesFromText("my red panda")?.id).toBe("maple");
    expect(speciesFromText("Foxglove")).toBeUndefined();
    expect(speciesFromText("Luna")).toBeUndefined();
  });

  it("writes the note in words and drafts each place to begin", () => {
    const answers = { companion_name: "Rex", profession: "Sales lead", workday: ["pipeline"], work_context: "amount", work_lives: ["email"], begin: ["track_stage", "surface_signals"] };
    expect(noteBody(answers)).toBe(
      "- Companion's name: Rex\n- Work and life: Sales lead\n- What fills the workday: Moving deals forward\n- On a live deal, what do you need in front of you first? The value on the table\n- Where the work lives: Email\n- Where to begin: Keep track of where things stand, Surface what needs a response",
    );
    expect(beginRequests(answers).map((r) => r.text)).toEqual(["Set up a project for my deals, with where each one stands and its value", "Tell me each morning what needs a response from me in my email"]);
  });
});

function mockClient() {
  return {
    writeNote: vi.fn(async () => ({})),
    setPreference: vi.fn(async (key: string, value: unknown) => ({ key, value })),
    preference: vi.fn(async (key: string) => ({ key, value: null })),
  };
}

describe("first steps saving", () => {
  it("saves the note, the name, then done", async () => {
    const client = mockClient();
    const answers = { companion_name: "Rex", profession: "Chef", begin: [] };
    await saveFirstSteps(client as unknown as Client, answers);
    expect(client.writeNote).toHaveBeenCalledWith("person", NOTE_TITLE, noteBody(answers), expect.any(String));
    expect(client.setPreference.mock.calls).toEqual([
      ["companion_name", "Rex"],
      ["onboarding", { done: true, answers }],
    ]);
  });

  it("doesn't mark done when the note fails", async () => {
    const client = mockClient();
    client.writeNote.mockRejectedValueOnce(new Error("no"));
    await expect(saveFirstSteps(client as unknown as Client, { companion_name: "Rex" })).rejects.toThrow("no");
    expect(client.setPreference).not.toHaveBeenCalled();
  });

  it("runs the pop-up through to a drafted request, never sending it", async () => {
    const client = mockClient();
    const onAsk = vi.fn();
    const onClose = vi.fn();
    render(
      <TooltipProvider>
        <ToastProvider>
          <Onboarding client={client as unknown as Client} open onClose={onClose} onAsk={onAsk} />
        </ToastProvider>
      </TooltipProvider>,
    );
    const cont = () => screen.getByRole("button", { name: /Continue|Finish/ });
    expect(cont()).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /call your companion/ }), { target: { value: "Rex the Fox" } });
    expect(screen.getByText("Will look like a fox.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /what do you do/i }), { target: { value: "Sales lead" } });
    fireEvent.click(cont());
    fireEvent.click(await screen.findByRole("button", { name: "Moving deals forward" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox", { name: /what do you do/i })).toHaveValue("Sales lead");
    fireEvent.click(cont());
    expect(screen.getByRole("button", { name: "Moving deals forward" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(cont());
    fireEvent.click(screen.getByRole("button", { name: "Keep track of where things stand" }));
    fireEvent.click(cont());
    expect(await screen.findByText("Rex the Fox is ready.")).toBeInTheDocument();
    expect(client.writeNote).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Start in Zazoo" }));
    expect(onAsk).toHaveBeenCalledWith("Set up a project for my deals, with where each one stands");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  }, 30_000);
});
