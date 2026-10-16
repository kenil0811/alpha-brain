import { describe, expect, it } from "vitest";
import { applyTurnEvent, parseTurnEvent, type Turn } from "./client";

const start: Turn = { id: "k1", state: "running", text: "log two eggs", started_at: "" };

describe("a turn pushed as it happens", () => {
  it("reads one event from its block of lines, and skips comments", () => {
    expect(parseTurnEvent(": open")).toBeNull();
    expect(parseTurnEvent('data: {"type":"text","delta":"Logged "}')).toEqual({ type: "text", delta: "Logged " });
    expect(parseTurnEvent("data: not json")).toBeNull();
  });

  it("appends the words, starts afresh when the core cleared them, and keeps the thought and the steps", () => {
    let t = applyTurnEvent(start, { type: "thought", text: "Let me look at the table." });
    t = applyTurnEvent(t, { type: "doing", text: "Reading rows: food_log" });
    t = applyTurnEvent(t, { type: "step", at: "2026-10-16T09:00:00Z", kind: "did", text: "Added a row to Food Log." });
    t = applyTurnEvent(t, { type: "text", delta: "Logged " });
    t = applyTurnEvent(t, { type: "text", delta: "**two eggs**" });
    expect(t.live?.partial).toBe("Logged **two eggs**");
    expect(t.live?.thought).toBe("Let me look at the table.");
    expect(t.live?.doing).toBe("Reading rows: food_log");
    expect(t.live?.tools).toBe(1);
    expect(t.steps?.map((s) => s.text)).toEqual(["Added a row to Food Log."]);
    t = applyTurnEvent(t, { type: "text", reset: true, text: "" });
    expect(t.live?.partial).toBe("");
    t = applyTurnEvent(t, { type: "state", state: "done" });
    expect(t.state).toBe("done");
  });
});
