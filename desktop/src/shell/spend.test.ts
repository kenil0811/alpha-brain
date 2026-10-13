import { describe, expect, it } from "vitest";
import type { UsageRow } from "../core/client";
import { calls, lastTwoDays, modelName, rank, since, uses } from "./spend";

const row = (at: Date, over: Partial<UsageRow>): UsageRow => ({
  id: String(Math.random()), at: at.toISOString(), turn: "t", thread: null, module: null, kind: "turn",
  route: "claude", model: "claude-sonnet-5-5", input: 10, output: 5, cache_read: 0, cache_write: 0, cost: 0, ...over,
});

describe("spend", () => {
  const now = new Date(2026, 9, 12, 15);
  const nine = new Date(2026, 9, 12, 9);
  const list = uses([
    // one call that used two models: one call, two rows
    row(nine, { turn: "a", module: "m1", thread: "t1", cost: 0.5 }),
    row(nine, { turn: "a", module: "m1", thread: "t1", model: "claude-haiku-5-5", cost: 0.25 }),
    row(new Date(2026, 9, 12, 10), { turn: "b", module: "m1", thread: "t2", kind: "judge", cost: 0.1 }),
    row(new Date(2026, 9, 11, 10), { turn: "c", module: "m2", thread: "t3", cost: 0.1 }),
    row(new Date(2026, 9, 11, 11), { turn: "d", route: "codex", model: null, cost: null, input: 1000 }),
  ]);

  it("counts a call once however many models it used, and keeps unpriced calls apart", () => {
    expect(calls(list)).toBe(4);
    expect(rank(list, (u) => u.module)).toEqual([
      { key: "m1", spend: 0.85, tokens: 45, calls: 2, unpriced: 0, threads: 2 },
      { key: "m2", spend: 0.1, tokens: 15, calls: 1, unpriced: 0, threads: 1 },
      { key: null, spend: 0, tokens: 1005, calls: 1, unpriced: 1, threads: 0 },
    ]);
  });

  it("names models as people say them", () => {
    expect(modelName("claude-haiku-5-5", "claude")).toBe("Haiku 5.5");
    expect(modelName("claude-opus-4", "claude")).toBe("Opus 4");
    expect(modelName(null, "codex")).toBe("Codex's default");
    expect(modelName(null, "claude")).toBe("Not recorded");
    expect(modelName(null, null)).toBe("Unknown");
    expect(modelName("gpt-5-codex", "codex")).toBe("gpt-5-codex");
  });

  it("splits local days", () => {
    expect(lastTwoDays(list, now)).toEqual({ today: expect.closeTo(0.85), yesterday: expect.closeTo(0.1) });
    expect(since("7d", now)).toEqual(new Date(2026, 9, 6));
    expect(since("all", now)).toBeNull();
  });
});
