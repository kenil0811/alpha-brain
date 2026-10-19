/**
 * A tree (P1, 18 Oct 2026): rows folded by a field, nested when its words are a path ("DealPilot ›
 * Deals › Midwest HVAC", a task's place), and under each, rows nested under the row they are part
 * of (a relation to the same table). Any table can be shown so; the tasks' "By place" opens on it.
 */
import { useMemo, useState } from "react";
import type { RecordRow } from "../../core/client";
import { ChevronDown, ChevronRight } from "../../ui/icons";
import { showValue, type FieldInfo } from "../fields";
import { humanize } from "../format";

interface Place {
  key: string;
  words: string;
  places: Place[];
  rows: RecordRow[];
  /** The place's own address, when the field's values are window addresses (a task's place). */
  address?: string;
}

/** The address of the `depth`th step of a window address ("#/m/<id>/<table>/<record>/<field>",
 *  "#/m/<id>/~page/<name>", "#/records/<table>/<record>/<field>"), or none. */
export function addressAt(address: string, depth: number): string | undefined {
  if (!address.startsWith("#/")) return undefined;
  const parts = address.slice(2).split("/");
  if (parts[0] === "m" && parts[2] === "~page") return depth === 0 ? `#/m/${parts[1]}` : depth === 1 ? address : undefined;
  if (parts[0] === "m") return parts.length > depth + 1 ? `#/${parts.slice(0, depth + 2).join("/")}` : undefined;
  if (parts[0] === "records") return depth >= 1 && parts.length > depth + 1 ? `#/${parts.slice(0, depth + 2).join("/")}` : undefined;
  return undefined;
}

const NOWHERE = "No place yet";

/** The value's words for the tree: what the row says it is (`words`), else the value itself. */
function wordsOf(row: RecordRow, field: FieldInfo | undefined): string {
  if (!field) return "";
  const said = row.words?.[field.name];
  if (typeof said === "string" && said) return said;
  return showValue(row.values[field.name], field.kind);
}

/** The places, widest first, each holding the rows that live there and the places inside it. */
export function placesOf(rows: RecordRow[], field: FieldInfo | undefined): Place[] {
  const root: Place = { key: "", words: "", places: [], rows: [] };
  for (const row of rows) {
    const words = wordsOf(row, field) || NOWHERE;
    let here = root;
    let key = "";
    const raw = field ? String(row.values[field.name] ?? "") : "";
    words.split(" › ").forEach((step, depth) => {
      key = key ? `${key} › ${step}` : step;
      let next = here.places.find((p) => p.key === key);
      if (!next) {
        next = { key, words: step, places: [], rows: [], address: addressAt(raw, depth) };
        here.places.push(next);
      }
      here = next;
    });
    here.rows.push(row);
  }
  const nowhereLast = (ps: Place[]) => ps.sort((a, b) => (a.words === NOWHERE ? 1 : b.words === NOWHERE ? -1 : 0));
  return nowhereLast(root.places);
}

/** The rows a place holds, inside it and under them. */
function count(p: Place, under: (id: string) => number = () => 0): number {
  return p.rows.reduce((n, r) => n + 1 + under(r.id), 0) + p.places.reduce((n, q) => n + count(q, under), 0);
}

export function TreeView({ table, rows, fields, titleField, groupField, onOpen, onOpenAddress }: { table: string; rows: RecordRow[]; fields: FieldInfo[]; titleField: string | undefined; groupField: FieldInfo | undefined; onOpen: (id: string) => void; /** Opens a place the rows live at (its address). */ onOpenAddress?: (address: string) => void }) {
  const [folded, setFolded] = useState<Set<string>>(new Set());
  // the row a row is part of: a relation to its own table holding one row
  const parentField = useMemo(() => fields.find((f) => f.kind === "relation" && !f.many && f.relation === table), [fields, table]);
  const status = useMemo(() => fields.find((f) => f.kind === "status"), [fields]);
  const due = useMemo(() => fields.find((f) => f.kind === "date"), [fields]);
  const ids = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  // a row sits under the row it is part of when that one is shown too; only the rest are placed,
  // so no place stands empty because its rows went under a parent elsewhere
  const roots = useMemo(() => rows.filter((r) => !parentField || !ids.has(String(r.values[parentField.name] ?? ""))), [rows, parentField, ids]);
  const places = useMemo(() => placesOf(roots, groupField), [roots, groupField]);
  if (!rows.length) return <p className="empty">Nothing here yet.</p>;
  const childrenOf = (id: string) => (parentField ? rows.filter((r) => String(r.values[parentField.name] ?? "") === id) : []);
  const descendants = (id: string): number => childrenOf(id).reduce((n, k) => n + 1 + descendants(k.id), 0);
  const toggle = (key: string) => setFolded((f) => { const next = new Set(f); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  function line(row: RecordRow, depth: number, under?: RecordRow) {
    const kids = childrenOf(row.id);
    // under its parent, a row living somewhere else than its parent says where (a field of it)
    const own = wordsOf(row, groupField);
    const theirs = under ? wordsOf(under, groupField) : own;
    const elsewhere = groupField && under && own && own !== theirs ? (own.startsWith(`${theirs} › `) ? own.slice(theirs.length + 3) : own) : null;
    const key = `row:${row.id}`;
    const open = !folded.has(key);
    const state = status ? row.values[status.name] : null;
    const done = Boolean(status && state && (status.done_choices ?? []).includes(String(state)));
    return (
      <li key={row.id}>
        <div className="tree__row" style={{ paddingLeft: 8 + depth * 18 }}>
          {kids.length ? (
            <button type="button" className="tree__fold" aria-label={open ? "Fold" : "Unfold"} aria-expanded={open} onClick={() => toggle(key)}>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="tree__fold" aria-hidden="true" />
          )}
          <button type="button" className={`tree__title${done ? " faint" : ""}`} onClick={() => onOpen(row.id)}>
            {titleField ? String(row.values[titleField] ?? "Untitled") : row.id}
          </button>
          {elsewhere ? <span className="faint">on {elsewhere}</span> : null}
          {state ? <span className={`pill pill--${done ? "good" : "gray"}`}>{humanize(String(state))}</span> : null}
          {due && row.values[due.name] ? <span className="faint num">{showValue(row.values[due.name], due.kind)}</span> : null}
        </div>
        {kids.length && open ? <ul className="tree__list">{kids.map((k) => line(k, depth + 1, row))}</ul> : null}
      </li>
    );
  }

  function place(p: Place, depth: number) {
    const key = `place:${p.key}`;
    const open = !folded.has(key);
    return (
      <li key={p.key}>
        <div className="tree__place" style={{ paddingLeft: 8 + depth * 18 }}>
          <button type="button" className="tree__fold" aria-label={open ? `Fold ${p.words}` : `Unfold ${p.words}`} aria-expanded={open} onClick={() => toggle(key)}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {p.address && onOpenAddress ? (
            <button type="button" className="tree__title tree__placename" onClick={() => onOpenAddress(p.address!)} title={`Open ${p.words}`}>
              {p.words}
            </button>
          ) : (
            <b>{p.words}</b>
          )}
          <span className="faint num">{count(p, descendants)}</span>
        </div>
        {open ? (
          <ul className="tree__list">
            {p.places.map((q) => place(q, depth + 1))}
            {p.rows.map((r) => line(r, depth + 1))}
          </ul>
        ) : null}
      </li>
    );
  }

  return <ul className="tree" aria-label="Tree">{groupField ? places.map((p) => place(p, 0)) : roots.map((r) => line(r, 0))}</ul>;
}
