import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CoreError, type Client, type Home as HomeData, type ModuleCard } from "../core/client";
import { Home } from "./Home";

const quiet: HomeData = { date: "2026-10-09T09:00:00+00:00", needs_you: [], ran_today: 0, failed_today: 0, modules: [], loose_tables: [], coming_up: [], threads: [], brief: null };
const deals = { id: "m1", name: "Deals", goal: "Watch the listings", parent: null, tables: [{ name: "deals", title: "Deals", module: "m1", records: 3 }], records: 3, last_at: null, last_text: null, threads: [], created_at: "" } as unknown as ModuleCard;

function mount(client: Partial<Client>, onGo = vi.fn()) {
  render(<Home client={client as Client} version={0} onGo={onGo} onChanged={vi.fn()} onAsk={vi.fn()} onNew={vi.fn()} onOpenThread={vi.fn()} />);
  return onGo;
}

describe("Home", () => {
  it("names what failed today beside the count: what, when, why, with Open and Try again", async () => {
    const at = new Date().toISOString();
    const failed = (id: string, text: string, data: Record<string, unknown>, extra: object = {}) => ({ id, at, kind: "failed", actor: "alpha", text, data, module: null, thread: null, entity_ids: [], source: null, ...extra });
    const activity = vi.fn(async () => [
      failed("j1", 'Run of "Daily brokers" failed: walled couldn\'t be reached', { automation: "a_1", run: "r_1" }),
      failed("j2", "That didn't work: no answer came back", { error: "the model timed out" }, { module: "m1" }),
      { ...failed("j3", "Old failure", {}), at: "2020-01-01T00:00:00+00:00" },
      { ...failed("j4", "Read a page", {}), kind: "saw" },
    ]);
    const runAutomation = vi.fn(async () => ({}));
    const onGo = mount({ home: vi.fn(async () => ({ ...quiet, ran_today: 4, failed_today: 2 })), modules: vi.fn(async () => []), activity, runAutomation } as unknown as Partial<Client>);
    expect(await screen.findByRole("region", { name: "Fix 2 things that didn't work" })).toBeInTheDocument();
    expect(screen.getByText(/the model timed out/)).toBeInTheDocument();
    expect(screen.queryByText("Old failure")).toBeNull();
    expect(screen.queryByText("Read a page")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(runAutomation).toHaveBeenCalledWith("a_1");
    const opens = screen.getAllByRole("button", { name: "Open" });
    await userEvent.click(opens[1]); // the second failure's project
    expect(onGo).toHaveBeenCalledWith({ kind: "module", id: "m1" });
  });

  it("says so in one sentence on a quiet day, and ends the cards with New project", async () => {
    mount({ home: vi.fn(async () => quiet), modules: vi.fn(async () => [deals]) });
    expect(await screen.findByText("Nothing needs you right now.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Deals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a new project" })).toBeInTheDocument();
  });

  it("shows what Needs you with Approve and Decline, not accept and reject", async () => {
    const home = { ...quiet, needs_you: [{ kind: "proposal" as const, id: "p1", text: "Track what you eat", why: "You mentioned it", at: "2026-10-09T08:00:00+00:00" }] };
    const decideProposal = vi.fn(async () => ({ decided: "p1", turn: null }));
    mount({ home: vi.fn(async () => home), modules: vi.fn(async () => []), decideProposal });
    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));
    expect(decideProposal).toHaveBeenCalledWith("p1", false);
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("says what failed in today's summary with Try again, while the projects still show", async () => {
    const homeCall = vi.fn().mockRejectedValueOnce(new CoreError("Alpha said no.", 400)).mockResolvedValue(quiet);
    mount({ home: homeCall, modules: vi.fn(async () => [deals]) });
    expect(await screen.findByText(/Couldn't load today's summary: Alpha said no./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Deals" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Nothing needs you right now.")).toBeInTheDocument();
    expect(homeCall).toHaveBeenCalledTimes(2);
  });

  it("says what failed in the modules, with Try again, while Today still shows", async () => {
    mount({ home: vi.fn(async () => quiet), modules: vi.fn().mockRejectedValueOnce(new CoreError("No projects.", 400)).mockResolvedValue([deals]) });
    expect(await screen.findByText("Nothing needs you right now.")).toBeInTheDocument();
    expect(await screen.findByText(/Couldn't load your projects: No projects./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Open Deals" })).toBeInTheDocument();
  });

  it("shows each card at its size, most urgent first, and opens Needs you in full from Review", async () => {
    const ask = (id: string) => ({ kind: "workflow" as const, id, text: `Workflow ${id}`, at: "2026-10-09T08:00:00+00:00" });
    const home = { ...quiet, ran_today: 3, needs_you: [ask("p1"), ask("p2"), ask("p3"), ask("p4"), { kind: "fact" as const, id: "f1", text: "Kenil works_at Acme", at: "2026-10-09T08:00:00+00:00" }] };
    const decideFact = vi.fn(async () => ({}));
    const onGo = mount({ home: vi.fn(async () => home), modules: vi.fn(async () => [deals]), decideFact } as unknown as Partial<Client>);
    const needs = await screen.findByRole("region", { name: "Answer 4 things so Alpha can go on" });
    expect(needs).toHaveClass("hcard--l");
    const order = [...document.querySelectorAll("[data-card]")].map((c) => c.getAttribute("data-card"));
    expect(order).toEqual(["needs", "hypotheses", "done", "project"]);
    expect(screen.getByRole("region", { name: "Check 1 guess Alpha made" })).toHaveClass("hcard--s");
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(decideFact).toHaveBeenCalledWith("f1", true);
    await userEvent.click(screen.getAllByRole("button", { name: "Review" })[0]);
    expect(onGo).toHaveBeenCalledWith({ kind: "needs" });
  });
});
