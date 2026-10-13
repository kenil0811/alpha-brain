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
import { Check, ChevronDown, ColumnMenuIcon } from "../../ui/icons";
import { isNumeric, type FieldInfo } from "../fields";
import { humanize } from "../format";
import { FOOTER_WORDS, footerOpsFor, groupable, needsValue, OP_WORDS, opsFor, TONE_WORDS, type Colours, type FilterOp, type FilterRule, type FooterOp, type Tone } from "./engine";

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
export function ColumnMenu({ field, rows, rule, onRule, extra, grouped, onGroup, colours, onColours }: { field: FieldInfo; rows: RecordRow[]; rule?: FilterRule; onRule: (r: FilterRule | null) => void; extra?: ReactNode; grouped?: boolean; onGroup?: (on: boolean) => void; colours?: Colours; onColours?: (c: Colours) => void }) {
  const name = field.label && field.label !== field.name ? field.label : humanize(field.name);
  const on = Boolean(rule) || Boolean(grouped);
  const kind = field.kind;
  const [open, setOpen] = useState(false);
  const [colouring, setColouring] = useState(false);
  const colourable = Boolean(colours && onColours) && (kind === "choice" || kind === "status" || isNumeric(kind) || kind === "date" || kind === "datetime" || kind === "text" || kind === "url");
  return (
    <span className={`th__menu${on ? " th__menu--on" : ""}`}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setColouring(false); }} label={`${name}: filter`} align="end" trigger={<IconButton size="sm" label={`Filter ${name}`} icon={<ColumnMenuIcon />} />}>
        {colouring && colours && onColours ? (
          <ColourEditor field={field} rows={rows} colours={colours} onColours={onColours} />
        ) : (
        <div className="colmenu">
          {colourable ? (
            <button type="button" className="menu__item" onClick={() => setColouring(true)}>
              Colours…
            </button>
          ) : null}
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
        )}
      </Popover>
    </span>
  );
}

const TONES: Tone[] = ["good", "warn", "bad", "info", "gray"];

function ToneSelect({ value, onChange, label }: { value: Tone | null; onChange: (t: Tone | null) => void; label: string }) {
  return (
    <select className={`btn btn--sm tone-select${value ? ` tone-select--${value}` : ""}`} value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as Tone | null)} aria-label={label}>
      <option value="">No colour</option>
      {TONES.map((t) => (
        <option key={t} value={t}>
          {TONE_WORDS[t]}
        </option>
      ))}
    </select>
  );
}

/** A column's colours (section 4d), in main's five tones: a tone per value of a choice column and
 *  whether its values tint the rows; one condition and its tone for a number, date or text column
 *  (text too since 13 Oct, at Kenil's ask: "contains London", "is empty"). */
function ColourEditor({ field, rows, colours, onColours }: { field: FieldInfo; rows: RecordRow[]; colours: Colours; onColours: (c: Colours) => void }) {
  const kind = field.kind;
  const name = field.label && field.label !== field.name ? field.label : humanize(field.name);
  const clear = () => {
    const { [field.name]: _v, ...values } = colours.values;
    const { [field.name]: _r, ...rules } = colours.rules;
    onColours({ tint: colours.tint === field.name ? null : colours.tint, values, rules });
  };
  if (kind === "choice" || kind === "status") {
    const present = new Set(rows.map((r) => r.values[field.name]).filter((v) => !empty(v)).map(String));
    const all = [...new Set([...(field.choices ?? []), ...present])];
    const mine = colours.values[field.name] ?? {};
    const setTone = (v: string, t: Tone | null) => {
      const next = { ...mine };
      if (t) next[v] = t;
      else delete next[v];
      onColours({ ...colours, values: { ...colours.values, [field.name]: next } });
    };
    return (
      <div className="colmenu colours" role="group" aria-label={`Colours of ${name}`}>
        {all.map((v) => (
          <label key={v} className="menu__item colours__row">
            <span className={`pill pill--${mine[v] ?? "gray"}`}>{humanize(v)}</span>
            <ToneSelect value={mine[v] ?? null} onChange={(t) => setTone(v, t)} label={`Colour of ${humanize(v)}`} />
          </label>
        ))}
        <label className="menu__item">
          <input type="checkbox" checked={colours.tint === field.name} onChange={(e) => onColours({ ...colours, tint: e.target.checked ? field.name : null })} /> Tint rows by this column
        </label>
        <button type="button" className="menu__item" onClick={clear}>
          Clear colours
        </button>
      </div>
    );
  }
  const rule = colours.rules[field.name] ?? { op: opsFor(kind)[0], value: "", tone: "bad" as Tone };
  const ops = opsFor(kind);
  const set = (next: Partial<typeof rule>) => onColours({ ...colours, rules: { ...colours.rules, [field.name]: { ...rule, ...next } } });
  const type = rule.op === "within" || isNumeric(kind) ? "number" : kind === "date" || kind === "datetime" ? "date" : "text";
  return (
    <div className="colmenu colmenu__cond colours" role="group" aria-label={`Colours of ${name}`}>
      <span className="faint">Colour a value when it is</span>
      <select className="btn btn--sm" value={rule.op} onChange={(e) => set({ op: e.target.value as FilterOp, value: "", value2: "" })} aria-label="Condition">
        {ops.map((o) => (
          <option key={o} value={o}>
            {OP_WORDS[o]}
          </option>
        ))}
      </select>
      {needsValue(rule.op) ? (
        <span className="colmenu__values">
          <input className="textfield colmenu__input" type={type} value={rule.value} onChange={(e) => set({ value: e.target.value })} aria-label={rule.op === "between" ? "From" : "Value"} placeholder={rule.op === "within" ? "days" : "value"} />
          {rule.op === "between" ? <input className="textfield colmenu__input" type={type} value={rule.value2 ?? ""} onChange={(e) => set({ value2: e.target.value })} aria-label="To" placeholder="to" /> : null}
        </span>
      ) : null}
      <ToneSelect value={rule.tone} onChange={(t) => set({ tone: t ?? "bad" })} label="Colour" />
      <button type="button" className="menu__item" onClick={clear}>
        Clear colours
      </button>
    </div>
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

/** A column's footer cell (section 4a): its figure with what it is ("Sum 19.5"), a click to choose
 *  another (Sum, Average, Lowest, Highest, Count, Empty, Filled, Unique, Earliest, Latest, None). */
export function FooterCell({ field, op, value, onOp, first }: { field: FieldInfo; op: FooterOp; value: string | null; onOp: (op: FooterOp) => void; first: boolean }) {
  const [open, setOpen] = useState(false);
  const name = field.label && field.label !== field.name ? field.label : humanize(field.name);
  return (
    <Popover open={open} onOpenChange={setOpen} label={`${name}: total`} align="start" trigger={
      <button type="button" className={`footcell${op === "none" ? " footcell--none" : ""}`} aria-label={op === "none" ? `Choose a total for ${name}` : `${name}: ${FOOTER_WORDS[op]} ${value}`}>
        {op === "none" ? (first ? "Total…" : "+") : <><span className="faint">{FOOTER_WORDS[op]}</span> {value}</>}
      </button>
    }>
      <div className="colmenu" role="group" aria-label={`Total for ${name}`}>
        {footerOpsFor(field.kind).map((o) => (
          <button key={o} type="button" className="menu__item" aria-pressed={o === op} onClick={() => { onOp(o); setOpen(false); }}>
            <span className="footcell__tick">{o === op ? <Check size={12} aria-hidden="true" /> : null}</span>
            {FOOTER_WORDS[o]}
          </button>
        ))}
      </div>
    </Popover>
  );
}

/** What can be set on several ticked rows at once (section 4b): not the title, not a link to
 *  another record, not a file. */
export const settable = (f: FieldInfo, titleField: string | undefined) => f.name !== titleField && !["relation", "file", "long_text"].includes(f.kind);

/** Set… on the ticked rows (section 4b): a field, a value that fits it, then one edit per row,
 *  with how far it got; a refusal stops it and says how many were set and why the rest weren't. */
export function SetOnRows({ fields, count, onSet }: { fields: FieldInfo[]; count: number; onSet: (field: FieldInfo, text: string, progress: (done: number) => void) => Promise<{ done: number; problem?: string }> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(fields[0]?.name ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const field = fields.find((f) => f.name === name) ?? fields[0];
  if (!field) return null;
  const rows = count === 1 ? "1 row" : `${count.toLocaleString()} rows`;
  const kind = field.kind;
  const go = async () => {
    setBusy(0);
    setSaid(null);
    const out = await onSet(field, text, (done) => setBusy(done));
    setBusy(null);
    if (out.problem) setSaid(`Set on ${out.done} of ${count}; then: ${out.problem}`);
    else setOpen(false);
  };
  const label = (f: FieldInfo) => (f.label && f.label !== f.name ? f.label : humanize(f.name));
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSaid(null); }} label="Set a field on the ticked rows" align="start" trigger={<Button size="sm">Set…</Button>}>
      <div className="colmenu colmenu__cond">
        <select className="btn btn--sm" value={field.name} onChange={(e) => { setName(e.target.value); setText(""); }} aria-label="Field to set">
          {fields.map((f) => (
            <option key={f.name} value={f.name}>
              {label(f)}
            </option>
          ))}
        </select>
        {kind === "bool" ? (
          <select className="btn btn--sm" value={text || "false"} onChange={(e) => setText(e.target.value)} aria-label="Value">
            <option value="true">Ticked</option>
            <option value="false">Not ticked</option>
          </select>
        ) : (kind === "choice" || kind === "status") && field.choices?.length ? (
          <select className="btn btn--sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Value">
            <option value="">Empty</option>
            {field.choices.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </select>
        ) : (
          <input className="textfield colmenu__input" type={isNumeric(kind) ? "number" : kind === "date" ? "date" : "text"} value={text} onChange={(e) => setText(e.target.value)} aria-label="Value" placeholder="empty clears it" />
        )}
        <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => void go()}>
          {busy !== null ? `Setting ${Math.min(busy + 1, count)} of ${count}…` : text === "" && kind !== "bool" ? `Clear on ${rows}` : `Set on ${rows}`}
        </Button>
        {said ? <p className="notice" role="alert">{said}</p> : null}
      </div>
    </Popover>
  );
}
