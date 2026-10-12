/**
 * Generous in, precise out: what a person types into a date or a number field, read the way
 * they meant it, or null when it can't be read (the field then keeps their text and says so;
 * nothing is ever silently emptied or truncated). Numeric dates are day first ("13/10").
 */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** "oct", "october", "sept" → 0-based month; at least three letters of the name. */
function monthOf(word: string): number | null {
  if (word.length < 3) return null;
  const i = MONTHS.findIndex((m) => m.startsWith(word));
  return i < 0 ? null : i;
}

function weekdayOf(word: string): number | null {
  if (word.length < 3) return null;
  const i = WEEKDAYS.findIndex((w) => w.startsWith(word));
  return i < 0 ? null : i;
}

/** A real day or null (31 Feb is not). */
function day(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m, d);
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d ? date : null;
}

const yearOf = (text: string | undefined, now: Date) => (text === undefined ? now.getFullYear() : text.length === 2 ? 2000 + Number(text) : Number(text));

/** The date part, without a time. */
function readDay(text: string, now: Date): Date | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (text === "" || text === "today" || text === "now") return today;
  if (text === "tomorrow" || text === "tmrw") return addDays(today, 1);
  if (text === "yesterday") return addDays(today, -1);
  let m = text.match(/^in (\d+) (day|week)s?$/);
  if (m) return addDays(today, Number(m[1]) * (m[2] === "week" ? 7 : 1));
  m = text.match(/^(\d+) (day|week)s? ago$/);
  if (m) return addDays(today, -Number(m[1]) * (m[2] === "week" ? 7 : 1));
  if (text === "next week") return addDays(today, 7);
  // "friday" is the coming one (today if it is Friday); "next friday" the first after today;
  // "last friday" the last before today.
  m = text.match(/^(?:(next|last|this) )?([a-z]+)$/);
  if (m) {
    const w = weekdayOf(m[2]);
    if (w !== null) {
      const ahead = (w - today.getDay() + 7) % 7;
      if (m[1] === "next") return addDays(today, ahead || 7);
      if (m[1] === "last") return addDays(today, -((today.getDay() - w + 7) % 7 || 7));
      return addDays(today, ahead);
    }
  }
  // A weekday in front of a full date says nothing more: "Tue 13 Oct".
  m = text.match(/^([a-z]+) (.*\d.*)$/);
  if (m && weekdayOf(m[1]) !== null) return readDay(m[2], now);
  m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return day(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}|\d{2}))?$/);
  if (m) return day(yearOf(m[3], now), Number(m[2]) - 1, Number(m[1]));
  m = text.match(/^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)(?: (\d{4}))?$/);
  if (m) {
    const month = monthOf(m[2]);
    return month === null ? null : day(yearOf(m[3], now), month, Number(m[1]));
  }
  m = text.match(/^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/);
  if (m) {
    const month = monthOf(m[1]);
    return month === null ? null : day(yearOf(m[3], now), month, Number(m[2]));
  }
  return null;
}

/**
 * Typed text to a day ("2026-10-13") or a day and time ("2026-10-13T14:30", local, no zone).
 * Reads "13 Oct", "Oct 13 2026", "13/10", "13/10/26", "2026-10-13", "today", "tomorrow",
 * "next friday", "in 3 days", "friday", each optionally followed by "14:30", "2:30pm" or "2pm";
 * a time alone is today at that time.
 */
export function parseDate(text: string, now: Date): { iso: string; hasTime: boolean } | null {
  let t = text.trim().toLowerCase().replace(/(\d)t(\d)/, "$1 $2").replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  let time: string | null = null;
  const clock = t.match(/(?:^|\s)(?:at\s)?(\d{1,2})(?::(\d{2}))?(?::\d{2}(?:\.\d+)?)?\s?(am|pm|a\.m\.|p\.m\.)?$/);
  if (clock && (clock[2] !== undefined || clock[3])) {
    let h = Number(clock[1]);
    const mi = Number(clock[2] ?? 0);
    const half = clock[3]?.[0];
    if (half) {
      if (h < 1 || h > 12) return null;
      h = (h % 12) + (half === "p" ? 12 : 0);
    }
    if (h > 23 || mi > 59) return null;
    time = `${pad(h)}:${pad(mi)}`;
    t = t.slice(0, clock.index).trim();
  }
  const d = readDay(t, now);
  if (!d) return null;
  return time ? { iso: `${isoDay(d)}T${time}`, hasTime: true } : { iso: isoDay(d), hasTime: false };
}

/** The house format: "13 Oct 2026", or "13 Oct 2026, 14:30" with the time. Takes a day
 *  ("2026-10-13"), a local date-time, or a full ISO stamp; returns "" for nothing and the text
 *  itself when it is not a date. */
export function formatDate(iso: string | null | undefined, hasTime: boolean): string {
  if (!iso) return "";
  const plain = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const text = `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  return hasTime ? `${text}, ${pad(date.getHours())}:${pad(date.getMinutes())}` : text;
}

/** A stored value as the local day or local date-time the date fields emit. */
export function isoOf(date: Date, withTime: boolean): string {
  return withTime ? `${isoDay(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}` : isoDay(date);
}

/** A stored date value back to a Date (a plain day is local midnight, not UTC). */
export function dateOf(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const plain = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = plain ? new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])) : new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

const SCALE: Record<string, string> = { k: "e3", m: "e6", mn: "e6", b: "e9", bn: "e9" };

/**
 * Typed text to a number: "1,240", "1 240", "$1,200", "1.2k", "5k", "2.5m", "-3", "(3)" → -3.
 * "15%" reads as 15 (the percent sign is dropped, the number kept as written). A trailing word is
 * allowed only when it is the field's own `unit` ("320 kcal" in a kcal field); any other word
 * makes the text unreadable. Grouping must be in threes, so "1,5" is not quietly 15.
 */
export function parseNumber(text: string, unit?: string | null): number | null {
  let t = text.trim().replace(/[   ]/g, " ").replace(/−/g, "-");
  if (!t) return null;
  let sign = 1;
  const paren = t.match(/^\((.*)\)$/);
  if (paren) {
    sign = -1;
    t = paren[1].trim();
  }
  if (unit) {
    const u = unit.trim().toLowerCase();
    if (u && t.toLowerCase().endsWith(u) && !/[a-z]/i.test(t.charAt(t.length - u.length - 1))) t = t.slice(0, t.length - u.length).trim();
  }
  t = t.replace(/%$/, "").trim();
  if (/^[-+]/.test(t)) {
    if (t[0] === "-") sign = -sign;
    t = t.slice(1).trim();
  }
  t = t.replace(/^[$£€¥]\s?/, "");
  if (t[0] === "-" && sign === 1) {
    sign = -1; // "$-3"
    t = t.slice(1);
  }
  let exp = "";
  const scaled = t.match(/^(.*\d)\s?(k|mn|m|bn|b)$/i);
  if (scaled) {
    exp = SCALE[scaled[2].toLowerCase()];
    t = scaled[1];
  }
  if (!/^(\d+|\d{1,3}(,\d{3})+|\d{1,3}( \d{3})+)(\.\d+)?$|^\.\d+$/.test(t)) return null;
  const n = Number(t.replace(/[, ]/g, "") + exp) * sign;
  return Number.isFinite(n) ? n + 0 : null; // + 0 turns -0 into 0
}

/** A number tidied for its field: grouped digits, "1,240", "-3", "1,240.5". */
export function formatNumberText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-GB", { maximumFractionDigits: 20 });
}
