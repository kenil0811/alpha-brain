import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, GraphKind, WorkGraph } from "../../core/client";
import { TooltipProvider } from "../../ui";
import { anchorsFor, makeSimulation, positionsOf, settle, toMapEdges, toMapNodes } from "./layout";
import { shape } from "./shape";
import { addressOf, edgeWords, WorkMap } from "./WorkMap";

const graph: WorkGraph = {
  at: "2026-10-03T20:00:00+00:00",
  nodes: [
    { id: "module:m1", kind: "module", title: "Deals", module: "m1" },
    { id: "module:m2", kind: "module", title: "Food", module: "m2" },
    { id: "table:deals", kind: "table", title: "Deal listings", subtitle: "837 rows", module: "m1", rows: 837 },
    { id: "table:food", kind: "table", title: "Food log", subtitle: "5 rows", module: "m2", rows: 5 },
    { id: "skill:brokers", kind: "skill", role: "read", title: "brokers", subtitle: "brokers.com", state: "broken", detail: "the list moved", name: "brokers", runs: 4, failed: 1 },
    { id: "skill:run_deals", kind: "skill", role: "run", title: "run deals", subtitle: "2 steps", state: "ok", name: "run_deals", module: "m1" },
    { id: "automation:a1", kind: "automation", title: "Daily deals", subtitle: "daily 07:00", state: "on", module: "m1" },
    { id: "connection:c1", kind: "connection", title: "brokers.com", subtitle: "browser", state: "connected" },
  ],
  edges: [
    { from: "table:deals", to: "module:m1", kind: "in" },
    { from: "table:food", to: "module:m2", kind: "in" },
    { from: "automation:a1", to: "skill:run_deals", kind: "runs" },
    { from: "skill:run_deals", to: "skill:brokers", kind: "runs", order: 1 },
    { from: "skill:brokers", to: "table:deals", kind: "reads into", source: "step 1 of run_deals" },
    { from: "connection:c1", to: "skill:brokers", kind: "signed in at", source: "brokers.com" },
  ],
};

describe("the layout", () => {
  it("settles every node to a finite place, members near their module", () => {
    const shaped = shape(graph);
    const anchors = anchorsFor(shaped.homes, 800, 600);
    const nodes = toMapNodes(shaped.nodes, anchors);
    settle(makeSimulation(nodes, toMapEdges(shaped.edges, nodes), anchors));
    const at = positionsOf(nodes);
    for (const n of graph.nodes) expect(Number.isFinite(at[n.id].x) && Number.isFinite(at[n.id].y)).toBe(true);
    const d = (a: string, b: string) => Math.hypot(at[a].x - at[b].x, at[a].y - at[b].y);
    expect(d("table:deals", "module:m1")).toBeLessThan(d("table:deals", "module:m2"));
    expect(d("table:food", "module:m2")).toBeLessThan(d("table:food", "module:m1"));
  });
});

describe("the map", () => {
  function client() {
    const c = { graph: vi.fn(async () => graph), connectGraph: vi.fn(async () => ({ proposed: [], why: null })), decideFact: vi.fn(async () => ({})) };
    return c as unknown as Client & typeof c;
  }

  it("draws every thing, opens a card on a click, and the card opens the page", async () => {
    const user = userEvent.setup();
    const onGo = vi.fn();
    render(
      <TooltipProvider>
        <WorkMap client={client()} onGo={onGo} initialKind="work" />
      </TooltipProvider>,
    );
    expect(await screen.findByRole("img", { name: "8 things and 4 links" })).toBeInTheDocument();
    const broker = await screen.findByRole("button", { name: "brokers, read skill, brokers.com" });
    expect(broker).toHaveClass("map__node--bad");
    await user.click(broker);
    const card = screen.getByRole("complementary", { name: "brokers" });
    expect(within(card).getByText("broken: the list moved")).toBeInTheDocument();
    expect(within(card).getByText("4 runs in 30 days, 1 failed")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "reads into Deal listings" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "brokers.com signed in at this" })).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Open page" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "skill", name: "brokers" });
  });

  it("a legend chip hides a kind and its links", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <WorkMap client={client()} initialKind="work" />
      </TooltipProvider>,
    );
    await screen.findByRole("img", { name: "8 things and 4 links" });
    await user.click(screen.getByRole("button", { name: /^Connections/, pressed: true }));
    expect(await screen.findByRole("img", { name: "7 things and 3 links" })).toBeInTheDocument();
  });

  it("finds a thing by name and lights it", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <WorkMap client={client()} initialKind="work" />
      </TooltipProvider>,
    );
    await screen.findByRole("img", { name: "8 things and 4 links" });
    await user.type(screen.getByRole("textbox", { name: "Find on the map" }), "food");
    const food = await screen.findByRole("button", { name: /^Food log, table, 5 rows/ });
    expect(food).not.toHaveClass("map__node--dim");
    expect(screen.getByRole("button", { name: "Deals, area" })).toHaveClass("map__node--dim");
  });

  it("a module's card can show just that module, and everything again", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <WorkMap client={client()} initialKind="work" />
      </TooltipProvider>,
    );
    await screen.findByRole("img", { name: "8 things and 4 links" });
    await user.click(await screen.findByRole("button", { name: "Deals, area" }));
    await user.click(screen.getByRole("button", { name: "Just this area" }));
    expect(await screen.findByRole("img", { name: "5 things and 3 links" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show everything" }));
    expect(await screen.findByRole("img", { name: "8 things and 4 links" })).toBeInTheDocument();
  });

  it("knows each thing's address and says an edge in words", () => {
    expect(addressOf(graph.nodes[0])).toEqual({ kind: "module", id: "m1" });
    expect(addressOf(graph.nodes[2])).toEqual({ kind: "module", id: "m1" });
    expect(addressOf(graph.nodes[4])).toEqual({ kind: "skill", name: "brokers" });
    expect(addressOf(graph.nodes[6])).toEqual({ kind: "automation", id: "a1" });
    expect(addressOf(graph.nodes[7])).toEqual({ kind: "intelligence", tab: "connections", item: graph.nodes[7].id.slice("connection:".length) });
    expect(edgeWords(graph.edges[3], "brokers")).toBe("runs brokers (step 1)");
    expect(edgeWords({ from: "a", to: "b", kind: "feeds", count: 7 }, "Advisory")).toBe("feeds Advisory (7)");
  });
});

const brain: WorkGraph = {
  at: "2026-10-03T22:00:00+00:00",
  nodes: [
    { id: "you", kind: "you", title: "You", subtitle: "1 thing Alpha knows about you", facts: [{ predicate: "age", value: "27" }], activity: 0 },
    { id: "module:m1", kind: "module", title: "Advisory", module: "m1", activity: 40 },
    { id: "module:m2", kind: "module", title: "Notes", module: "m2", activity: 2 },
    { id: "table:clients", kind: "table", title: "Clients", subtitle: "1 rows", module: "m1", rows: 1, activity: 1 },
    { id: "entity:p1", kind: "person", title: "Vikas Badami", subtitle: "v@x.com", entity: "p1", activity: 3 },
    { id: "document:d1", kind: "document", title: "RestoPros P&L", subtitle: "xlsx", module: "m1", activity: 0 },
    { id: "entity:p2", kind: "person", title: "Ada Lovelace", entity: "p2", activity: 0 },
  ],
  edges: [
    { from: "table:clients", to: "module:m1", kind: "in" },
    { from: "document:d1", to: "module:m1", kind: "in" },
    { from: "entity:p1", to: "module:m1", kind: "named in", count: 3 },
    { from: "entity:p1", to: "document:d1", kind: "related", state: "suggested", fact: "f_1", why: "sent: Vikas sent the exports the document holds.", source: "map:j_1" },
  ],
};

describe("the map of the world", () => {
  function client() {
    const c = { graph: vi.fn(async (kind: GraphKind) => (kind === "world" ? brain : graph)), connectGraph: vi.fn(async () => ({ proposed: [], why: null })), decideFact: vi.fn(async () => ({})) };
    return c as unknown as Client & typeof c;
  }

  it("rings what nothing connects and says so at a glance", async () => {
    const user = userEvent.setup();
    const c = client();
    render(
      <TooltipProvider>
        <WorkMap client={c} />
      </TooltipProvider>,
    );
    expect(await screen.findByRole("img", { name: "7 things and 2 links" })).toBeInTheDocument();
    expect(c.graph).toHaveBeenCalledWith("world");
    const ada = await screen.findByRole("button", { name: "Ada Lovelace, person, not linked" });
    expect(ada).toHaveClass("map__node--lonely");
    expect(screen.getByRole("button", { name: "Vikas Badami, person, v@x.com" })).not.toHaveClass("map__node--lonely");
    const glance = screen.getByRole("complementary", { name: "At a glance" });
    expect(glance).toHaveTextContent("Most going on: Advisory (40), Notes (2)");
    expect(glance).toHaveTextContent("Zazoo thinks: 1 link waits for your yes");
    await user.click(within(glance).getByRole("button", { name: "1 thing nothing connects" }));
    expect(screen.getByRole("button", { name: "Advisory, area" })).toHaveClass("map__node--dim");
    expect(ada).not.toHaveClass("map__node--dim");
  });

  it("a proposed link shows Alpha's reason and takes a yes", async () => {
    const user = userEvent.setup();
    const c = client();
    render(
      <TooltipProvider>
        <WorkMap client={c} />
      </TooltipProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Vikas Badami, person, v@x.com" }));
    const card = screen.getByRole("complementary", { name: "Vikas Badami" });
    expect(within(card).getByRole("button", { name: "sent RestoPros P&L" })).toBeInTheDocument();
    expect(card).toHaveTextContent("Zazoo thinks: Vikas sent the exports the document holds.");
    await user.click(within(card).getByRole("button", { name: "Yes, keep it" }));
    expect(c.decideFact).toHaveBeenCalledWith("f_1", true);
  });

  it("asks the core only on the first open and on Refresh, and Refresh has Alpha look for links", async () => {
    const user = userEvent.setup();
    const c = client();
    render(
      <TooltipProvider>
        <WorkMap client={c} />
      </TooltipProvider>,
    );
    await screen.findByRole("img", { name: "7 things and 2 links" });
    expect(c.graph).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(c.connectGraph).toHaveBeenCalledTimes(1);
    expect(c.graph).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/as of/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Work" }));
    expect(await screen.findByRole("img", { name: "8 things and 4 links" })).toBeInTheDocument();
    expect(c.graph).toHaveBeenLastCalledWith("work");
  });
});
