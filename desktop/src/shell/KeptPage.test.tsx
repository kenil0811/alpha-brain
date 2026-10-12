import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client } from "../core/client";
import { AssistantProvider, TooltipProvider } from "../ui";
import { KeptPage } from "./SecondBrain";

const knowledge = { facts: [], notes: [], goals: [{ id: "g1", text: "Close ten deals", state: "active", module: "m1", since: "2026-10-01T00:00:00+00:00" }], permissions: [] };

describe("a goal's own page", () => {
  it("shows the goal, opens its project, and asks Alpha to mark it done", async () => {
    const say = vi.fn();
    const onGo = vi.fn();
    render(
      <TooltipProvider>
        <AssistantProvider say={say}>
          <KeptPage client={{ intelligence: vi.fn(async () => ({ knowledge })) } as unknown as Client} kind="goal" id="g1" version={0} onBack={vi.fn()} onChanged={vi.fn()} onGo={onGo} />
        </AssistantProvider>
      </TooltipProvider>,
    );
    expect(await screen.findByRole("heading", { name: "Close ten deals", level: 1 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open its project" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m1" });
    await userEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect(say).toHaveBeenCalledWith('Mark my goal "Close ten deals" as done.');
  });
});
