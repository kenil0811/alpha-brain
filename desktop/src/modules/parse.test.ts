import { describe, expect, it } from "vitest";
import { formatDate, formatNumberText, parseDate, parseNumber } from "./parse";

const now = new Date(2026, 9, 11, 9, 0); // Sunday 11 Oct 2026, 09:00
const day = (text: string) => parseDate(text, now)?.iso ?? null;

describe("parseDate", () => {
  it.each([
    ["13 Oct", "2026-10-13"],
    ["13 Oct 2026", "2026-10-13"],
    ["13 october 2027", "2027-10-13"],
    ["13th of Oct", "2026-10-13"],
    ["Oct 13", "2026-10-13"],
    ["October 13, 2026", "2026-10-13"],
    ["sept 3", "2026-09-03"],
    ["13/10", "2026-10-13"],
    ["13/10/2026", "2026-10-13"],
    ["13.10.26", "2026-10-13"],
    ["3-1-2027", "2027-01-03"],
    ["2026-10-13", "2026-10-13"],
    ["2026/1/5", "2026-01-05"],
    ["  Today ", "2026-10-11"],
    ["tomorrow", "2026-10-12"],
    ["yesterday", "2026-10-10"],
    ["in 3 days", "2026-10-14"],
    ["in 2 weeks", "2026-10-25"],
    ["3 days ago", "2026-10-08"],
    ["friday", "2026-10-16"],
    ["Fri", "2026-10-16"],
    ["sunday", "2026-10-11"], // the coming one is today
    ["next friday", "2026-10-16"],
    ["next sunday", "2026-10-18"],
    ["last friday", "2026-10-09"],
    ["Tue 13 Oct", "2026-10-13"],
    ["Tuesday, 13 October 2026", "2026-10-13"],
    ["29/2/2028", "2028-02-29"],
  ])("reads %s as %s", (text, iso) => {
    expect(parseDate(text, now)).toEqual({ iso, hasTime: false });
  });

  it.each([
    ["13 Oct 2026, 14:30", "2026-10-13T14:30"],
    ["13 Oct 2026 2:30pm", "2026-10-13T14:30"],
    ["13/10 at 9am", "2026-10-13T09:00"],
    ["tomorrow 12am", "2026-10-12T00:00"],
    ["friday 12pm", "2026-10-16T12:00"],
    ["2026-10-13T14:30", "2026-10-13T14:30"],
    ["2026-10-13T14:30:00", "2026-10-13T14:30"],
    ["14:30", "2026-10-11T14:30"],
    ["2 p.m.", "2026-10-11T14:00"],
  ])("reads %s with its time", (text, iso) => {
    expect(parseDate(text, now)).toEqual({ iso, hasTime: true });
  });

  it.each(["", "   ", "garbage", "31/2", "32 Oct", "13/13", "Oct", "13 Foo", "2026-13-01", "25:00", "13 Oct 13pm", "next", "in days", "1.2k", "13"])("can't read %j", (text) => {
    expect(day(text)).toBeNull();
  });
});

describe("formatDate", () => {
  it("writes the house format", () => {
    expect(formatDate("2026-10-13", false)).toBe("13 Oct 2026");
    expect(formatDate("2026-10-13T14:30", true)).toBe("13 Oct 2026, 14:30");
    expect(formatDate("2026-10-13T14:30", false)).toBe("13 Oct 2026");
    expect(formatDate("2026-01-05", true)).toBe("5 Jan 2026, 00:00");
    expect(formatDate(null, false)).toBe("");
    expect(formatDate("not a date", false)).toBe("not a date");
  });

  it("round-trips through parseDate", () => {
    for (const iso of ["2026-10-13", "2027-02-28", "2025-12-31"]) expect(day(formatDate(iso, false))).toBe(iso);
    expect(parseDate(formatDate("2026-10-13T14:30", true), now)?.iso).toBe("2026-10-13T14:30");
  });
});

describe("parseNumber", () => {
  it.each([
    ["1240", 1240],
    ["1,240", 1240],
    ["1 240", 1240],
    ["1,240,000.5", 1240000.5],
    ["$1,200", 1200],
    ["£ 5", 5],
    ["1.2k", 1200],
    ["1.1K", 1100],
    ["5k", 5000],
    ["2.5m", 2500000],
    ["3bn", 3e9],
    ["15%", 15],
    ["-3", -3],
    ["−3", -3],
    ["+3", 3],
    ["(3)", -3],
    ["($1,200)", -1200],
    ["-$3", -3],
    ["$-3", -3],
    [".5", 0.5],
    ["0", 0],
    ["-0", 0],
    [" 42 ", 42],
  ])("reads %j as %d", (text, n) => {
    expect(parseNumber(text)).toBe(n);
  });

  it("allows the field's own unit and no other word", () => {
    expect(parseNumber("320 kcal", "kcal")).toBe(320);
    expect(parseNumber("320kcal", "kcal")).toBe(320);
    expect(parseNumber("320 KCAL", "kcal")).toBe(320);
    expect(parseNumber("1.2k kcal", "kcal")).toBe(1200);
    expect(parseNumber("320 kcal")).toBeNull();
    expect(parseNumber("320 kg", "kcal")).toBeNull();
    expect(parseNumber("5 m", "m")).toBe(5); // the unit, not a million
  });

  it.each(["", "abc", "1.2.3", "1,5", "12,34", "1,2345", "1 24", "k", "--3", "((3))", "3-", "1e5", "$", "5 apples", "NaN", "Infinity"])("can't read %j", (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});

describe("formatNumberText", () => {
  it("groups digits and keeps the decimals", () => {
    expect(formatNumberText(1240)).toBe("1,240");
    expect(formatNumberText(-3)).toBe("-3");
    expect(formatNumberText(1240.125)).toBe("1,240.125");
    expect(formatNumberText(null)).toBe("");
    expect(parseNumber(formatNumberText(1234567.89))).toBe(1234567.89);
  });
});
