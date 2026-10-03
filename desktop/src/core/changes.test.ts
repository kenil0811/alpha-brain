import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Changed, Client } from "./client";
import { FRESH, bumpAll, fold, useChanges } from "./changes";

const quiet: Changed = { at: "t1", journal: 0, kinds: [], tables: [], modules: [], entities: [], threads: false, plans: false, actions: false, working: false };

describe("versions from the changes feed", () => {
  it("moves only the scopes a change touched", () => {
    const moduleOf = (t: string) => (t === "food_log" ? "m_food" : null);
    const v = fold(FRESH, { ...quiet, journal: 2, kinds: ["did"], tables: ["food_log"], modules: ["m_food"] }, moduleOf);
    expect(v.tables.food_log).toBe(1);
    expect(v.modules.m_food).toBe(2); // the table's module and the module itself
    expect(v.home).toBe(1);
    expect(v.activity).toBe(1);
    expect(v.conversation).toBe(1);
    expect(v.intelligence).toBe(1); // a "did" can be a skill's run
    expect(v.people).toBe(0);
    expect(fold(v, quiet, moduleOf)).toBe(v); // nothing changed: the same object, no refetch
    const noticed = fold(v, { ...quiet, journal: 1, kinds: ["noticed"], entities: ["e_1"] }, moduleOf);
    expect(noticed.people).toBe(1);
    expect(noticed.intelligence).toBe(1);
    const moved = fold(v, { ...quiet, threads: true }, moduleOf);
    expect(moved.conversation).toBe(2);
    expect(moved.activity).toBe(1);
  });

  it("bumps everything when the person acts or the core comes back", () => {
    const v = bumpAll({ ...FRESH, tables: { a: 3 }, modules: { m: 1 } });
    expect(v.all).toBe(1);
    expect(v.tables.a).toBe(4);
    expect(v.modules.m).toBe(2);
    expect(v.home).toBe(1);
  });
});

describe("the window's one poll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks since the last stamp, often while Alpha works, and says when the core is lost", async () => {
    const answers: (Changed | Error)[] = [
      { ...quiet, at: "t1", working: true },
      { ...quiet, at: "t2", journal: 1, kinds: ["did"], tables: ["food_log"], working: true },
      new Error("gone"),
      new Error("gone"),
      new Error("gone"),
      { ...quiet, at: "t3" },
    ];
    const calls: (string | null)[] = [];
    const client = {
      changes: vi.fn((since: string | null) => {
        calls.push(since);
        const next = answers.shift();
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? quiet);
      }),
    } as unknown as Client;
    const { result } = renderHook(() => useChanges(client, (t) => (t === "food_log" ? "m" : null), { workingEveryMs: 100, quietEveryMs: 1000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls).toEqual([null]);
    expect(result.current.working).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(calls).toEqual([null, "t1"]);
    expect(result.current.versions.tables.food_log).toBe(1);
    expect(result.current.versions.modules.m).toBe(1);
    // Three misses in a row: the core is lost; the window keeps asking.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.down).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.down).toBe("gone");
    // It answers again: everything is looked at afresh.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(result.current.down).toBeNull();
    expect(result.current.versions.all).toBe(1);
    expect(calls[calls.length - 1]).toBe("t2"); // the stamp survived the outage
  });
});
