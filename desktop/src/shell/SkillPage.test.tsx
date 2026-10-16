import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { TooltipProvider } from "../ui";
import { SkillPage } from "./SkillPage";

describe("a skill's page", () => {
  it("shows the skill in words, its script read-only, and asks Alpha for changes with nothing prefilled", async () => {
    const user = userEvent.setup();
    const client = {
      skillPage: vi.fn(async () => ({ name: "linkedin_connections", kind: "read", site: "linkedin.com", module: null, url: "https://www.linkedin.com/mynetwork/", description: "Reads the connections list", when_to_use: "The person's own connections", effect: null, fields: [], version: 3, health: "ok", last_problem: null, last_run_at: "2026-10-03T08:44:02+00:00", last_count: 1551, last_ok_count: 1551, source: null, updated_at: "", script: "return [...document.querySelectorAll('li')].map(x => ({name: x.innerText}))", notes: { id: "n", scope: "skill:linkedin_connections", title: "linkedin_connections", body: "Cards rotate their class names.", updated_at: "" }, runs: [{ at: "2026-10-03T08:44:02+00:00", kind: "did", text: "Read 1551 with linkedin_connections" }] })),
      writeNote: vi.fn(async () => ({})),
    } as unknown as Client;
    const onAsk = vi.fn();
    render(
      <TooltipProvider>
        <SkillPage client={client} name="linkedin_connections" version={0} onGo={vi.fn()} onAsk={onAsk} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Reads the connections list" })).toBeInTheDocument();
    expect(screen.getByText("Reads a list from a page")).toBeInTheDocument();
    const script = screen.getByLabelText("The reader's script");
    expect(script).toHaveTextContent("querySelectorAll");
    expect(script.tagName).toBe("PRE"); // shown, never an editor
    expect(screen.getByText("Cards rotate their class names.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ask Alpha to change this" }));
    expect(onAsk).toHaveBeenCalledWith("Change the skill linkedin_connections (Reads the connections list): ");
  });
});

describe("a skill's versions", () => {
  it("lists what it was before each change, says who replaced it, and Restore brings one back", async () => {
    const user = userEvent.setup();
    const client = {
      skillPage: vi.fn(async () => ({ name: "brokers", kind: "read", site: "brokers.com", module: null, url: "https://brokers.com", description: "Reads the brokers", when_to_use: null, effect: null, fields: [], version: 2, health: "ok", last_problem: null, last_run_at: null, last_count: 12, last_ok_count: 12, source: null, updated_at: "2026-10-16T10:00:00Z", script: "return rows", notes: null, runs: [], versions: [{ version: 1, saved_at: "2026-10-16T09:00:00Z", replaced_by: "a_doc1", description: "Reads the brokers" }] })),
      restoreSkill: vi.fn(async () => ({})),
      writeNote: vi.fn(async () => ({})),
    } as unknown as Client;
    const onChanged = vi.fn();
    render(
      <TooltipProvider>
        <SkillPage client={client} name="brokers" version={0} onGo={vi.fn()} onAsk={vi.fn()} onChanged={onChanged} />
      </TooltipProvider>,
    );
    expect(await screen.findByText("Version 1")).toBeInTheDocument();
    expect(screen.getByText(/replaced .* by Doc/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(client.restoreSkill).toHaveBeenCalledWith("brokers", 1);
    expect(onChanged).toHaveBeenCalled();
  });
});
