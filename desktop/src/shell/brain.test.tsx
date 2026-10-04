import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Fact } from "../core/client";
import { TooltipProvider } from "../ui";
import { AboutYou, sourceWords } from "./AboutYou";
import { FirstSteps } from "./FirstSteps";
import { parseInputs } from "./Skills";

const fact = (over: Partial<Fact>): Fact => ({ id: "f_1", subject: "person", predicate: "degree", value: "MSc", valid_from: "", valid_to: null, recorded_at: "2026-10-01T10:00:00+00:00", source: "person", why: null, confidence: 1, state: "accepted", ...over });

describe("About you", () => {
  it("says where each fact came from", () => {
    expect(["person", "module:m_1", "turn:j_1", "alpha"].map(sourceWords)).toEqual(["You said so", "From a project", "From a conversation", "Alpha worked it out"]);
  });

  it("corrects, forgets and adds facts, and waits for a yes on suggestions", async () => {
    const client = { addFact: vi.fn(async () => fact({})), forgetFact: vi.fn(async () => ({ forgotten: "f_1" })), decideFact: vi.fn(async () => fact({})) } as unknown as Client;
    const facts = [fact({}), fact({ id: "f_2", predicate: "target_roles", value: "PM", state: "suggested", source: "turn:j_1", why: "You said so on Monday" })];
    render(
      <TooltipProvider>
        <AboutYou client={client} facts={facts} modules={[]} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getByText("1 known")).toBeInTheDocument();
    expect(screen.getByText("From a conversation · You said so on Monday")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, that's right" }));
    await waitFor(() => expect(client.decideFact).toHaveBeenCalledWith("f_2", true));
    fireEvent.click(screen.getByText("MSc"));
    const input = screen.getByRole("textbox", { name: "Correct Degree" });
    fireEvent.change(input, { target: { value: "MSc CS" } });
    fireEvent.blur(input);
    await waitFor(() => expect(client.addFact).toHaveBeenCalledWith("degree", "MSc CS"));
    fireEvent.click(screen.getByRole("button", { name: "Forget Degree" }));
    await waitFor(() => expect(client.forgetFact).toHaveBeenCalledWith("f_1"));
    fireEvent.change(screen.getByRole("textbox", { name: "What" }), { target: { value: "Target roles!" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Value" }), { target: { value: "PM, Ops" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(client.addFact).toHaveBeenCalledWith("target_roles", "PM, Ops"));
  });
});

describe("Skills", () => {
  it("reads what a skill needs, a ? marking optional", () => {
    expect(parseInputs("Industry, city?, ")).toEqual([
      { name: "industry", description: "", required: true },
      { name: "city", description: "", required: false },
    ]);
  });
});

describe("First steps", () => {
  it("asks five questions and offers where to begin", async () => {
    const questions = [{ id: "occupation", label: "What do you do?", hint: "Work, study, a hobby or two." }];
    const answerOnboarding = vi.fn(async () => ({ done: true, questions, proposal: { intro: "Start here.", options: [{ title: "Courses", request: "Keep a list of my courses", why: "Your week." }] } }));
    const client = { onboarding: async () => ({ done: false, questions, proposal: null }), answerOnboarding, skipOnboarding: vi.fn() } as unknown as Client;
    const onStart = vi.fn();
    render(<FirstSteps client={client} onStart={onStart} />);
    fireEvent.change(await screen.findByLabelText("What do you do?"), { target: { value: "Student" } });
    fireEvent.click(screen.getByRole("button", { name: "Propose where to begin" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start with this" }));
    expect(answerOnboarding).toHaveBeenCalledWith({ occupation: "Student" });
    expect(onStart).toHaveBeenCalledWith("Keep a list of my courses");
  });
});
