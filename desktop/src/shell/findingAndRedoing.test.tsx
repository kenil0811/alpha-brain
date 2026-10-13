import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, EntryPage, GoalPage as GoalData, JournalEntry } from "../core/client";
import { TooltipProvider } from "../ui";
import { Activity } from "./Activity";
import { ActivityEntryPage } from "./ActivityEntryPage";
import { pathFor, surfaceFromPath } from "./address";
import { GoalPage } from "./GoalPage";

const entry = (id: string, text: string, extra: Partial<JournalEntry> = {}): JournalEntry => ({ id, at: "2026-10-13T20:40:00Z", kind: "did", actor: "alpha", text, data: {}, module: null, thread: null, entity_ids: [], source: null, ...extra });

describe("a page for every item (slice 2 D12)", () => {
  it("has addresses for an activity entry and a goal", () => {
    expect(pathFor({ kind: "entry", id: "j_1" })).toBe("/activity/j_1");
    expect(surfaceFromPath("#/activity/j_1")).toEqual({ kind: "entry", id: "j_1" });
    expect(pathFor({ kind: "goal", id: "g_1" })).toBe("/intelligence/goals/g_1");
    expect(surfaceFromPath("#/intelligence/goals/g_1")).toEqual({ kind: "goal", id: "g_1" });
  });

  it("opens an entry's page from Activity and shows earlier pages exactly", async () => {
    const user = userEvent.setup();
    const onGo = vi.fn();
    const first = Array.from({ length: 300 }, (_, i) => entry(`j${i}`, `Step ${i}`));
    const activity = vi.fn(async (p: { before?: string }) => (p.before ? [entry("old", "The first thing")] : first));
    render(<Activity client={{ activity } as unknown as Client} version={0} onChanged={vi.fn()} onGo={onGo} />);
    await user.click(await screen.findByRole("button", { name: /Step 0$/ }));
    expect(onGo).toHaveBeenCalledWith({ kind: "entry", id: "j0" });
    await user.click(screen.getByRole("button", { name: "Show earlier" }));
    expect(activity).toHaveBeenLastCalledWith({ limit: 300, kind: undefined, before: "j299" });
    expect(await screen.findByText("The first thing")).toBeInTheDocument();
    expect(screen.getByText("That's everything, back to the first entry.")).toBeInTheDocument();
  });

  it("shows what an entry touched and its turn, and tries a failure again", async () => {
    const user = userEvent.setup();
    const onGo = vi.fn();
    const page: EntryPage = {
      ...entry("j2", "That didn't work: the model was busy", { kind: "failed", thread: "t1", module: "m1", data: { turn: "j1", error: "the model was busy" } }),
      again: { how: "turn", words: 'Asks again: "log two eggs"' },
      tried: null,
      touched: [
        { kind: "module", id: "m1", name: "Food" },
        { kind: "conversation", id: "t1", name: "Breakfast", chat: true },
      ],
      steps: [entry("j1", "log two eggs", { kind: "said", actor: "person" })],
    };
    const tryAgain = vi.fn(async () => ({ ...page, tried: { at: "2026-10-13T20:41:00Z", state: "running" as const, words: "" } }));
    const client = { activityEntry: vi.fn(async () => page), tryAgain } as unknown as Client;
    render(
      <TooltipProvider>
        <ActivityEntryPage client={client} id="j2" version={0} onGo={onGo} onChanged={vi.fn()} />
      </TooltipProvider>,
    );
    expect(await screen.findByRole("heading", { name: "That didn't work: the model was busy" })).toBeInTheDocument();
    expect(screen.getByText("What went wrong: the model was busy")).toBeInTheDocument();
    const touched = screen.getByText("Breakfast").closest(".item") as HTMLElement;
    await user.click(within(touched).getByRole("button", { name: "Open" }));
    expect(onGo).toHaveBeenCalledWith({ kind: "assistant", id: "t1" });
    await user.click(screen.getByRole("button", { name: /log two eggs/ }));
    expect(onGo).toHaveBeenCalledWith({ kind: "entry", id: "j1" });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(tryAgain).toHaveBeenCalledWith("j2");
    expect(await screen.findByRole("status")).toHaveTextContent("Trying again…");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows a goal with its history and the card's own buttons", async () => {
    const user = userEvent.setup();
    const onGo = vi.fn();
    const goal: GoalData = { id: "g1", text: "An offer by December", state: "active", module: null, since: "2026-10-01T09:00:00Z", until: null, module_name: null, history: [entry("j5", "You set a goal: An offer by December", { actor: "person" })] };
    const changeGoal = vi.fn(async () => ({ ...goal, state: "done" }));
    const client = { goal: vi.fn(async () => goal), changeGoal } as unknown as Client;
    render(<GoalPage client={client} id="g1" version={0} onGo={onGo} onChanged={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "An offer by December" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /You set a goal/ }));
    expect(onGo).toHaveBeenCalledWith({ kind: "entry", id: "j5" });
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(changeGoal).toHaveBeenCalledWith("g1", { state: "done" }));
  });
});
