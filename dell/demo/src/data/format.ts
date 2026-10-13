import type { Field, Rec, Value } from "./types";

/** The demo's fixed "today". */
export const TODAY = "2026-10-12";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Dates are always absolute: "8 Oct 2026", "8 Oct, 14:30" (rulebook §2). */
export function fmtDate(iso: string, withYear = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, hh, mm] = m;
  const day = `${Number(d)} ${MON[Number(mo) - 1]}`;
  if (hh) return `${day}, ${hh}:${mm}`;
  return withYear ? `${day} ${y}` : day;
}

export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });

export function fmt(field: Field, v: Value | undefined): string {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return "";
  switch (field.type) {
    case "money": return money(Number(v));
    case "number": return Number(v).toLocaleString("en-US");
    case "percent": return `${v}%`;
    case "date": case "datetime": return fmtDate(String(v));
    case "check": return v ? "Yes" : "No";
    default: return Array.isArray(v) ? v.join(", ") : String(v);
  }
}

export const titleOf = (r: Rec, key: string) => String(r[key] ?? "Untitled");

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
