/**
 * One place that knows what a field kind looks like and how typed text becomes a value, for
 * every derived page, table cell and form in the shell.
 */
import { isPlace } from "../core/client";
import { formatDay, formatNumber, humanize, when } from "./format";
import { parseDate, parseNumber } from "./parse";

export interface FieldInfo {
  name: string;
  kind: string;
  label?: string;
  unit?: string;
  required?: boolean;
  choices?: string[] | null;
  done_choices?: string[] | null;
  relation?: string;
}

export const NUMERIC_KINDS = new Set(["number"]);
export const TEXT_KINDS = new Set(["text", "long_text", "url"]);
export const CHOICE_KINDS = new Set(["choice", "status", "multichoice"]);
export const DATE_KINDS = new Set(["date", "datetime"]);

export function isNumeric(kind: string): boolean {
  return NUMERIC_KINDS.has(kind);
}

/** The value as words for a cell: numbers with units, days short, choices as pills. */
export function showValue(value: unknown, kind: string, unit?: string | null): string {
  if (value === null || value === undefined || value === "") return "";
  if (isPlace(value)) return value.label; // a place reads as its words, wherever it shows
  if (isNumeric(kind)) return typeof value === "number" ? formatNumber(value, unit) : String(value);
  if (kind === "date") return formatDay(String(value));
  if (kind === "datetime") return when(String(value));
  if (kind === "bool") return value ? "Yes" : "No";
  if (kind === "multichoice") return Array.isArray(value) ? value.map((v) => humanize(String(v))).join(", ") : String(value);
  if (kind === "choice" || kind === "status") return humanize(String(value));
  if (kind === "url") return String(value).replace(/^https?:\/\//, "").slice(0, 48);
  return String(value);
}

/** Typed text back into a stored value, read generously ("1.2k", "13/10", "next friday").
 *  Empty text clears the field; text that can't be read is passed on as typed, for the core to
 *  refuse with its reason. */
export function coerce(text: string, kind: string, unit?: string | null): unknown {
  if (isNumeric(kind)) {
    if (text.trim() === "") return null;
    return parseNumber(text, unit) ?? text;
  }
  if (DATE_KINDS.has(kind)) {
    if (text.trim() === "") return null;
    const read = parseDate(text, new Date());
    if (!read) return text;
    return kind === "date" ? read.iso.slice(0, 10) : read.hasTime ? read.iso : `${read.iso}T00:00`;
  }
  if (kind === "bool") return text === "true";
  if (kind === "multichoice") {
    const parts = text
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.length ? parts : null;
  }
  return text === "" ? null : text;
}

/** The native input type for a kind that has no kit field of its own. Numbers and dates are
 *  typed as text and read by `NumberField` and `DateField` (native number and date inputs
 *  silently drop "1.2k" or "13/10"). */
export function inputType(kind: string): string {
  if (kind === "url") return "url";
  return "text";
}

/** The text a cell editor starts with. */
export function editText(value: unknown, kind: string): string {
  if (value === null || value === undefined) return "";
  if (isPlace(value)) return value.label;
  if (kind === "multichoice" && Array.isArray(value)) return value.join(", ");
  if (kind === "bool") return value ? "true" : "false";
  return String(value);
}

/** The field that names a record: declared, else the first text field, else the first field. */
export function titleFieldOf(fields: FieldInfo[], declared?: string | null): string | undefined {
  if (declared && fields.some((f) => f.name === declared)) return declared;
  return (fields.find((f) => f.kind === "text") ?? fields[0])?.name;
}

export function firstOfKind(fields: FieldInfo[], kinds: Set<string>): FieldInfo | undefined {
  return fields.find((f) => kinds.has(f.kind));
}

/** A status field's open choices: everything that does not mean finished. */
export function openChoices(field: FieldInfo): string[] {
  const done = new Set(field.done_choices ?? []);
  return (field.choices ?? []).filter((c) => !done.has(c));
}
