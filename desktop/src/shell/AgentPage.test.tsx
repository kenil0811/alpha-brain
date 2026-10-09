import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, Intelligence as Data } from "../core/client";
import { AgentPage } from "./AgentPage";

const data = {
  hands: [],
  skills: [{ name: "read_deals", kind: "read", site: null, module: "m1", url: null, description: "Reads the deal listings", when_to_use: null, effect: null, fields: [], version: 2, health: "ok", last_problem: null, last_run_at: null, last_count: null, last_ok_count: null, source: null, updated_at: "", notes: null }],
  automations: [{ id: "a1", title: "Check deals every morning", module: "m1", thread: null, schedule: "daily", when: "Every day at 07:00", procedure: "", enabled: true, next_run_at: null, last_run_at: null, last_result: null, last_error: null }],
  readers: [],
  connections: [],
  knowledge: { facts: [], notes: [], goals: [], permissions: [{ id: "p1", sentence: "Save drafts", procedure: "draft", effect: "prepare", granted_at: "2026-10-01T09:00:00+00:00" }] },
} as unknown as Data;

function mount(id: string) {
  const client = {
    intelligence: vi.fn(async () => data),
    modules: vi.fn(async () => [{ id: "m1", name: "Deals" }]),
    preference: vi.fn(async () => ({ value: null })),
    setPreference: vi.fn(async (key: string, value: unknown) => ({ key, value })),
    activity: vi.fn(async () => [{ id: "j1", at: "2026-10-08T07:00:00+00:00", kind: "did", actor: "alpha", text: "Read 12 listings", data: {}, module: "m1", thread: null, entity_ids: [], source: null }]),
  } as unknown as Client;
  const onGo = vi.fn();
  const onAsk = vi.fn();
  render(<AgentPage client={client} id={id} version={0} onGo={onGo} onAsk={onAsk} onChanged={vi.fn()} />);
  return { onGo, onAsk, client };
}

describe("an agent's page", () => {
  it("shows a module's runner: its skills, automations, runs and the standing permissions", async () => {
    const { onGo, onAsk } = mount("m1");
    expect(await screen.findByRole("heading", { name: "Deals runner" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reads the deal listings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check deals every morning" })).toBeInTheDocument();
    expect(screen.getByText("Read 12 listings")).toBeInTheDocument();
    expect(screen.getByText("Save drafts")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reads the deal listings" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "skill", name: "read_deals" });
    await userEvent.click(screen.getByRole("button", { name: "Ask Alpha to change this" }));
    expect(onAsk).toHaveBeenCalledWith('Change the agent "Deals runner": ');
    await userEvent.click(screen.getByRole("button", { name: "Agents" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "intelligence", tab: "agents" });
  });

  it("presents its name as a field, Save disabled with the reason, and keeps the companion picked for it", async () => {
    const { client } = mount("m1");
    expect(await screen.findByLabelText("Name")).toHaveValue("Deals runner");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Editing an agent needs Alpha's core")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Deals runner" }).length).toBeGreaterThan(0); // its face in the header
    await userEvent.click(screen.getByRole("button", { name: "Fox" }));
    expect(client.setPreference).toHaveBeenCalledWith("agent_looks", { m1: expect.objectContaining({ animal: "fox" }) });
  });

  it("says so when there is no such agent", async () => {
    mount("gone");
    expect(await screen.findByText("No such agent")).toBeInTheDocument();
  });
});
