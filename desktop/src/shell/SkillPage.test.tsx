import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { TooltipProvider } from "../ui";
import { SkillPage } from "./SkillPage";

describe("a skill's page", () => {
  it("presents the skill as editable fields, Save disabled with the reason, and asks Alpha for changes", async () => {
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
    expect(screen.getByLabelText("Name")).toHaveValue("linkedin_connections");
    expect(screen.getByLabelText("Description")).toHaveValue("Reads the connections list");
    const script = screen.getByLabelText("Instructions");
    expect((script as HTMLTextAreaElement).value).toContain("querySelectorAll");
    await user.type(screen.getByLabelText("Description"), "!");
    expect(screen.getByLabelText("Description")).toHaveValue("Reads the connections list!");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Editing a skill needs Alpha's core")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes on linkedin_connections")).toHaveValue("Cards rotate their class names.");
    await user.click(screen.getByRole("button", { name: "Ask Alpha to change this" }));
    expect(onAsk).toHaveBeenCalledWith("Change the skill linkedin_connections (Reads the connections list): ");
  });
});
