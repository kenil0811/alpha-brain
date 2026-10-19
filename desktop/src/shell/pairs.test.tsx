import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Client, NeedItem, Pair, PairsBatch } from "../core/client";
import { PairsCard } from "./CardBits";

const side = (id: string, name: string, email: string, source: string) => ({ id, name, kind: "person", keys: { email: [email] }, organisations: ["Acme"], sources: [source] });
const pair = (id: string, a: string, b: string, why = "same name and organisation"): Pair => ({
  id,
  why,
  state: "proposed",
  a: side(`${id}a`, a, `${a.split(" ")[0].toLowerCase()}@acme.test`, "mac-contacts"),
  b: side(`${id}b`, b, `${b.split(" ")[0].toLowerCase()}.x@acme.test`, "record:contacts/r_1"),
});
const batch = (pairs: Pair[]): PairsBatch => ({ id: "msb_1", pairs, open: pairs.filter((p) => p.state === "proposed").length });
const item = (pairs: Pair[]): NeedItem => ({ kind: "pairs", id: "j_9", text: `${pairs.length} pairs that may be the same person or company`, at: "2026-10-19T19:00:00Z", pairs: batch(pairs) });

describe("two that may be the same (P8)", () => {
  it("shows each pair side by side and decides one at a time, never merging without a word", async () => {
    const user = userEvent.setup();
    const first = pair("ms_1", "Jo Banks", "Jo Banks");
    const second = pair("ms_2", "Kim Lo", "Kim Lo", "same name");
    const client = {
      decidePair: vi.fn(async (_id: string, merge: boolean) => batch([{ ...first, state: merge ? "merged" : "apart" }, second])),
      mergeSamePlace: vi.fn(),
    } as unknown as Client;
    const onDone = vi.fn();
    render(<PairsCard item={item([first, second])} client={client} onDone={onDone} />);
    const jo = screen.getByRole("listitem", { name: "Jo Banks and Jo Banks" });
    expect(within(jo).getByText("from your Mac's contacts")).toBeInTheDocument();
    expect(within(jo).getByText("from a row of contacts")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Merge all/ })).toBeNull(); // only one such pair
    await user.click(within(jo).getByRole("button", { name: "Merge" }));
    expect(client.decidePair).toHaveBeenCalledWith("ms_1", true);
    expect(screen.queryByRole("listitem", { name: "Jo Banks and Jo Banks" })).toBeNull();
    expect(onDone).not.toHaveBeenCalled(); // Kim Lo still waits
  });

  it("offers Merge all only when several pairs share a name and an organisation", async () => {
    const user = userEvent.setup();
    const pairs = [pair("ms_1", "Jo Banks", "Jo Banks"), pair("ms_2", "Lu Chen", "Lu Chen")];
    const client = { mergeSamePlace: vi.fn(async () => batch(pairs.map((p) => ({ ...p, state: "merged" as const })))) } as unknown as Client;
    const onDone = vi.fn();
    render(<PairsCard item={item(pairs)} client={client} onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: "Merge all 2 with the same name and organisation" }));
    expect(client.mergeSamePlace).toHaveBeenCalledWith("msb_1");
    expect(onDone).toHaveBeenCalledWith("Decided.");
  });
});
