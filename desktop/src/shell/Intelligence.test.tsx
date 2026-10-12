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
  it("has the tabs in the header; the graph is a view of Second Brain and Activity is not a tab", async () => {
    const onTab = vi.fn();
    mount("second-brain", onTab);
    const header = screen.getByRole("tablist", { name: "Intelligence" });
    expect(within(header).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Second Brain", "Agents and automations", "Skills", "Connections"]);
    await userEvent.click(within(header).getByRole("tab", { name: "Agents and automations" }));
    expect(onTab).toHaveBeenCalledWith("agents");
  });

  it("opens on the Graph, one of the View dropdown's types, with no second switch (the owner, 12 Oct)", async () => {
    localStorage.clear();
    mount("second-brain");
    const view = await screen.findByRole("combobox", { name: "View" });
    expect(view).toHaveTextContent("Graph");
    expect(screen.queryByRole("tablist", { name: "Second Brain view" })).toBeNull();
    await userEvent.click(view);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Graph", "Table", "Board", "Gallery", "Calendar", "Timeline", "Form", "Dashboard"]);
  });

  it("puts facts, goals and hypotheses in one table, a hypothesis approved or rejected from its row", async () => {
    localStorage.clear();
    const onGo = vi.fn();
    const client = mount("second-brain", vi.fn(), onGo);
    (client as unknown as { decideFact: unknown }).decideFact = vi.fn(async () => ({}));
    await userEvent.click(await screen.findByRole("combobox", { name: "View" }));
    await userEvent.click(screen.getByRole("option", { name: "Table" }));
    const known = (await screen.findByText("You home city Berlin")).closest("tr")!;
    expect(within(known).getByText("Fact")).toBeInTheDocument();
    const guess = screen.getByText("You likes tea").closest("tr")!;
    expect(within(guess).getByText("Hypothesis")).toBeInTheDocument();
    expect(within(known).queryByRole("button", { name: "Reject" })).toBeNull(); // only a hypothesis has them
    await userEvent.click(within(guess).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(client.decideFact).toHaveBeenCalledWith("f2", false));
    await new Promise((r) => setTimeout(r, 300)); // past the row's click-to-open wait
    expect(onGo).not.toHaveBeenCalled(); // ✕ is the row's button, not a click on the row
    await userEvent.click(within(guess).getByRole("button", { name: "Approve" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Keep as a fact" }));
    await waitFor(() => expect(client.decideFact).toHaveBeenCalledWith("f2", true));
  });

  it("in Graph, the toolbar's search finds a node and nothing of the table shows under it", async () => {
    mount("second-brain");
    await userEvent.click(await screen.findByRole("combobox", { name: "View" }));
    await userEvent.click(screen.getByRole("option", { name: "Graph" }));
    await screen.findByRole("button", { name: "Deals, Projects" });
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search" }), "Deals");
    expect(await screen.findByRole("complementary", { name: "Deals" })).toBeInTheDocument(); // found and selected
    expect(screen.queryByText("Nothing matches.")).toBeNull(); // the table's empty line is not the graph's
    expect(screen.queryByRole("button", { name: "Filter" })).toBeNull();
  });

  it("draws everything as one graph: a click selects and shows the links, a double-click opens the page", async () => {
    localStorage.clear();
    const onGo = vi.fn();
    const client = mount("second-brain", vi.fn(), onGo);
    (client as unknown as { decideFact: unknown }).decideFact = vi.fn(async () => ({}));
    await userEvent.click(await screen.findByRole("combobox", { name: "View" })); // the view is kept, so choose it
    await userEvent.click(screen.getByRole("option", { name: "Graph" }));
    const deals = await screen.findByRole("button", { name: "Deals, Projects" });
    await userEvent.click(deals);
    const side = screen.getByRole("complementary", { name: "Deals" });
    expect(within(side).getByRole("button", { name: /Ada/ })).toBeInTheDocument(); // its links
    await userEvent.click(within(side).getByRole("button", { name: "Open page" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m1" });
    await userEvent.dblClick(screen.getByRole("button", { name: "Ada, People" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "entity", id: "p1" });
    // the local graph: one link around Ada leaves out what is two away
    await userEvent.click(screen.getByRole("tab", { name: "1 link" }));
    expect(screen.queryByRole("button", { name: "Berlin, Facts" })).toBeNull();
    expect(screen.getByRole("button", { name: "Deals, Projects" })).toBeInTheDocument();
    // a hypothesis is kept as a fact from the panel
    await userEvent.click(screen.getByRole("tab", { name: "All" }));
    await userEvent.click(screen.getByRole("button", { name: "tea, Hypotheses" }));
    await userEvent.click(within(screen.getByRole("complementary", { name: "tea" })).getByRole("button", { name: "Approve" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Keep as a fact" }));
    await waitFor(() => expect(client.decideFact).toHaveBeenCalledWith("f2", true));
    // the legend hides a kind
    await userEvent.click(screen.getByRole("button", { name: /^People/ }));
    expect(screen.queryByRole("button", { name: "Ada, People" })).toBeNull();
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
    await userEvent.click(await screen.findByText("Check deals every morning", undefined, { timeout: 4000 }));
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: "automation", id: "a1" }));
    await userEvent.dblClick(screen.getByLabelText("Yes"));
    await userEvent.click(await screen.findByRole("option", { name: "No" }));
    await waitFor(() => expect(client.switchAutomation).toHaveBeenCalledWith("a1", false));
  });

  it("lists Alpha as one agent among the others, opening its agent page, with one New in the toolbar", async () => {
    localStorage.clear();
    const onGo = vi.fn();
    mount("agents", vi.fn(), onGo);
    await screen.findByText("Alpha — your assistant", undefined, { timeout: 4000 });
    const toolbar = document.querySelector(".toolbar--page")!;
    expect(screen.queryByRole("button", { name: "Add agent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add automation" })).toBeNull();
    // between Filter and ⋮ (the rulebook §6)
    const names = within(toolbar as HTMLElement).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names.slice(-2)).toEqual(["New", "More"]);
    expect(names.indexOf("Filter")).toBeLessThan(names.indexOf("New"));
    await userEvent.click(await screen.findByText("Alpha — your assistant", undefined, { timeout: 4000 }));
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: "agent", id: "alpha" }));
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
