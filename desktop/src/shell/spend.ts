/**
 * What Alpha's model calls cost (Settings › Models, 12 Oct, the owner), from the core's usage
 * rows (`/api/usage`): one per model a call used, answers and background passes alike, with the
 * tool's own API-equivalent price. ChatGPT through Codex gives tokens and no price, so its spend
 * is unknown, never zero-by-guess: rows say how many calls had no price. Rows from before the
 * core recorded usage carry no model.
 */
import type { UsageRow } from "../core/client";

export type Route = "claude" | "codex";
export type Range = "today" | "7d" | "30d" | "all";

export interface Use {
  at: Date;
  cost: number | null;
  route: Route | null;
  model: string | null;
  module: string | null;
  thread: string | null;
  turn: string | null;
  /** One call's rows share it (a call may use two models). */
  call: string;
  tokens: number;
}

export function uses(rows: UsageRow[]): Use[] {
  return rows.map((r) => ({
    at: new Date(r.at),
    cost: r.cost,
    route: r.route,
    model: r.model,
    module: r.module,
    thread: r.thread,
    turn: r.turn,
    call: `${r.at}|${r.turn ?? ""}|${r.kind}`,
    tokens: (r.input ?? 0) + (r.output ?? 0) + (r.cache_read ?? 0) + (r.cache_write ?? 0),
  }));
}

/** A model's name as people say it: "claude-sonnet-5-5" is "Sonnet 5.5". */
export function modelName(model: string | null, route: Route | null): string {
  if (!model) return route === "codex" ? "Codex's default" : route === "claude" ? "Not recorded" : "Unknown";
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model);
  if (!m) return model;
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[3] ? `${m[2]}.${m[3]}` : m[2]}`;
}

/** The first moment a range covers, in local time; null for all of it. */
export function since(range: Range, now = new Date()): Date | null {
  if (range === "all") return null;
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "today") return day;
  day.setDate(day.getDate() - (range === "7d" ? 6 : 29));
  return day;
}

export interface Row {
  key: string | null;
  spend: number;
  calls: number;
  /** Calls with no price (ChatGPT): their spend isn't in `spend`. */
  unpriced: number;
  tokens: number;
  /** Distinct conversations behind it. */
  threads: number;
}

/** Uses grouped by a key, most spent first (then most calls). */
export function rank(list: Use[], by: (u: Use) => string | null): Row[] {
  const rows = new Map<string | null, { key: string | null; spend: number; tokens: number; calls: Set<string>; unpriced: Set<string>; threads: Set<string> }>();
  for (const u of list) {
    const k = by(u);
    const row = rows.get(k) ?? { key: k, spend: 0, tokens: 0, calls: new Set(), unpriced: new Set(), threads: new Set() };
    row.spend += u.cost ?? 0;
    row.tokens += u.tokens;
    row.calls.add(u.call);
    if (u.cost === null) row.unpriced.add(u.call);
    if (u.thread) row.threads.add(u.thread);
    rows.set(k, row);
  }
  return [...rows.values()]
    .map((r) => ({ key: r.key, spend: r.spend, tokens: r.tokens, calls: r.calls.size, unpriced: r.unpriced.size, threads: r.threads.size }))
    .sort((a, b) => b.spend - a.spend || b.calls - a.calls);
}

export const total = (list: Use[]) => list.reduce((s, u) => s + (u.cost ?? 0), 0);
export const calls = (list: Use[]) => new Set(list.map((u) => u.call)).size;

/** Today's spend and yesterday's, local days. */
export function lastTwoDays(list: Use[], now = new Date()): { today: number; yesterday: number } {
  const today = since("today", now)!;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return {
    today: total(list.filter((u) => u.at >= today)),
    yesterday: total(list.filter((u) => u.at >= yesterday && u.at < today)),
  };
}

export const money = (n: number) => `$${n.toFixed(2)}`;
export const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
