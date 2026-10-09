import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Plan } from "../core/client";
import { PlanCard, withoutPlanQuestions } from "./AssistantPanel";

const plan: Plan = {
  id: "p_1", title: "Car Wash Site Scoring", body: "Scores a site.", state: "proposed", module: null, thread: null, turn: "t_1", proposal: null, report: null, created_at: "",
  questions: [
    { text: "Proceed keyless on the Census API for now, or grab a free API key first?", options: ["Proceed keyless for now", "Get a free API key first"], default: "Proceed keyless for now", answer: null, derived: true },
    { text: "A real address as the first trial site, or should I pick one myself?", options: [], default: null, answer: null, derived: true },
  ],
};

describe("a plan with questions", () => {
  it("shows the choices with Alpha's pick selected and sends the answers with the yes", async () => {
    const client = { approvePlan: vi.fn().mockResolvedValue({ ...plan, state: "approved" }), declinePlan: vi.fn(), resumePlan: vi.fn() } as unknown as Client;
    render(<PlanCard plan={plan} client={client} onDecided={vi.fn()} />);
    const keyless = screen.getByRole("button", { name: /Proceed keyless for now/ });
    expect(keyless).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/One question has no pick yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Get a free API key first/ }));
    fireEvent.change(screen.getByLabelText(/Your answer: A real address/), { target: { value: "12 Main St, Austin" } });
    expect(screen.getByText(/Alpha's picks are selected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Build with these" }));
    await vi.waitFor(() => expect(client.approvePlan).toHaveBeenCalledWith("p_1", { "0": "Get a free API key first", "1": "12 Main St, Austin" }, undefined));
  });

  it("shows a researched plan's pieces in three blocks with Alpha's pick pressed and sends the decisions with the yes", async () => {
    const researched: Plan = {
      ...plan, id: "p_2", questions: [], research: "rs_1",
      pieces: [
        { id: "sites", title: "Sites list", what: "Every candidate, one row.", why: null, evidence: ["f_1"], known: null, build: "One table.", can: "now", needs: null, recommend: "keep", kind: "kept", decision: null, sources: [{ title: "GrowthFactor", url: "https://growthfactor.ai/tour" }] },
        { id: "gates", title: "Gates", what: "One miss kills a site.", why: "operators kill sites, they don't average them", evidence: [], known: "your Deal Tracker", build: null, can: "not_yet", needs: "a score over rows", recommend: "defer", kind: "choice", decision: null, sources: [] },
        { id: "foot", title: "Foot traffic", what: "Visits per day.", why: null, evidence: ["f_1"], known: null, build: null, can: "needs", needs: "paid data", recommend: "skip", kind: "wont", decision: null, sources: [] },
      ],
    };
    const client = { approvePlan: vi.fn().mockResolvedValue({ ...researched, state: "approved" }), declinePlan: vi.fn(), resumePlan: vi.fn() } as unknown as Client;
    render(<PlanCard plan={researched} client={client} onDecided={vi.fn()} />);
    for (const group of ["Kept for you", "Your call", "Not this time"]) expect(screen.getByRole("region", { name: group })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GrowthFactor" })).toHaveAttribute("href", "https://growthfactor.ai/tour");
    expect(screen.getByText(/Not yet: a score over rows/)).toBeInTheDocument();
    const gates = screen.getByRole("group", { name: "Decide: Gates" });
    expect(gates.querySelector('[aria-pressed="true"]')).toHaveTextContent(/Defer/);
    expect(screen.getByText(/1 of 3 pieces kept/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("group", { name: "Decide: Foot traffic" }).querySelector("button")!);
    expect(screen.getByText(/2 of 3 pieces kept/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Build with these" }));
    await vi.waitFor(() => expect(client.approvePlan).toHaveBeenCalledWith("p_2", undefined, { sites: "keep", gates: "defer", foot: "keep" }));
  });

  it("strips the numbered questions the card carries from the reply", () => {
    const reply = "Here is the plan.\n\nTwo quick questions before I build it:\n\n1. Proceed keyless, or grab a key first?\n2. A real address, or should I pick one myself?";
    expect(withoutPlanQuestions(reply, [plan], "t_1")).toBe("Here is the plan.");
    expect(withoutPlanQuestions(reply, [plan], "t_2")).toBe(reply);
  });
});
