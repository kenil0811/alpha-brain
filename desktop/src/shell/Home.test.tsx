import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, Home as HomeData, ModuleCard } from "../core/client";
import { Home } from "./Home";

const quiet: HomeData = { date: "2026-10-09T09:00:00+00:00", needs_you: [], ran_today: 0, failed_today: 0, modules: [], loose_tables: [], coming_up: [], threads: [], brief: null };
const deals = { id: "m1", name: "Deals", goal: "Watch the listings", parent: null, tables: [{ name: "deals", title: "Deals", module: "m1", records: 3 }], records: 3, last_at: null, last_text: null, threads: [], created_at: "" } as unknown as ModuleCard;

function mount(client: Partial<Client>, onGo = vi.fn()) {
  render(<Home client={client as Client} version={0} onGo={onGo} onChanged={vi.fn()} onAsk={vi.fn()} onNew={vi.fn()} onOpenThread={vi.fn()} />);
  return onGo;
}

describe("Home", () => {
  it("says so in one sentence on a quiet day, and ends the module grid with New", async () => {
    mount({ home: vi.fn(async () => quiet), modules: vi.fn(async () => [deals]) });
    expect(await screen.findByText("Nothing needs you right now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Deals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a new module" })).toBeInTheDocument();
  });

  it("shows what Needs you with Approve and Veto, not accept and reject", async () => {
    const home = { ...quiet, needs_you: [{ kind: "proposal" as const, id: "p1", text: "Track what you eat", why: "You mentioned it", at: "2026-10-09T08:00:00+00:00" }] };
    const decideProposal = vi.fn(async () => ({ decided: "p1", turn: null }));
    mount({ home: vi.fn(async () => home), modules: vi.fn(async () => []), decideProposal });
    await userEvent.click(await screen.findByRole("button", { name: "Veto" }));
    expect(decideProposal).toHaveBeenCalledWith("p1", false);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("says what failed in the Today card with Try again, while the modules still show", async () => {
    const homeCall = vi.fn().mockRejectedValueOnce(new Error("the core said no")).mockResolvedValue(quiet);
    mount({ home: homeCall, modules: vi.fn(async () => [deals]) });
    expect(await screen.findByText(/Couldn't load today's summary: the core said no/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Deals" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Nothing needs you right now.")).toBeInTheDocument();
    expect(homeCall).toHaveBeenCalledTimes(2);
  });

  it("says what failed in the modules, with Try again, while Today still shows", async () => {
    mount({ home: vi.fn(async () => quiet), modules: vi.fn().mockRejectedValueOnce(new Error("no modules")).mockResolvedValue([deals]) });
    expect(await screen.findByText("Nothing needs you right now.")).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load your modules: no modules/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Open Deals" })).toBeInTheDocument();
  });
});
