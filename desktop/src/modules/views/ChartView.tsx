/** Bars per day of a date field: a count, or the sum of a numeric field. */
import { useState } from "react";
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { formatNumber, humanize } from "../format";
import { Dropdown } from "../../ui";

export function ChartView({ rows, dateField, valueField }: { rows: RecordRow[]; dateField: FieldInfo; valueField: FieldInfo | null }) {
  const [measure, setMeasure] = useState<string>(valueField?.name ?? "count");
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const raw = row.values[dateField.name];
    if (typeof raw !== "string") continue;
    const day = raw.slice(0, 10);
    const add = measure === "count" ? 1 : typeof row.values[measure] === "number" ? (row.values[measure] as number) : 0;
    byDay.set(day, (byDay.get(day) ?? 0) + add);
  }
  const days = [...byDay.keys()].sort().slice(-31);
  const max = Math.max(1, ...days.map((d) => byDay.get(d) ?? 0));
  return (
    <div className="chart">
      <div className="chart__head">
        <span className="faint">Per day, over the entries shown</span>
        <Dropdown size="sm" label="What to chart" value={measure} onChange={setMeasure} options={[{ value: "count", label: "Count" }, ...(valueField ? [{ value: valueField.name, label: humanize(valueField.name) }] : [])]} />
      </div>
      {days.length ? (
        <div className="chart__bars" role="img" aria-label={`${humanize(measure)} per day`}>
          {days.map((d) => {
            const v = byDay.get(d) ?? 0;
            return (
              <div key={d} className="chart__bar" title={`${d}: ${formatNumber(v)}`}>
                <div className="chart__fill" style={{ height: `${Math.round((v / max) * 100)}%` }} />
                <span className="chart__label">{d.slice(8)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty">Nothing to chart yet.</p>
      )}
    </div>
  );
}

