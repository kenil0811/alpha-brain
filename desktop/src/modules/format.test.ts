import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayLabel, dayText, formatDay, when } from "./format";

/** Dates are absolute and read the same on every Mac (the UI rulebook §2). */
describe("dates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 12, 0)); // 9 Oct 2026
  });
  afterEach(() => vi.useRealTimers());

  it("says a moment this year as a day and a time, never as yesterday or ago", () => {
    expect(when(new Date(2026, 9, 8, 14, 30).toISOString())).toBe("8 Oct, 14:30");
    expect(when(new Date(2026, 9, 9, 9, 5).toISOString())).toBe("9 Oct, 09:05");
  });

  it("adds the year, and drops the time, for another year", () => {
    expect(when(new Date(2025, 9, 8, 14, 30).toISOString())).toBe("8 Oct 2025");
    expect(formatDay("2025-10-08")).toBe("8 Oct 2025");
  });

  it("says a day alone as '8 Oct'", () => {
    expect(formatDay("2026-10-08")).toBe("8 Oct");
    expect(dayText(new Date(2026, 8, 1))).toBe("1 Sep");
  });

  it("heads a day with its weekday and date", () => {
    expect(dayLabel(new Date(2026, 9, 9, 8, 0).toISOString())).toBe("Friday 9 October");
    expect(dayLabel(new Date(2025, 9, 8, 8, 0).toISOString())).toBe("Wednesday 8 October 2025");
  });

  it("shows nothing for nothing, and the text itself when it is not a date", () => {
    expect(when(null)).toBe("");
    expect(when("soon")).toBe("soon");
  });
});
