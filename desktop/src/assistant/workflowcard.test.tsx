import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Client, Workflow } from "../core/client";
import { WorkflowCard } from "./AssistantPanel";

const workflow: Workflow = {
  id: "wf_1", title: "Picking car wash sites", words: null, state: "drafted", version: 1, conversation: null, module: null, created_at: "", updated_at: "",
  body: {
    purpose: "Decide which sites to pursue.",
    steps: [
      { id: "arrives", title: "A site arrives", what: "You type the address.", who: "you", takes: null, gives: "a site", reaches: [], outward: false, when: "when a site arrives" },
      { id: "checks", title: "The checks", what: "Households, traffic, TAQ.", who: "alpha", takes: "a site", gives: "checks", reaches: ["Census ACS"], outward: false, when: "when a site arrives" },
      { id: "send", title: "Send the memo", what: "To investors.", who: "you", takes: null, gives: null, reaches: [], outward: true, when: "when asked" },
    ],
    keeps: [{ key: "site", thing: "Site", what: null, fields: [{ name: "address", label: "Address", kind: "text", unit: null }], relates_to: [] }],
    documents: [{ name: "Investor memo", from: "the checks", for: "investors", what: null }],
    settings: [{ key: "floor", label: "Traffic floor", value: 30000, unit: "cars/day", origin: "your document", why: null }],
    assumptions: ["Traffic is read from the fronting road."],
    suggestions: [{ id: "benchmarks", title: "Check against your best stores", what: "Run them first.", why: null, sources: ["https://x.example/a"], decision: null }],
    questions: [{ text: "Which metro first?", options: ["Austin", "Denver"], default: "Austin", answer: null }],
  },
};

describe("Your workflow", () => {
  it("shows the steps with who does each, the suggestions to add or skip, and sends the yes", async () => {
    const client = { agreeWorkflow: vi.fn().mockResolvedValue({ ...workflow, state: "agreed" }), declineWorkflow: vi.fn() } as unknown as Client;
    render(<WorkflowCard workflow={workflow} client={client} onDecided={vi.fn()} />);
    expect(screen.getByText("Decide which sites to pursue.")).toBeInTheDocument();
    expect(screen.getAllByText("You")).toHaveLength(2);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("asks you first")).toBeInTheDocument();
    expect(screen.getByText(/reads Census ACS/)).toBeInTheDocument();
    expect(screen.queryByText(/Traffic floor/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show 2/ }));
    expect(screen.getByText(/Traffic floor/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /source 1/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "why?" }));
    expect(screen.getByRole("link", { name: /source 1/ })).toHaveAttribute("href", "https://x.example/a");
    const group = screen.getByRole("group", { name: "Decide: Check against your best stores" });
    expect(group.querySelector('[aria-pressed="true"]')).toHaveTextContent("Add it");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, build it" }));
    await vi.waitFor(() => expect(client.agreeWorkflow).toHaveBeenCalledWith("wf_1", { benchmarks: "skip" }, { "0": "Austin" }));
  });
});
