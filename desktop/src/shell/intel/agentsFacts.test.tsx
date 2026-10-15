import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Agent, Client, Fact, Intelligence as Data } from "../../core/client";
import { Intelligence } from "../Intelligence";
import { agentRow, agentsTable } from "./agentsTable";
import { factRow } from "./factsTable";

const auto = (id: string, over: Partial<Agent> = {}): Agent => ({ id, name: `Read ${id}`, kind: "custom", description: `Read ${id}`, module: null, thread: null, state: "on", on: true, may: ["records", "asks"], done: null, schedule: "daily 07:00", when: "Every day at 07:00", next_run_at: "2026-10-14T06:00:00Z", last_run_at: "2026-10-13T06:00:00Z", last_result: null, last_error: null, goal: "Keep it current", last_verdict: "succeeded", last_why: "Read 12 of 12.", ...over });
const fact = (id: string, over: Partial<Fact> = {}): Fact => ({ id, subject: "person", predicate: "job_search", value: "founding engineer roles", valid_from: "2026-10-02T17:13:16Z", valid_to: null, recorded_at: "2026-10-02T17:13:16Z", source: "stated", why: null, confidence: 0.95, state: "accepted", ...over });
const data = (over: Partial<Data> = {}): Data => ({ hands: [], skills: [], agents: [], readers: [], connections: [], knowledge: { facts: [], notes: [], goals: [], permissions: [] }, ...over });

function core(d: Data) {
  return {
    intelligence: vi.fn().mockResolvedValue(d),
    modules: vi.fn().mockResolvedValue([{ id: "m_n", name: "Network" }]),
    preference: vi.fn().mockRejectedValue(new Error("none")),
    setPreference: vi.fn().mockResolvedValue({}),
    changeAgent: vi.fn().mockResolvedValue({}),
    runAgent: vi.fn().mockResolvedValue({}),
    decideFact: vi.fn().mockResolvedValue({}),
  };
}

describe("Intelligence's agents as a table", () => {
  it("says each agent's state and verdict in words, the module column only when one has a module", () => {
    expect(agentRow(auto("a1", { module: "m_n" }), { m_n: "Network" }).values).toMatchObject({ state: "On", verdict: "Succeeded", why: "Read 12 of 12.", module: "Network" });
    expect(agentRow(auto("a2", { state: "paused", on: false, last_verdict: null, last_why: null, last_error: "Signed out" }), {}).values).toMatchObject({ state: "Paused", next_run: null, verdict: "Not judged yet", why: "Didn't work: Signed out" });
    expect(agentsTable([auto("a1")], {}).fields.map((f) => f.name)).not.toContain("module");
  });

  it("lists Alpha first, then the agents with a face each; the switch and Run now work, › opens the page", async () => {
    const client = core(data({ agents: [auto("a1")] }));
    const onGo = vi.fn();
    render(<Intelligence client={client as unknown as Client} tab="agents" version={0} onTab={vi.fn()} onChanged={vi.fn()} onGo={onGo} />);
    const alpha = (await screen.findByText("Alpha — your assistant")).closest("tr")!;
    const rows = Array.from(document.querySelectorAll(".pagebody tbody tr"));
    expect(rows[0]).toBe(alpha);
    expect(within(alpha).getByRole("img", { name: "Alpha — your assistant's face" })).toBeInTheDocument();
    expect(within(alpha).queryByRole("switch")).toBeNull(); // Alpha has no switch
    const row = screen.getByText("Read a1").closest("tr")!;
    expect(within(row).getByText("Succeeded")).toHaveClass("pill--good");
    fireEvent.click(within(row).getByRole("switch", { name: "Pause: Read a1" }));
    await waitFor(() => expect(client.changeAgent).toHaveBeenCalledWith("a1", { state: "paused" }));
    fireEvent.click(within(row).getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(client.runAgent).toHaveBeenCalledWith("a1"));
    fireEvent.click(within(row).getByRole("button", { name: /^Open/ }));
    expect(onGo).toHaveBeenCalledWith({ kind: "agent", id: "a1" });
    fireEvent.click(within(alpha).getByRole("button", { name: /^Open/ }));
    expect(onGo).toHaveBeenCalledWith({ kind: "assistant" });
  });
});

describe("About you as a table", () => {
  it("says where a fact came from and how sure, in main's words", () => {
    expect(factRow(fact("f1")).values).toMatchObject({ fact: "Job search", value: "founding engineer roles", sure: 95, state: "Known" });
    expect(String(factRow(fact("f1")).values.origin)).toMatch(/^You said so/);
  });

  it("shows the facts in the table, a suggested one with Yes and No at its end", async () => {
    const client = core(data({ knowledge: { facts: [fact("f1"), fact("f2", { predicate: "city", value: "London", state: "suggested", source: "turn:j_1", confidence: 0.6 })], notes: [], goals: [], permissions: [] } }));
    render(<Intelligence client={client as unknown as Client} tab="knowledge" version={0} onTab={vi.fn()} onChanged={vi.fn()} />);
    const known = (await screen.findByText("Job search")).closest("tr")!;
    expect(within(known).queryByRole("button", { name: "Yes" })).toBeNull();
    const city = screen.getByText("City").closest("tr")!;
    expect(within(city).getByText("Suggested")).toHaveClass("pill--warn");
    fireEvent.click(within(city).getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(client.decideFact).toHaveBeenCalledWith("f2", true));
    expect(screen.getByText("Goals")).toBeInTheDocument(); // the cards under the table stay
  });
});

describe("an agent's look on its page", () => {
  it("wears Alpha's look until one is picked, keeps the pick for that agent, and goes back to Alpha's", async () => {
    const { AgentPage } = await import("../AgentPage");
    const prefs: Record<string, unknown> = { companion_look: { animal: "panda" } };
    const client = {
      agentPage: vi.fn().mockResolvedValue({ ...auto("a1"), runs: [], brief: null, notes: null, decisions: [], pipeline: null, good_run: null }),
      preference: vi.fn(async (key: string) => ({ key, value: prefs[key] ?? null })),
      setPreference: vi.fn(async (key: string, value: unknown) => {
        prefs[key] = value;
        return { key, value };
      }),
    };
    render(<AgentPage client={client as unknown as Client} id="a1" version={0} onGo={vi.fn()} onAsk={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText("It wears Alpha's look until you pick one")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fox" }));
    await waitFor(() => expect(client.setPreference).toHaveBeenCalledWith("agent_looks", { a1: expect.objectContaining({ animal: "fox" }) }));
    fireEvent.click(await screen.findByRole("button", { name: "Wear Alpha's look" }));
    await waitFor(() => expect(prefs.agent_looks).toEqual({}));
    expect(await screen.findByText("It wears Alpha's look until you pick one")).toBeInTheDocument();
  });
});

describe("an agent's page", () => {
  const page = (over: Partial<Agent> = {}) => ({ ...auto("a1", { goal: "Keep it current", ...over }), runs: [], brief: { id: "n1", scope: "agent:a1", title: "Brief", body: "Read the brokers and tell me.", updated_at: "" }, notes: null, decisions: [{ id: "d1", at: "2026-10-15T10:00:00Z", by: "person", what: "Only warm leads", why: null, alternatives: [], evidence: {}, replaces: null, about: { agent: "a1" }, state: "binding" }], pipeline: null, good_run: null });

  it("renames, pauses, says what it may touch and lists the decisions about it", async () => {
    const { AgentPage } = await import("../AgentPage");
    const client = {
      agentPage: vi.fn().mockResolvedValue(page()),
      changeAgent: vi.fn().mockResolvedValue({}),
      runAgent: vi.fn().mockResolvedValue({}),
      preference: vi.fn().mockRejectedValue(new Error("none")),
      setPreference: vi.fn().mockResolvedValue({}),
    };
    const onChanged = vi.fn();
    render(<AgentPage client={client as unknown as Client} id="a1" version={0} onGo={vi.fn()} onAsk={vi.fn()} onChanged={onChanged} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Read a1" })).toBeInTheDocument();
    expect(screen.getByText(/may change rows in its module's tables and questions to you/)).toBeInTheDocument();
    expect(screen.getByText(/whenever you @-mention it \(@Read a1\)/)).toBeInTheDocument();
    expect(screen.getByText("Read the brokers and tell me.")).toBeInTheDocument();
    expect(screen.getByText("Only warm leads")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const box = screen.getByRole("textbox", { name: "The agent's name" });
    fireEvent.change(box, { target: { value: "Deal Scout" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(client.changeAgent).toHaveBeenCalledWith("a1", { name: "Deal Scout" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(client.changeAgent).toHaveBeenCalledWith("a1", { state: "paused" }));
    expect(onChanged).toHaveBeenCalled();
  });

  it("deletes a custom agent after saying what goes, and never offers to delete Alpha's own", async () => {
    const { AgentPage } = await import("../AgentPage");
    const onGo = vi.fn();
    const client = {
      agentPage: vi.fn().mockResolvedValue(page()),
      agentRemoval: vi.fn().mockResolvedValue({ agent: "a1", name: "Read a1", runs: 3, pages: 1, decisions: 1, skill: null, what: "3 runs, 1 page and 1 decision" }),
      deleteAgent: vi.fn().mockResolvedValue({}),
      preference: vi.fn().mockRejectedValue(new Error("none")),
      setPreference: vi.fn().mockResolvedValue({}),
    };
    const first = render(<AgentPage client={client as unknown as Client} id="a1" version={0} onGo={onGo} onAsk={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Deletes 3 runs, 1 page and 1 decision. This can't be undone; Activity keeps that it was here.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" , hidden: false }));
    await waitFor(() => expect(client.deleteAgent).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ kind: "intelligence", tab: "agents" }));
    first.unmount();
    client.agentPage.mockResolvedValue(page({ kind: "sherlock", name: "Sherlock" }));
    render(<AgentPage client={client as unknown as Client} id="a1" version={1} onGo={vi.fn()} onAsk={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Sherlock" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});
