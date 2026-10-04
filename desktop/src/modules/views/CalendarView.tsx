/** A month of a date field, rows as chips on their days. */
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { IconButton } from "../../ui";
import { ChevronLeft, ChevronRight } from "../../ui/icons";
import { byDay } from "./engine";

export function CalendarView({ rows, field, titleField, month, onMonth, onOpen }: { rows: RecordRow[]; field: FieldInfo; titleField: string | undefined; month: { y: number; m: number }; onMonth: (m: { y: number; m: number }) => void; onOpen: (id: string) => void }) {
  const first = new Date(month.y, month.m, 1);
  const start = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(start).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const onDays = byDay(rows, field);
  const label = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return (
    <div className="calendar">
      <div className="calendar__head">
        <IconButton size="sm" label="Previous month" icon={<ChevronLeft />} onClick={() => onMonth(month.m === 0 ? { y: month.y - 1, m: 11 } : { y: month.y, m: month.m - 1 })} />
        <b>{label}</b>
        <IconButton size="sm" label="Next month" icon={<ChevronRight />} onClick={() => onMonth(month.m === 11 ? { y: month.y + 1, m: 0 } : { y: month.y, m: month.m + 1 })} />
      </div>
      <div className="calendar__grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="calendar__dow">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          const iso = day ? `${month.y}-${String(month.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
          const items = day ? (onDays.get(iso) ?? []) : [];
          return (
            <div key={i} className={`calendar__day${day ? "" : " calendar__day--pad"}`}>
              {day ? <span className="calendar__num">{day}</span> : null}
              {items.slice(0, 3).map((row) => (
                <button key={row.id} type="button" className="calendar__chip" onClick={() => onOpen(row.id)}>
                  {titleField ? String(row.values[titleField] ?? "Untitled") : row.id}
                </button>
              ))}
              {items.length > 3 ? <span className="faint">+{items.length - 3}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

