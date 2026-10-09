import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, Fact, Intelligence as Data } from "../core/client";
import { Intelligence, intelTab } from "./Intelligence";

const fact = (over: Partial<Fact>): Fact => ({ id: "f1", subject: "person", predicate: "home_city", value: "Berlin", valid_from: "2026-09-01T10:00:00+00:00", valid_to: null, recorded_at: "2026-09-02T10:00:00+00:00", source: "stated", why: null, confidence: 1, state: "accepted", ...over });
const data = {
  hands: [{ name: "files", title: "Files", description: "Reads folders", tools: [], origin: null }],
  skills: [{ name: "read_deals", kind: "read", site: null, module: "m1", url: null, description: "Reads the deal listings", when_to_use: null, effect: null, fields: [], version: 2, health: "ok", last_problem: null, last_run_at: null, last_count: null, last_ok_count: null, source: null, updated_at: "", notes: null }],
  automations: [{ id: "a1", title: "Check deals every morning", module: "m1", thread: null, schedule: "daily", when: "Every day at 07:00", procedure: "", enabled: true, next_run_at: null, last_run_at: null, last_result: null, last_error: null }],
  readers: [],
  connections: [],
  knowledge: { facts: [fact({}), fact({ id: "f2", predicate: "likes", value: "tea", state: "suggested", source: "turn:1" })], notes: [], goals: [], permissions: [] },
} as unknown as Data;

function mount(tab: string, onTab = vi.fn()) {
  const client = { intelligence: vi.fn(async () => data), modules: vi.fn(async () => [{ id: "m1", name: "Deals" }]), activity: vi.fn(async () => []) } as unknown as Client;
  render(<Intelligence client={client} tab={tab} version={0} onTab={onTab} onChanged={vi.fn()} onGo={vi.fn()} />);
  return onTab;
}

describe("Intelligence", () => {
  it("has the tabs in the header: Second Brain, Agents and Activity among them", async () => {
    const onTab = mount("second-brain");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Second Brain", "Agents", "Automations", "Skills", "Connections", "Activity", "Map"]);
    await userEvent.click(screen.getByRole("tab", { name: "Agents" }));
    expect(onTab).toHaveBeenCalledWith("agents");
  });

  it("puts what waits for a yes above the facts, and opens a fact's provenance", async () => {
    mount("second-brain");
    expect(await screen.findByText("Waiting for your confirmation", { selector: "h3" })).toBeInTheDocument();
    expect(screen.getByText("tea")).toBeInTheDocument();
    expect(screen.getByText("Berlin")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Provenance" })[1]);
    expect(screen.getByText("You said so")).toBeInTheDocument();
  });

  it("lists Alpha and each module's runner as agent cards that open their own page", async () => {
    mount("agents");
    expect(await screen.findByRole("button", { name: "Open Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Deals runner" })).toBeInTheDocument();
  });

  it("renders Activity as a tab, with search first", async () => {
    mount("activity");
    expect(await screen.findByLabelText("Search activity")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Activity" })).toBeNull();
  });

  it("opens Second Brain for the old Knowledge address", () => {
    expect(intelTab("knowledge")).toBe("second-brain");
    expect(intelTab("activity")).toBe("activity");
  });
});
