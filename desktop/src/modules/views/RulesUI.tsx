/**
 * A column's menu (13 Oct, Q42 section 3a; the feature from pull request #5, placed in the
 * columns as AG Grid does at Kenil's ask, the look main's own: its icon button, its pop-up and
 * its dropdowns). The ⋮ at a header's right end opens the column's Filter, which fits the field's kind (a choice column's
 * ticklist of values with counts, a condition and a value for text, numbers and dates, ticked
 * or not), and what belongs to that column (Hide done on the status, Show gone on Seen).
 * Sorting is not in it (Kenil, 13 Oct: "sort should not be in the menu, because its already
 * possible by clicking on column name"): a header click sorts, a shift-click adds a level.
 * `ViewState` is the toolbar's one word for the grouping and the filters, with their menu.
 */
import { useState, type ReactNode } from "react";
import type { RecordRow } from "../../core/client";
import { Button, IconButton, Popover } from "../../ui";
import { ChevronDown, ColumnMenuIcon } from "../../ui/icons";
import { isNumeric, type FieldInfo } from "../fields";
import { humanize } from "../format";
import { groupable, needsValue, OP_WORDS, opsFor, type FilterRule } from "./engine";

const empty = (v: unknown) => v === null || v === undefined || v === "";

/** A choice column's ticklist: every value the column offers or holds, with how many rows hold it. */
function Ticklist({ field, rows, rule, onRule }: { field: FieldInfo; rows: RecordRow[]; rule?: FilterRule; onRule: (r: FilterRule | null) => void }) {
  const counts = new Map<string, number>();
  for (const c of field.choices ?? []) counts.set(c, 0);
  for (const r of rows) {
    const v = r.values[field.name];
    const key = empty(v) ? "" : String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const all = [...counts.keys()];
  const kept = new Set(rule?.op === "in" && rule.values ? rule.values : all);
  const set = (next: Set<string>) => onRule(next.size === all.length ? null : { field: field.name, op: "in", value: "", values: all.filter((v) => next.has(v)) });
  return (
    <div className="colmenu__list" role="group" aria-label={`Values of ${humanize(field.name)}`}>
      <label className="menu__item">
        <input type="checkbox" checked={kept.size === all.length} onChange={(e) => set(new Set(e.target.checked ? all : []))} /> Select all
      </label>
      {all.map((v) => (
        <label key={v || "(empty)"} className="menu__item">
          <input type="checkbox" checked={kept.has(v)} onChange={(e) => { const next = new Set(kept); if (e.target.checked) next.add(v); else next.delete(v); set(next); }} />
          <span className="colmenu__value">{v ? humanize(v) : "Empty"}</span>
          <span className="faint num">{(counts.get(v) ?? 0).toLocaleString()}</span>
        </label>
      ))}
    </div>
  );
}

/** A condition and its value (two for "between") for text, numbers, dates and many-choice columns. */
function Condition({ field, rule, onRule }: { field: FieldInfo; rule?: FilterRule; onRule: (r: FilterRule | null) => void }) {
  const ops = opsFor(field.kind);
  const current: FilterRule = rule ?? { field: field.name, op: ops[0], value: "" };
  const set = (next: FilterRule) => onRule(next);
  const type = current.op === "within" || isNumeric(field.kind) ? "number" : field.kind === "date" || field.kind === "datetime" ? "date" : "text";
  return (
    <div className="colmenu__cond">
      <select className="btn btn--sm" value={current.op} onChange={(e) => set({ ...current, op: e.target.value as FilterRule["op"], value: "", value2: "" })} aria-label="Condition">
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_WORDS[op]}
          </option>
        ))}
      </select>
      {field.kind === "multichoice" && needsValue(current.op) ? (
        <select className="btn btn--sm" value={current.value} onChange={(e) => set({ ...current, value: e.target.value })} aria-label="Value">
          <option value="">Choose…</option>
          {(field.choices ?? []).map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </select>
      ) : needsValue(current.op) ? (
        <span className="colmenu__values">
          <input className="textfield colmenu__input" type={type} value={current.value} onChange={(e) => set({ ...current, value: e.target.value })} aria-label={current.op === "between" ? "From" : "Value"} placeholder={current.op === "within" ? "days" : current.op === "between" ? "from" : "value"} />
          {current.op === "between" ? <input className="textfield colmenu__input" type={type} value={current.value2 ?? ""} onChange={(e) => set({ ...current, value2: e.target.value })} aria-label="To" placeholder="to" /> : null}
        </span>
      ) : null}
    </div>
  );
}

/** `grouped`/`onGroup`: the column can group the table (section 3b): Group by this column, or Ungroup. */
export function ColumnMenu({ field, rows, rule, onRule, extra, grouped, onGroup }: { field: FieldInfo; rows: RecordRow[]; rule?: FilterRule; onRule: (r: FilterRule | null) => void; extra?: ReactNode; grouped?: boolean; onGroup?: (on: boolean) => void }) {
  const name = field.label && field.label !== field.name ? field.label : humanize(field.name);
  const on = Boolean(rule) || Boolean(grouped);
  const kind = field.kind;
  const [open, setOpen] = useState(false);
  return (
    <span className={`th__menu${on ? " th__menu--on" : ""}`}>
      <Popover open={open} onOpenChange={setOpen} label={`${name}: filter`} align="end" trigger={<IconButton size="sm" label={`Filter ${name}`} icon={<ColumnMenuIcon />} />}>
        <div className="colmenu">
          {onGroup && groupable(kind) ? (
            <button type="button" className="menu__item" onClick={() => { onGroup(!grouped); setOpen(false); }}>
              {grouped ? "Ungroup" : "Group by this column"}
            </button>
          ) : null}
          <div className="menu__head">Filter</div>
          {kind === "choice" || kind === "status" ? (
            <Ticklist field={field} rows={rows} rule={rule} onRule={onRule} />
          ) : kind === "bool" ? (
            <div className="colmenu__list" role="radiogroup" aria-label={`Filter ${name}`}>
              {([["any", "Any"], ["checked", "Ticked"], ["unchecked", "Not ticked"]] as const).map(([op, words]) => (
                <label key={op} className="menu__item">
                  <input type="radio" name={`tick-${field.name}`} checked={(rule?.op ?? "any") === op} onChange={() => onRule(op === "any" ? null : { field: field.name, op, value: "" })} /> {words}
                </label>
              ))}
            </div>
          ) : (
            <Condition field={field} rule={rule} onRule={onRule} />
          )}
          {rule ? (
            <button type="button" className="menu__item" onClick={() => onRule(null)}>
              Clear this filter
            </button>
          ) : null}
          {extra}
        </div>
      </Popover>
    </span>
  );
}

/** The menu of a reader-fed table's Seen column: only Show gone. */
export function SeenMenu({ showGone, goneCount, onShowGone }: { showGone: boolean; goneCount: number; onShowGone: (on: boolean) => void }) {
  return (
    <span className={`th__menu${showGone ? " th__menu--on" : ""}`}>
      <Popover label="Seen: gone rows" align="end" trigger={<IconButton size="sm" label="Seen: gone rows" icon={<ColumnMenuIcon />} />}>
        <div className="colmenu">
          <label className="menu__item">
            <input type="checkbox" checked={showGone} onChange={(e) => onShowGone(e.target.checked)} /> Show gone rows ({goneCount.toLocaleString()})
          </label>
          <p className="faint colmenu__note">Rows its reader no longer finds on the site. They are kept, hidden unless shown.</p>
        </div>
      </Popover>
    </span>
  );
}

/** The toolbar's one word for what arranges and narrows the rows (13 Oct: grouping and filters
 *  in one button, so the toolbar stays one line beside a fixed-width search and switching views
 *  moves nothing): "Grouped · 2 filters ▾", "By Status ▾" on the Board, or either alone. Its
 *  menu: what the rows are grouped by (the Board's choice too), how the filters combine (all or
 *  any), Clear all filters. */
export function ViewState({ groupedBy, groupValue, groupOptions, board, count, match, onMatch, onClear, onGroupBy }: { groupedBy: string | null; groupValue: string | null; groupOptions: { name: string; label: string }[]; board: boolean; count: number; match: "all" | "any"; onMatch: (m: "all" | "any") => void; onClear: () => void; onGroupBy: (field: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const choosing = board && groupOptions.length > 1;
  if (!groupedBy && !count && !choosing) return null;
  const filters = count === 1 ? "1 filter" : `${count} filters`;
  const group = groupedBy ? (board ? `By ${groupedBy}` : count ? "Grouped" : `Grouped: ${groupedBy}`) : "";
  const words = [group, count ? filters : ""].filter(Boolean).join(" · ");
  return (
    <span className="filtersum" role="status">
      <Popover open={open} onOpenChange={setOpen} label="What shapes these rows" align="start" trigger={<Button size="sm">{words} <ChevronDown size={12} aria-hidden="true" /></Button>}>
        <div className="colmenu">
          {groupedBy || choosing ? (
            <label className="menu__item">
              {board ? "Columns by" : "Grouped by"}{" "}
              <select className="btn btn--sm" value={groupValue ?? ""} onChange={(e) => { onGroupBy(e.target.value || null); setOpen(false); }} aria-label="Group by">
                {!board ? <option value="">nothing</option> : null}
                {groupOptions.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!board && groupedBy ? (
            <button type="button" className="menu__item" onClick={() => { onGroupBy(null); setOpen(false); }}>
              Ungroup
            </button>
          ) : null}
          {count ? <div className="menu__head">{filters}</div> : null}
          {count > 1 ? (
            <label className="menu__item">
              Rows that match{" "}
              <select className="btn btn--sm" value={match} onChange={(e) => onMatch(e.target.value === "any" ? "any" : "all")} aria-label="Rows that match">
                <option value="all">all</option>
                <option value="any">any</option>
              </select>{" "}
              of them
            </label>
          ) : null}
          {count ? (
            <button type="button" className="menu__item" onClick={() => { onClear(); setOpen(false); }}>
              Clear all filters
            </button>
          ) : null}
        </div>
      </Popover>
    </span>
  );
}
