import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, Home as HomeData, JournalEntry } from "../core/client";
import { TooltipProvider } from "../ui";
import { Home, failedToday } from "./Home";

const quiet: HomeData = { date: "2026-10-12T09:00:00+00:00", needs_you: [], ran_today: 4, failed_today: 0, modules: [], loose_tables: [], coming_up: [], threads: [] };
/** A moment a few seconds ago: failures made in one test keep a fixed newest-first order. */
const secondsAgo = (n: number) => new Date(Date.now() - n * 1000).toISOString();
const failed = (id: string, text: string, data: Record<string, unknown>, extra: Partial<JournalEntry> = {}): JournalEntry => ({ id, at: new Date().toISOString(), kind: "failed", actor: "alpha", text, data, module: null, thread: null, entity_ids: [], source: null, ...extra });

function mount(over: Partial<Record<keyof Client, unknown>>) {
  const onGo = vi.fn();
  const client = { home: vi.fn(async () => quiet), preference: vi.fn(async () => ({ key: "home_dismissed", value: null })), setPreference: vi.fn(async () => ({})), ...over } as unknown as Client & Record<string, ReturnType<typeof vi.fn>>;
  render(
    <TooltipProvider>
      <Home client={client} version={0} onGo={onGo} onChanged={vi.fn()} onAsk={vi.fn()} onNew={vi.fn()} onOpenThread={vi.fn()} />
    </TooltipProvider>,
  );
  return { client, onGo };
}

describe("Home: didn't work today", () => {
  it("keeps today's failures only, newest first", () => {
    const now = new Date("2026-10-12T15:00:00");
    const rows = [failed("a", "older today", {}, { at: "2026-10-12T08:00:00" }), failed("b", "yesterday", {}, { at: "2026-10-11T22:00:00" }), failed("c", "newer today", {}, { at: "2026-10-12T14:00:00" }), { ...failed("d", "read a page", {}), kind: "saw" }];
    expect(failedToday(rows, now).map((e) => e.id)).toEqual(["c", "a"]);
  });

  it("names each with its reason, Try again where the core can redo it, Open to its own page", async () => {
    const user = userEvent.setup();
    const tryAgain = vi.fn(async () => ({}));
    const { client, onGo } = mount({
      home: vi.fn(async () => ({ ...quiet, failed_today: 2 })),
      activity: vi.fn(async () => [
        failed("j1", "Run of Daily brokers failed", { agent: "a_1" }, { at: secondsAgo(1), again: { how: "agent", words: "Runs Daily brokers again." } }),
        failed("j2", "That didn't work", { error: "the model timed out" }, { module: "m1", at: secondsAgo(2), again: null }),
      ]),
      tryAgain,
    });
    const card = await screen.findByRole("region", { name: "Didn't work today" });
    expect(await within(card).findByText("the model timed out")).toBeInTheDocument();
    expect(client.activity).toHaveBeenCalledWith({ kind: "failed", since: expect.any(String), limit: 500 });
    expect(screen.getByText("2 didn't work, below")).toBeInTheDocument();
    expect(within(card).getAllByRole("button", { name: "Try again" })).toHaveLength(1);
    await user.click(within(card).getByRole("button", { name: "Try again" }));
    expect(tryAgain).toHaveBeenCalledWith("j1");
    await user.click(within(card).getAllByRole("button", { name: "Open" })[1]);
    expect(onGo).toHaveBeenCalledWith({ kind: "entry", id: "j2" });
  });

  it("asks before doing an action on a site again, and says how a try went", async () => {
    const user = userEvent.setup();
    const tryAgain = vi.fn(async () => ({}));
    mount({
      home: vi.fn(async () => ({ ...quiet, failed_today: 3 })),
      activity: vi.fn(async () => [
        failed("j1", '"Post" did not happen', { action: "x_1" }, { at: secondsAgo(1), again: { how: "action", asks: true, words: 'Does "Post" on linkedin.com again, once.' } }),
        failed("j2", "Enrich failed on a row of Deals", { part: "p" }, { at: secondsAgo(2), again: { how: "part", words: "Runs it on that row again." }, tried: { at: "2026-10-13T20:52:00Z", state: "worked", words: "" } }),
        failed("j3", '"Draft" did not happen', { action: "x_2" }, { at: secondsAgo(3), again: { how: null, blocked: 'Alpha proposed "Draft" again after a fix; decide it in Needs you.' } }),
      ]),
      tryAgain,
    });
    const card = await screen.findByRole("region", { name: "Didn't work today" });
    expect(await within(card).findByText(/^Worked when tried again/)).toBeInTheDocument();
    expect(within(card).getByText(/decide it in Needs you/)).toBeInTheDocument();
    expect(within(card).getAllByRole("button", { name: "Try again" })).toHaveLength(1);
    await user.click(within(card).getByRole("button", { name: "Try again" }));
    const ask = await screen.findByRole("dialog", { name: "Try it again?" });
    expect(ask).toHaveTextContent('Does "Post" on linkedin.com again, once.');
    expect(tryAgain).not.toHaveBeenCalled();
    await user.click(within(ask).getByRole("button", { name: "Try again" }));
    expect(tryAgain).toHaveBeenCalledWith("j1");
  });

  it("Dismiss clears one from Home and Clear all the rest; the choice is remembered", async () => {
    const user = userEvent.setup();
    const { client } = mount({
      home: vi.fn(async () => ({ ...quiet, failed_today: 2 })),
      // the newest first, by when each happened (both made "now", their order hung on the millisecond)
      activity: vi.fn(async () => [failed("j1", "First failure", {}, { at: secondsAgo(1) }), failed("j2", "Second failure", {}, { at: secondsAgo(2) })]),
    });
    const card = await screen.findByRole("region", { name: "Didn't work today" });
    await within(card).findByText("First failure");
    await user.click(within(card).getAllByRole("button", { name: "Dismiss" })[0]);
    expect(screen.queryByText("First failure")).toBeNull();
    expect(client.setPreference).toHaveBeenLastCalledWith("home_dismissed", ["j1"]);
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Didn't work today" })).toBeNull());
    expect(client.setPreference).toHaveBeenLastCalledWith("home_dismissed", ["j1", "j2"]);
    expect(screen.getByText("2 didn't work; see Activity")).toBeInTheDocument();
  });

  it("stays away when the failures were cleared before", async () => {
    mount({
      home: vi.fn(async () => ({ ...quiet, failed_today: 1 })),
      activity: vi.fn(async () => [failed("j1", "Cleared earlier", {})]),
      preference: vi.fn(async () => ({ key: "home_dismissed", value: ["j1"] })),
    });
    expect(await screen.findByText("1 didn't work; see Activity")).toBeInTheDocument();
    expect(screen.queryByText("Cleared earlier")).toBeNull();
  });
});
