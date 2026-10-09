import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, Fact, Intelligence as Data, WorkGraph } from "../core/client";
import { TooltipProvider } from "../ui";
import { Intelligence, intelTab } from "./Intelligence";

const fact = (over: Partial<Fact>): Fact => ({ id: "f1", subject: "person", predicate: "home_city", value: "Berlin", valid_from: "2026-09-01T10:00:00+00:00", valid_to: null, recorded_at: "2026-09-02T10:00:00+00:00", source: "stated", why: null, confidence: 1, state: "accepted", ...over });
const data = {
  hands: [{ name: "files", title: "Files", description: "Reads folders", tools: [], origin: null }],
  skills: [{ name: "read_deals", kind: "read", site: null, module: "m1", url: null, description: "Reads the deal listings", when_to_use: null, effect: null, fields: [], version: 2, health: "ok", last_problem: null, last_run_at: null, last_count: null, last_ok_count: null, source: null, updated_at: "", notes: null }],
  automations: [{ id: "a1", title: "Check deals every morning", module: "m1", thread: null, schedule: "daily", when: "Every day at 07:00", procedure: "", enabled: true, next_run_at: null, last_run_at: null, last_result: null, last_error: null, goal: "deals", last_verdict: "partial" as const, last_why: "one source needs a sign-in" }],
  readers: [],
  connections: [],
  knowledge: { facts: [fact({}), fact({ id: "f2", predicate: "likes", value: "tea", state: "suggested", source: "turn:1" })], notes: [], goals: [], permissions: [] },
} as unknown as Data;

const world: WorkGraph = { at: "", nodes: [{ id: "you", kind: "you", title: "You" }, { id: "module:m1", kind: "module", title: "Deals", module: "m1" }, { id: "entity:p1", kind: "person", title: "Ada", entity: "p1" }], edges: [{ from: "entity:p1", to: "module:m1", kind: "named in" }] };

function mount(tab: string, onTab = vi.fn(), onGo = vi.fn()) {
  const client = { intelligence: vi.fn(async () => data), modules: vi.fn(async () => [{ id: "m1", name: "Deals" }]), activity: vi.fn(async () => []), graph: vi.fn(async () => world), preference: vi.fn(async () => ({ value: null })), setPreference: vi.fn(async () => ({})), switchAutomation: vi.fn(async () => ({})) } as unknown as Client;
  render(
    <TooltipProvider>
      <Intelligence client={client} tab={tab} version={0} onTab={onTab} onChanged={vi.fn()} onGo={onGo} />
    </TooltipProvider>,
  );
  return client;
}

describe("Intelligence", () => {
  it("has the tabs in the header; Map is a view of Second Brain and Activity is not a tab", async () => {
    const onTab = vi.fn();
    mount("second-brain", onTab);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Second Brain", "Agents", "Skills", "Connections"]);
    await userEvent.click(screen.getByRole("tab", { name: "Agents" }));
    expect(onTab).toHaveBeenCalledWith("agents");
  });

  it("puts what waits for a yes above the facts, opens a fact's provenance, and switches to the Map", async () => {
    localStorage.clear();
    const onTab = vi.fn();
    mount("second-brain", onTab);
    expect(await screen.findByText("Waiting for your confirmation", { selector: "h3" })).toBeInTheDocument();
    expect(screen.getByText("tea")).toBeInTheDocument();
    expect(screen.getByText("Berlin")).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Provenance" })[1]);
    expect(screen.getByText("You said so")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Map" }));
    expect(await screen.findByRole("textbox", { name: "Find on the map" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Brain" }));
    expect(onTab).not.toHaveBeenCalled();
  });

  it("draws the brain in an egg, and a click on a node opens it", async () => {
    localStorage.clear();
    const onGo = vi.fn();
    mount("second-brain", vi.fn(), onGo);
    await userEvent.click(await screen.findByRole("button", { name: "Deals, project" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m1" });
    await userEvent.click(screen.getByRole("button", { name: "Ada, person" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "entity", id: "p1" });
    await userEvent.click(screen.getByRole("button", { name: "Deals runner, agent" }));
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: "agent", id: "m1" }));
    await userEvent.click(screen.getByRole("button", { name: "Berlin, Home city" }));
    expect(screen.getByRole("heading", { name: "Home city" })).toBeInTheDocument(); // a fact shows beside the egg
  });

  it("lists each agent (an automation, Q33) as a row with its goal and verdict, and a row's click opens it", async () => {
    localStorage.clear();
    const onGo = vi.fn();
    mount("agents", vi.fn(), onGo);
    const row = (await screen.findByText("Check deals every morning")).closest("tr")!;
    expect(within(row).getByText("deals")).toBeInTheDocument();
    expect(within(row).getByText("Partial")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Check deals every morning"));
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: "automation", id: "a1" }));
    expect(screen.getByLabelText("View")).toBeEnabled(); // the toolbar picks the view (the data worker's "View")
  });

  it("switches an automation on and off from its On cell, and a row opens its page", async () => {
    localStorage.clear();
    const onGo = vi.fn();
    const client = mount("automations", vi.fn(), onGo);
    await userEvent.click(await screen.findByText("Check deals every morning"));
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: "automation", id: "a1" }));
    await userEvent.dblClick(screen.getByLabelText("Yes"));
    await userEvent.click(await screen.findByRole("option", { name: "No" }));
    await waitFor(() => expect(client.switchAutomation).toHaveBeenCalledWith("a1", false));
  });

  it("still draws Activity for its old address, with search first", async () => {
    mount("activity");
    expect(await screen.findByLabelText("Search activity")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Activity" })).toBeNull();
  });

  it("opens Second Brain for the old Knowledge address", () => {
    expect(intelTab("knowledge")).toBe("second-brain");
    expect(intelTab("activity")).toBe("activity");
    expect(intelTab("map")).toBe("map");
  });
});
