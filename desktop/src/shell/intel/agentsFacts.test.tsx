import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Automation, Client, Fact, Intelligence as Data } from "../../core/client";
import { Intelligence } from "../Intelligence";
import { agentsTable, automationRow } from "./agentsTable";
import { factRow } from "./factsTable";

const auto = (id: string, over: Partial<Automation> = {}): Automation => ({ id, title: `Read ${id}`, module: null, thread: null, schedule: "daily 07:00", when: "Every day at 07:00", procedure: "", enabled: true, next_run_at: "2026-10-14T06:00:00Z", last_run_at: "2026-10-13T06:00:00Z", last_result: null, last_error: null, goal: "Keep it current", last_verdict: "succeeded", last_why: "Read 12 of 12.", ...over });
const fact = (id: string, over: Partial<Fact> = {}): Fact => ({ id, subject: "person", predicate: "job_search", value: "founding engineer roles", valid_from: "2026-10-02T17:13:16Z", valid_to: null, recorded_at: "2026-10-02T17:13:16Z", source: "stated", why: null, confidence: 0.95, state: "accepted", ...over });
const data = (over: Partial<Data> = {}): Data => ({ hands: [], skills: [], automations: [], readers: [], connections: [], knowledge: { facts: [], notes: [], goals: [], permissions: [] }, ...over });

function core(d: Data) {
  return {
    intelligence: vi.fn().mockResolvedValue(d),
    modules: vi.fn().mockResolvedValue([{ id: "m_n", name: "Network" }]),
    preference: vi.fn().mockRejectedValue(new Error("none")),
    setPreference: vi.fn().mockResolvedValue({}),
    switchAutomation: vi.fn().mockResolvedValue({}),
    runAutomation: vi.fn().mockResolvedValue({}),
    decideFact: vi.fn().mockResolvedValue({}),
  };
}

describe("Intelligence's agents as a table", () => {
  it("says each automation's state and verdict in words, the module column only when one has a module", () => {
    expect(automationRow(auto("a1", { module: "m_n" }), { m_n: "Network" }).values).toMatchObject({ state: "On", verdict: "Succeeded", why: "Read 12 of 12.", module: "Network" });
    expect(automationRow(auto("a2", { enabled: false, last_verdict: null, last_why: null, last_error: "Signed out" }), {}).values).toMatchObject({ state: "Off", next_run: null, verdict: "Not judged yet", why: "Didn't work: Signed out" });
    expect(agentsTable([auto("a1")], {}).fields.map((f) => f.name)).not.toContain("module");
  });

  it("lists Alpha first, then the automations with a face each; the switch and Run now work, › opens the page", async () => {
    const client = core(data({ automations: [auto("a1")] }));
    const onGo = vi.fn();
    render(<Intelligence client={client as unknown as Client} tab="automations" version={0} onTab={vi.fn()} onChanged={vi.fn()} onGo={onGo} />);
    const alpha = (await screen.findByText("Alpha — your assistant")).closest("tr")!;
    const rows = Array.from(document.querySelectorAll(".pagebody tbody tr"));
    expect(rows[0]).toBe(alpha);
    expect(within(alpha).getByRole("img", { name: "Alpha — your assistant's face" })).toBeInTheDocument();
    expect(within(alpha).queryByRole("switch")).toBeNull(); // Alpha has no switch
    const row = screen.getByText("Read a1").closest("tr")!;
    expect(within(row).getByText("Succeeded")).toHaveClass("pill--good");
    fireEvent.click(within(row).getByRole("switch", { name: "Switch off: Read a1" }));
    await waitFor(() => expect(client.switchAutomation).toHaveBeenCalledWith("a1", false));
    fireEvent.click(within(row).getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(client.runAutomation).toHaveBeenCalledWith("a1"));
    fireEvent.click(within(row).getByRole("button", { name: /^Open/ }));
    expect(onGo).toHaveBeenCalledWith({ kind: "automation", id: "a1" });
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
    const { AutomationPage } = await import("../AutomationPage");
    const prefs: Record<string, unknown> = { companion_look: { animal: "panda" } };
    const client = {
      automationPage: vi.fn().mockResolvedValue({ ...auto("a1"), runs: [], guidelines: null, pipeline: null, good_run: null }),
      preference: vi.fn(async (key: string) => ({ key, value: prefs[key] ?? null })),
      setPreference: vi.fn(async (key: string, value: unknown) => {
        prefs[key] = value;
        return { key, value };
      }),
    };
    render(<AutomationPage client={client as unknown as Client} id="a1" version={0} onGo={vi.fn()} onAsk={vi.fn()} onChanged={vi.fn()} />);
    expect(await screen.findByText("It wears Alpha's look until you pick one")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fox" }));
    await waitFor(() => expect(client.setPreference).toHaveBeenCalledWith("agent_looks", { a1: expect.objectContaining({ animal: "fox" }) }));
    fireEvent.click(await screen.findByRole("button", { name: "Wear Alpha's look" }));
    await waitFor(() => expect(prefs.agent_looks).toEqual({}));
    expect(await screen.findByText("It wears Alpha's look until you pick one")).toBeInTheDocument();
  });
});
