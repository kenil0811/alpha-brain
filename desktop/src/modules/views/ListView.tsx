/** One line per row: the title and a few values, for scanning; in collapsible groups when the
 *  view is grouped, coloured by the view's rules. */
import type { ReactNode } from "react";
import type { RecordRow } from "../../core/client";
import { showValue, type FieldInfo } from "../fields";
import { Badge } from "../../ui";
import { ChevronRight, ICON_SM } from "../../ui/icons";
import type { ColorTone, Group } from "./engine";

export function ListView({ rows, bodyRef, titleField, columns, byName, onOpen, groups, collapsed = [], onCollapse, toneOf, rowIcon }: { rows: RecordRow[]; bodyRef: { current: HTMLElement | null }; titleField: string | undefined; columns: string[]; byName: Map<string, FieldInfo>; onOpen: (id: string) => void; groups?: Group[] | null; collapsed?: string[]; onCollapse?: (key: string) => void; toneOf?: (row: RecordRow) => ColorTone | undefined; rowIcon?: (row: RecordRow) => ReactNode }) {
  const secondary = columns.filter((c) => c !== titleField).slice(0, 3);
  if (!rows.length) return <p className="empty">Nothing here yet.</p>;
  const line = (row: RecordRow) => {
    const tone = toneOf?.(row);
    return (
      <button key={row.id} type="button" className={`list__row${tone ? ` tone--${tone}` : ""}`} onClick={() => onOpen(row.id)}>
        {rowIcon?.(row)}
        <b>{titleField ? String(row.values[titleField] ?? "Untitled") : row.id}</b>
        <span className="faint">
          {secondary
            .map((c) => showValue(row.values[c], byName.get(c)?.kind ?? "text"))
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
    );
  };
  return (
    <div className="list" ref={(el) => { bodyRef.current = el; }}>
      {groups
        ? groups.map((g) => {
            const shut = collapsed.includes(g.key);
            return (
              <div key={g.key} className="list__group">
                <button type="button" className="grouphead" aria-expanded={!shut} onClick={() => onCollapse?.(g.key)}>
                  <ChevronRight size={ICON_SM} className={shut ? "grouphead__chev" : "grouphead__chev grouphead__chev--open"} aria-hidden="true" />
                  <Badge tone="gray">{g.label}</Badge>
                  <span className="faint num">{g.rows.length}</span>
                </button>
                {shut ? null : g.rows.map(line)}
              </div>
            );
          })
        : rows.map(line)}
    </div>
  );
}
