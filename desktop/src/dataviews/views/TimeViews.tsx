/**
 * Calendar and timeline. The calendar answers "what is on the 14th"; the timeline answers "what
 * overlaps what": a row with only a start is a point, give it an end field and it is a bar. Both
 * read the date field from the view (`dateBy`), so switching between them keeps the choice.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import { DATE_KINDS } from "../../modules/fields";
import type { DataRow, ViewConfig } from "../engine";
import { fieldLabel } from "../cells";
import { titleOf } from "./CardViews";
import type { ViewProps } from "../types";

const dayOf = (v: unknown) => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function DateFieldPicker({ p, keyName, label, optional }: { p: ViewProps; keyName: "dateBy" | "endDateBy"; label: string; optional?: boolean }) {
  const dates = p.allFields.filter((f) => DATE_KINDS.has(f.kind));
  if (dates.length < 2 && !optional) return null;
  return (
    <label className="dv-inline">
      <span className="dv-faint">{label}</span>
      <select className="dv-select" value={p.view[keyName] ?? ""} onChange={(e) => p.onViewChange({ ...p.view, [keyName]: e.target.value || undefined } as ViewConfig)}>
        {optional ? <option value="">None</option> : null}
        {dates.map((f) => (
          <option key={f.name} value={f.name}>
            {fieldLabel(f)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CalendarView(p: ViewProps) {
  const field = p.view.dateBy;
  const byDay = useMemo(() => {
    const out = new Map<string, DataRow[]>();
    for (const row of p.rows) {
      const day = field ? dayOf(row[field]) : null;
      if (day) out.set(day, [...(out.get(day) ?? []), row]);
    }
    return out;
  }, [p.rows, field]);
  // Open on this month, or on the nearest month that has something in it.
  const [month, setMonth] = useState(() => {
    const now = new Date();
    const here = iso(now.getFullYear(), now.getMonth(), 1).slice(0, 7);
    const days = [...byDay.keys()].sort();
    if (!days.length || days.some((d) => d.startsWith(here))) return { y: now.getFullYear(), m: now.getMonth() };
    const nearest = days.reduce((a, b) => (Math.abs(Date.parse(b) - now.getTime()) < Math.abs(Date.parse(a) - now.getTime()) ? b : a));
    return { y: Number(nearest.slice(0, 4)), m: Number(nearest.slice(5, 7)) - 1 };
  });
  const first = new Date(month.y, month.m, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(start).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = new Date();
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());
  const step = (by: number) => setMonth(({ y, m }) => ({ y: m + by < 0 ? y - 1 : m + by > 11 ? y + 1 : y, m: (m + by + 12) % 12 }));
  return (
    <div className="dv-cal">
      <div className="dv-viewbar">
        <IconButton size="sm" aria-label="Previous month" onClick={() => step(-1)}>
          <ChevronLeft size={14} />
        </IconButton>
        <b className="dv-cal__month">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
        <IconButton size="sm" aria-label="Next month" onClick={() => step(1)}>
          <ChevronRight size={14} />
        </IconButton>
        <span className="dv-spacer" />
        <DateFieldPicker p={p} keyName="dateBy" label="Date" />
      </div>
      <div className="dv-cal__grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="dv-cal__dow">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const at = day ? iso(month.y, month.m, day) : "";
          const items = day ? (byDay.get(at) ?? []) : [];
          return (
            <div key={i} className={`dv-cal__day${day ? "" : " dv-cal__day--pad"}${at === todayIso ? " dv-cal__day--today" : ""}`}>
              {day ? (
                <span className="dv-cal__num">
                  {day}
                  {field ? (
                    <button type="button" className="dv-cal__add" aria-label={`New row on ${at}`} onClick={() => p.onNew({ [field]: at })}>
                      <Plus size={12} />
                    </button>
                  ) : null}
                </span>
              ) : null}
              {items.slice(0, 3).map((row) => (
                <button key={row.id} type="button" className="dv-cal__chip" title={titleOf(row, p.titleField)} onClick={() => p.onOpen(row.id)}>
                  {titleOf(row, p.titleField)}
                </button>
              ))}
              {items.length > 3 ? <span className="dv-faint">+{items.length - 3} more</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Zoom = "day" | "week" | "month";
const TICK_PX = 72;
const DAY = 86_400_000;

function floorTo(t: number, zoom: Zoom): Date {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  if (zoom === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (zoom === "month") d.setDate(1);
  return d;
}
function next(d: Date, zoom: Zoom): Date {
  const n = new Date(d);
  if (zoom === "month") n.setMonth(n.getMonth() + 1);
  else n.setDate(n.getDate() + (zoom === "week" ? 7 : 1));
  return n;
}
const time = (v: unknown) => {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(t) ? null : t;
};

export function TimelineView(p: ViewProps) {
  const zoom: Zoom = p.view.timelineZoom ?? "week";
  const start = p.view.dateBy;
  const end = p.view.endDateBy;
  const placed = useMemo(
    () =>
      p.rows
        .map((row) => {
          const a = start ? time(row[start]) : null;
          const b = end ? time(row[end]) : null;
          return a === null ? null : { row, a, b: b !== null && b >= a ? b : a };
        })
        .filter((x): x is { row: DataRow; a: number; b: number } => x !== null)
        .sort((x, y) => x.a - y.a),
    [p.rows, start, end],
  );
  const unplaced = p.rows.length - placed.length;
  if (!placed.length) return <p className="dv-empty">Nothing here has a date yet</p>;
  const lo = floorTo(Math.min(...placed.map((x) => x.a)), zoom);
  const hi = Math.max(...placed.map((x) => x.b));
  const ticks: Date[] = [];
  for (let d = lo; d.getTime() <= hi || ticks.length < 2; d = next(d, zoom)) ticks.push(d);
  ticks.push(next(ticks[ticks.length - 1]!, zoom));
  const span = ticks[ticks.length - 1]!.getTime() - lo.getTime();
  const width = (ticks.length - 1) * TICK_PX;
  const x = (t: number) => ((t - lo.getTime()) / span) * width;
  const label = (d: Date) => (zoom === "month" ? d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" }));
  return (
    <div className="dv-tl">
      <div className="dv-viewbar">
        <div className="dv-seg" role="group" aria-label="Zoom">
          {(["day", "week", "month"] as Zoom[]).map((z) => (
            <button key={z} type="button" aria-pressed={zoom === z} onClick={() => p.onViewChange({ ...p.view, timelineZoom: z })}>
              {z === "day" ? "Days" : z === "week" ? "Weeks" : "Months"}
            </button>
          ))}
        </div>
        <span className="dv-spacer" />
        {unplaced ? <span className="dv-faint">{unplaced} without a date</span> : null}
        <DateFieldPicker p={p} keyName="dateBy" label="Start" />
        <DateFieldPicker p={p} keyName="endDateBy" label="End" optional />
      </div>
      <div className="dv-tl__scroll">
        <div className="dv-tl__grid" style={{ width: width + 220 }}>
          <div className="dv-tl__head">
            <span className="dv-tl__label" />
            <span className="dv-tl__ticks" style={{ width }}>
              {ticks.slice(0, -1).map((d) => (
                <span key={d.getTime()} className="dv-tl__tick" style={{ left: x(d.getTime()), width: TICK_PX }}>
                  {label(d)}
                </span>
              ))}
            </span>
          </div>
          {placed.map(({ row, a, b }) => (
            <div key={row.id} className="dv-tl__lane">
              <button type="button" className="dv-tl__label dv-ellipsis" onClick={() => p.onOpen(row.id)} title={titleOf(row, p.titleField)}>
                {titleOf(row, p.titleField)}
              </button>
              <span className="dv-tl__track" style={{ width }}>
                <button
                  type="button"
                  className={b > a ? "dv-tl__bar" : "dv-tl__dot"}
                  style={{ left: x(a), width: b > a ? Math.max(8, x(b + (end && b - a >= 0 ? DAY : 0)) - x(a)) : undefined }}
                  title={`${titleOf(row, p.titleField)} · ${new Date(a).toLocaleDateString()}${b > a ? ` – ${new Date(b).toLocaleDateString()}` : ""}`}
                  aria-label={`Open ${titleOf(row, p.titleField)}`}
                  onClick={() => p.onOpen(row.id)}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
