/**
 * Pasting a block from a spreadsheet into a table (13 Oct, Q42 section 4c; the feature from pull
 * request #5): the block fills from the cell it is pasted on, across the shown columns and down
 * the rows in the table's order; lines past the last row become new rows. Every value is read
 * for its column (`readValue`): numbers with their commas, currency and percent signs, dates
 * written the common ways, ticks, a choice by its name. What doesn't fit, a date that could be
 * read two ways, and a column that isn't pasted into are left out and named, never stored wrong
 * or guessed. Pure functions; `DataPage` asks before a block is written, one write per row.
 */
import type { RecordRow } from "../../core/client";
import { isNumeric, type FieldInfo } from "../fields";
import { humanize } from "../format";

/** The cells of a pasted block: tab between cells, a line per row, a cell in quotes may hold
 *  tabs, line breaks and doubled quotes (how Excel, Numbers and Sheets copy). */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const day = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);

export type Read = { ok: true; value: unknown } | { ok: false; why: string };

/** A pasted value read for its column. An empty cell clears the value. */
export function readValue(text: string, field: FieldInfo): Read {
  const t = text.trim();
  if (t === "") return { ok: true, value: null };
  const kind = field.kind;
  if (isNumeric(kind)) {
    const clean = t.replace(/[\s,$€£¥%]/g, "");
    const n = Number(clean);
    return clean !== "" && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, why: "isn't a number" };
  }
  if (kind === "date" || kind === "datetime") {
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    if (m) {
      const v = day(+m[1], +m[2], +m[3]);
      return v ? { ok: true, value: v } : { ok: false, why: "isn't a date" };
    }
    m = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/.exec(t); // 13 Oct 2026
    if (m && MONTHS.includes(m[2].slice(0, 3).toLowerCase())) {
      const v = day(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
      return v ? { ok: true, value: v } : { ok: false, why: "isn't a date" };
    }
    m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t); // Oct 13, 2026
    if (m && MONTHS.includes(m[1].slice(0, 3).toLowerCase())) {
      const v = day(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
      return v ? { ok: true, value: v } : { ok: false, why: "isn't a date" };
    }
    m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(t); // 13/10/2026 or 10/13/2026
    if (m) {
      const a = +m[1];
      const b = +m[2];
      if (a > 12 && b <= 12) return day(+m[3], b, a) ? { ok: true, value: day(+m[3], b, a) } : { ok: false, why: "isn't a date" };
      if (b > 12 && a <= 12) return day(+m[3], a, b) ? { ok: true, value: day(+m[3], a, b) } : { ok: false, why: "isn't a date" };
      if (a === b) return { ok: true, value: day(+m[3], a, a) };
      return { ok: false, why: "could be read two ways (day or month first)" };
    }
    return { ok: false, why: "isn't a date" };
  }
  if (kind === "bool") {
    const w = t.toLowerCase();
    if (["true", "yes", "y", "1", "ticked", "✓", "x"].includes(w)) return { ok: true, value: true };
    if (["false", "no", "n", "0", "not ticked"].includes(w)) return { ok: true, value: false };
    return { ok: false, why: "isn't ticked or not ticked" };
  }
  if (kind === "choice" || kind === "status") {
    const found = (field.choices ?? []).find((c) => c.toLowerCase() === t.toLowerCase() || humanize(c).toLowerCase() === t.toLowerCase());
    return found ? { ok: true, value: found } : { ok: false, why: `isn't one of ${humanize(field.name).toLowerCase()}'s choices` };
  }
  if (kind === "multichoice") {
    const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
    const found = parts.map((p) => (field.choices ?? []).find((c) => c.toLowerCase() === p.toLowerCase()));
    return found.every(Boolean) ? { ok: true, value: found } : { ok: false, why: `isn't among ${humanize(field.name).toLowerCase()}'s choices` };
  }
  return { ok: true, value: t };
}

/** The columns a paste may write: not the title, a link to a record, a file or a long text. */
export const pasteable = (f: FieldInfo, titleField: string | undefined) => f.name !== titleField && !["relation", "file", "long_text"].includes(f.kind);

export interface PastePlan {
  /** Existing rows and the values a paste gives them (only what changes). */
  updates: { row: RecordRow; values: Record<string, unknown> }[];
  /** New rows for the lines past the last row. */
  adds: Record<string, unknown>[];
  /** Values that will replace something already there. */
  replaced: number;
  /** The columns written. */
  columns: string[];
  /** What is left out, in words: a value that doesn't fit, a column not pasted into. */
  skipped: string[];
  /** The block's size. */
  lines: number;
  width: number;
}

/** What a block pasted at a row and column would do, before anything is written. */
export function planPaste(grid: string[][], rows: RecordRow[], startRow: number, columns: string[], startCol: number, byName: Map<string, FieldInfo>, titleField: string | undefined): PastePlan {
  const width = Math.max(0, ...grid.map((r) => r.length));
  const skipped: string[] = [];
  const target = Array.from({ length: width }, (_, i) => columns[startCol + i]);
  const usable = target.map((c) => (c && byName.get(c) && pasteable(byName.get(c)!, titleField) ? c : null));
  target.forEach((c, i) => {
    if (!c) skipped.push(`column ${i + 1} of the block: past the table's last column`);
    else if (!usable[i]) skipped.push(`${humanize(c)}: not pasted into (a title, link, file or long text is edited on its own)`);
  });
  const updates: PastePlan["updates"] = [];
  const adds: PastePlan["adds"] = [];
  let replaced = 0;
  grid.forEach((line, li) => {
    const values: Record<string, unknown> = {};
    const row = rows[startRow + li];
    line.forEach((text, ci) => {
      const col = usable[ci];
      if (!col) return;
      const read = readValue(text, byName.get(col)!);
      if (!read.ok) {
        if (text.trim()) skipped.push(`"${text.trim().slice(0, 40)}" in ${humanize(col)}: ${read.why}`);
        return;
      }
      if (row && JSON.stringify(row.values[col] ?? null) === JSON.stringify(read.value ?? null)) return;
      if (row && row.values[col] !== null && row.values[col] !== undefined && row.values[col] !== "") replaced += 1;
      values[col] = read.value;
    });
    if (!Object.keys(values).length) return;
    if (row) updates.push({ row, values });
    else adds.push(values);
  });
  return { updates, adds, replaced, columns: usable.filter((c): c is string => Boolean(c)), skipped, lines: grid.length, width };
}
