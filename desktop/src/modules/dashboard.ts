/**
 * What the Dashboard view shows, worked out from a collection's fields and rows and nothing else
 * (9 Oct, the UI rulebook §6). Pure, so every number, label and "show these" is tested without a
 * browser. The platform knows no domain: a tile is chosen by the kind of a field (number, status or
 * choice, date) and "needs attention" is found by mechanism (a date that has passed while the status
 * is open, a required field left empty, a value Alpha estimated or assumed, a row that is gone),
 * never by what a field means. Every number states its basis; a value nobody knows is "Unknown".
 */
import type { RecordRow } from "../core/client";
import { CHOICE_KINDS, DATE_KINDS, NUMERIC_KINDS, firstOfKind, isNumeric, titleFieldOf, type FieldInfo } from "./fields";
import { formatDay, formatNumber, humanize } from "./format";

/** One tile as the person's layout keeps it (`PREF.dashboards[listKey]`): its type, the field it
 *  runs on, what it measures and how wide it is. The id is made from the other three, so a layout
 *  never holds the same tile twice. */
export interface Tile {
  id: string;
  type: "metric" | "breakdown" | "overtime" | "attention";
  /** The field it runs on: the number (metric), the status or choice (breakdown), the date (over time). */
  field?: string;
  /** Metric: count, sum, avg or estimated. Over time: count, or the name of a number field to add up. */
  measure?: string;
  size?: "normal" | "wide";
}

/** What a tile's call to action does: show exactly these records (a temporary filter named
 *  `label`), or say why it cannot. A disabled CTA keeps its text and gives its reason. */
export interface Cta {
  text: string;
  ids: string[];
  label: string;
  disabledReason?: string;
}

export interface Segment {
  key: string;
  label: string;
  count: number;
  ids: string[];
  /** Where it sits in the palette; the view turns it into a colour, and a label always goes with it. */
  index: number;
  /** A choice that means finished (`done_choices`). */
  done?: boolean;
  /** Unknown (no value) or Other (the choices folded together): drawn in grey. */
  muted?: boolean;
  /** What the records are called when shown: "Stage · Won". */
  showLabel: string;
}

export interface Bucket {
  key: string;
  label: string;
  /** "6 Oct" or "Oct", for the axis. */
  short: string;
  value: number;
  valueText: string;
  ids: string[];
  /** The bucket that holds today. */
  current: boolean;
}

export interface AttentionItem {
  id: string;
  title: string;
  reasons: string[];
}

export type TileData =
  | { id: string; type: "metric"; title: string; icon: "count" | "sum" | "avg" | "flag"; value: string; basis: string; cta: Cta }
  | { id: string; type: "breakdown"; title: string; basis: string; segments: Segment[]; total: number; empty?: string; cta: Cta }
  | { id: string; type: "overtime"; title: string; basis: string; legend: string; buckets: Bucket[]; period: "week" | "month"; empty?: string; cta: Cta }
  | { id: string; type: "attention"; title: string; basis: string; items: AttentionItem[]; total: number; empty?: string; cta: Cta };

export interface Ctx {
  fields: FieldInfo[];
  rows: RecordRow[];
  /** The field that names a record (`TableDesc.title_field`). */
  titleField?: string | null;
  /** Today, for "overdue" and "this week". */
  now?: Date;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;
/** More bars than this and the chart is no longer read at a glance. */
const MAX_BUCKETS = 12;
const MAX_SEGMENTS = 7;
const MAX_ATTENTION = 6;

const nameOf = (f: FieldInfo) => f.label ?? humanize(f.name);
/** A field's name inside a sentence: lower-case first letter, unless it is an acronym ("ARR"). */
const lc = (s: string) => (/^.[A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const records = (n: number) => `${n} ${n === 1 ? "record" : "records"}`;

/** Why the dashboard cannot be used, or null when it can: it needs something to count, add up or date. */
export function dashboardAvailable(fields: FieldInfo[]): string | null {
  return fields.some((f) => NUMERIC_KINDS.has(f.kind) || CHOICE_KINDS.has(f.kind) || DATE_KINDS.has(f.kind)) ? null : "Dashboard needs a number, status or date field";
}

function tile(type: Tile["type"], field?: string, measure?: string): Tile {
  return { id: [type, measure, field].filter(Boolean).join(":"), type, field, measure };
}

/** Every tile these fields can have, with the words that name it in the "Add a tile" list. */
export function availableTiles(fields: FieldInfo[]): { tile: Tile; label: string }[] {
  const out: { tile: Tile; label: string }[] = [{ tile: tile("metric", undefined, "count"), label: "Number of records" }];
  const firstNumber = firstOfKind(fields, NUMERIC_KINDS);
  for (const f of fields) {
    if (NUMERIC_KINDS.has(f.kind)) out.push({ tile: tile("metric", f.name, "sum"), label: `Total ${lc(nameOf(f))}` }, { tile: tile("metric", f.name, "avg"), label: `Average ${lc(nameOf(f))}` });
  }
  out.push({ tile: tile("metric", undefined, "estimated"), label: "Estimated by Alpha" });
  for (const f of fields) if (CHOICE_KINDS.has(f.kind)) out.push({ tile: tile("breakdown", f.name), label: `Records by ${lc(nameOf(f))}` });
  for (const f of fields) {
    if (!DATE_KINDS.has(f.kind)) continue;
    out.push({ tile: tile("overtime", f.name, "count"), label: `Records over time by ${lc(nameOf(f))}` });
    if (firstNumber) out.push({ tile: tile("overtime", f.name, firstNumber.name), label: `${nameOf(firstNumber)} over time by ${lc(nameOf(f))}` });
  }
  out.push({ tile: tile("attention"), label: "Needs attention" });
  return out;
}

/** The layout a list opens with: 4 to 7 tiles, picked by field kind. */
export function defaultTiles(fields: FieldInfo[]): Tile[] {
  const number = firstOfKind(fields, NUMERIC_KINDS);
  const choice = fields.find((f) => f.kind === "status") ?? firstOfKind(fields, CHOICE_KINDS);
  const date = firstOfKind(fields, DATE_KINDS);
  return [
    tile("metric", undefined, "count"),
    ...(number ? [tile("metric", number.name, "sum"), tile("metric", number.name, "avg")] : []),
    ...(choice ? [tile("breakdown", choice.name)] : []),
    ...(date ? [tile("overtime", date.name, "count")] : []),
    tile("attention"),
    tile("metric", undefined, "estimated"),
  ];
}

const dayOf = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const utc = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const todayOf = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** The first day of the week (Monday) or month a day falls in. */
function startOf(day: string, period: "week" | "month"): string {
  if (period === "month") return `${day.slice(0, 7)}-01`;
  const ms = utc(day);
  return iso(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY);
}
function nextStart(start: string, period: "week" | "month"): string {
  if (period === "week") return iso(utc(start) + 7 * DAY);
  const [y, m] = start.split("-").map(Number);
  return iso(Date.UTC(y, m, 1));
}

function disabled(text: string, label: string, reason: string): Cta {
  return { text, ids: [], label, disabledReason: reason };
}
const noRecords = "There are no records yet.";

function metric(t: Tile, { fields, rows }: Ctx): TileData {
  const f = fields.find((x) => x.name === t.field);
  const all = rows.map((r) => r.id);
  if (t.measure === "estimated") {
    const ids = rows.filter((r) => r.provenance?.estimated || r.provenance?.assumed).map((r) => r.id);
    return { id: t.id, type: "metric", title: "Estimated by Alpha", icon: "flag", value: formatNumber(ids.length), basis: `of ${records(rows.length)} rest on a value Alpha estimated or assumed`, cta: ids.length ? { text: `Show these ${ids.length}`, ids, label: `Estimated · ${ids.length}` } : disabled("Show these", "", rows.length ? "No record rests on an estimate or an assumption." : noRecords) };
  }
  if (!f || !isNumeric(f.kind)) return { id: t.id, type: "metric", title: "Records", icon: "count", value: formatNumber(rows.length), basis: "In this view", cta: all.length ? { text: `Show these ${all.length}`, ids: all, label: `Records · ${all.length}` } : disabled("Show these", "", noRecords) };
  const withValue = rows.filter((r) => typeof r.values[f.name] === "number");
  const sum = withValue.reduce((s, r) => s + (r.values[f.name] as number), 0);
  const avg = t.measure === "avg";
  const title = `${avg ? "Average" : "Total"} ${lc(nameOf(f))}`;
  const ids = withValue.map((r) => r.id);
  return {
    id: t.id,
    type: "metric",
    title,
    icon: avg ? "avg" : "sum",
    value: withValue.length ? formatNumber(avg ? sum / withValue.length : sum, f.unit) : "Unknown",
    basis: withValue.length ? `${withValue.length} of ${records(rows.length)} have a value in ${nameOf(f)}` : rows.length ? `No record has a value in ${nameOf(f)} yet` : "No records yet",
    cta: ids.length ? { text: `Show these ${ids.length}`, ids, label: `${title} · ${ids.length}` } : disabled("Show these", "", rows.length ? `No record has a value in ${nameOf(f)} yet.` : noRecords),
  };
}

function breakdown(t: Tile, { fields, rows }: Ctx): TileData | null {
  const f = fields.find((x) => x.name === t.field && CHOICE_KINDS.has(x.kind));
  if (!f) return null;
  const done = new Set(f.done_choices ?? []);
  const groups = new Map<string, string[]>((f.choices ?? []).map((c) => [c, []]));
  let unknown: string[] = [];
  for (const r of rows) {
    const raw = r.values[f.name];
    if (empty(raw)) unknown.push(r.id);
    else for (const v of Array.isArray(raw) ? raw.map(String) : [String(raw)]) groups.set(v, [...(groups.get(v) ?? []), r.id]);
  }
  const name = nameOf(f);
  const mk = (key: string, ids: string[], extra: Partial<Segment> = {}): Segment => ({ key, label: humanize(key), count: ids.length, ids, index: 0, done: done.has(key), showLabel: `${name} · ${humanize(key)}`, ...extra });
  let segments = [...groups].map(([k, ids]) => mk(k, ids));
  if (unknown.length) segments.push(mk("", unknown, { label: "Unknown", muted: true, done: false, showLabel: `${name} · Unknown` }));
  if (rows.length) segments = segments.filter((s) => s.count > 0);
  if (segments.length > MAX_SEGMENTS) {
    // keep the biggest, in the field's own order, and fold the rest so the legend stays readable
    const keep = new Set([...segments].filter((s) => !s.muted).sort((a, b) => b.count - a.count).slice(0, MAX_SEGMENTS - 1).map((s) => s.key));
    const rest = segments.filter((s) => !keep.has(s.key) && !s.muted);
    const other = mk("__other", [...new Set(rest.flatMap((s) => s.ids))], { label: "Other", muted: true, done: false, showLabel: `${name} · Other` });
    segments = [...segments.filter((s) => keep.has(s.key) || s.muted), other];
  }
  segments = segments.slice(0, MAX_SEGMENTS).map((s, index) => ({ ...s, index }));
  const pick = [...segments].filter((s) => s.count && !s.muted).sort((a, b) => Number(a.done) - Number(b.done) || b.count - a.count)[0] ?? [...segments].sort((a, b) => b.count - a.count)[0];
  const multi = f.kind === "multichoice" ? "; a record with several choices counts under each" : "";
  return {
    id: t.id,
    type: "breakdown",
    title: `Records by ${lc(name)}`,
    basis: `${records(rows.length)}${unknown.length ? `, ${unknown.length} with no value (Unknown)` : ""}${multi}`,
    segments,
    total: rows.length,
    empty: rows.length ? undefined : "No records yet.",
    cta: pick?.count ? { text: `Show ${pick.label} (${pick.count})`, ids: pick.ids, label: pick.showLabel } : disabled("Show records", "", rows.length ? `No record has a value in ${name} yet.` : noRecords),
  };
}

function overtime(t: Tile, { fields, rows, now = new Date() }: Ctx): TileData | null {
  const f = fields.find((x) => x.name === t.field && DATE_KINDS.has(x.kind));
  if (!f) return null;
  const num = t.measure && t.measure !== "count" ? fields.find((x) => x.name === t.measure && isNumeric(x.kind)) : undefined;
  const dated = rows.flatMap((r) => {
    const day = dayOf(r.values[f.name]);
    return day ? [{ r, day }] : [];
  });
  const noun = num ? nameOf(num) : "Records";
  const title = num ? `${nameOf(num)} by ${lc(nameOf(f))}` : `Records by ${lc(nameOf(f))}`;
  const basis0 = `${dated.length} of ${records(rows.length)} have a value in ${nameOf(f)}`;
  if (!dated.length) {
    return { id: t.id, type: "overtime", title, basis: basis0, legend: noun, buckets: [], period: "week", empty: rows.length ? `No record has a value in ${nameOf(f)} yet.` : "No records yet.", cta: disabled("Show records", "", rows.length ? `No record has a value in ${nameOf(f)} yet.` : noRecords) };
  }
  const days = dated.map((d) => d.day).sort();
  const period = (utc(days[days.length - 1]) - utc(days[0])) / DAY > 98 ? "month" : "week";
  const groups = new Map<string, RecordRow[]>();
  for (const { r, day } of dated) groups.set(startOf(day, period), [...(groups.get(startOf(day, period)) ?? []), r]);
  const today = startOf(todayOf(now), period);
  const buckets: Bucket[] = [];
  for (let s = startOf(days[0], period); s <= startOf(days[days.length - 1], period); s = nextStart(s, period)) {
    const rs = groups.get(s) ?? [];
    const value = num ? rs.reduce((sum, r) => sum + (typeof r.values[num.name] === "number" ? (r.values[num.name] as number) : 0), 0) : rs.length;
    const [y, m] = s.split("-").map(Number);
    buckets.push({ key: s, label: period === "week" ? `Week of ${formatDay(s)}` : `${MONTHS[m - 1]} ${y}`, short: period === "week" ? formatDay(s).replace(/ \d{4}$/, "") : MONTHS[m - 1], value, valueText: formatNumber(value, num?.unit), ids: rs.map((r) => r.id), current: s === today });
  }
  const shown = buckets.slice(-MAX_BUCKETS);
  const target = shown.find((b) => b.current && b.ids.length) ?? [...shown].reverse().find((b) => b.ids.length);
  return {
    id: t.id,
    type: "overtime",
    title,
    basis: `${noun} per ${period} · ${basis0}`,
    legend: `${noun} per ${period}`,
    buckets: shown,
    period,
    cta: target ? { text: target.current ? `Show this ${period}` : period === "week" ? `Show the week of ${formatDay(target.key)}` : `Show ${target.label}`, ids: target.ids, label: `${target.label} · ${target.ids.length}` } : disabled(`Show this ${period}`, "", "No record falls in the weeks or months shown."),
  };
}

function attention(t: Tile, { fields, rows, titleField, now = new Date() }: Ctx): TileData {
  const today = todayOf(now);
  const dateField = (t.field ? fields.find((f) => f.name === t.field) : undefined) ?? firstOfKind(fields, DATE_KINDS);
  // a date only "passes" against a status that can be finished
  const finishes = fields.filter((f) => f.done_choices?.length);
  const required = fields.filter((f) => f.required);
  const titleName = titleFieldOf(fields, titleField);
  const flagged = rows.flatMap((r) => {
    const reasons: string[] = [];
    const day = dateField ? dayOf(r.values[dateField.name]) : null;
    const isDone = finishes.some((f) => f.done_choices?.includes(String(r.values[f.name] ?? "")));
    if (dateField && finishes.length && day && day < today && !isDone) reasons.push(`Overdue · ${nameOf(dateField)} ${formatDay(day)}`);
    for (const f of required) if (empty(r.values[f.name])) reasons.push(`Missing ${lc(nameOf(f))}`);
    if (r.provenance?.estimated) reasons.push("Alpha estimated a value");
    else if (r.provenance?.assumed) reasons.push(`Alpha assumed: ${r.provenance.assumed}`);
    if (r.gone_at) reasons.push(`Gone since ${formatDay(r.gone_at.slice(0, 10))}`);
    return reasons.length ? [{ id: r.id, title: String(titleName ? (r.values[titleName] ?? "") : "") || "Untitled", reasons }] : [];
  });
  const items = [...flagged].sort((a, b) => b.reasons.length - a.reasons.length).slice(0, MAX_ATTENTION);
  const checks = [finishes.length && dateField ? "overdue" : "", required.length ? "missing a required value" : "", "estimated or assumed by Alpha", "gone"].filter(Boolean);
  const ids = flagged.map((x) => x.id);
  return {
    id: t.id,
    type: "attention",
    title: "Needs attention",
    basis: `Checked for ${checks.join(", ")} · ${flagged.length} of ${records(rows.length)}`,
    items,
    total: flagged.length,
    empty: flagged.length ? undefined : rows.length ? "Nothing needs attention." : "No records yet.",
    cta: ids.length ? { text: `Show all ${ids.length}`, ids, label: `Needs attention · ${ids.length}` } : disabled("Show all", "", rows.length ? "Nothing needs attention right now." : noRecords),
  };
}

/** One tile's words, numbers and the records behind each part; null when its field is gone. */
export function computeTile(t: Tile, ctx: Ctx): TileData | null {
  if (t.type === "metric") return metric(t, ctx);
  if (t.type === "breakdown") return breakdown(t, ctx);
  if (t.type === "overtime") return overtime(t, ctx);
  return attention(t, ctx);
}
