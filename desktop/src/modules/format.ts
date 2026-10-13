/** Words for names, numbers, days and times, the same everywhere in the window. */
export function humanize(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatNumber(value: number, unit?: string | null): string {
  const text = Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return unit ? `${text} ${unit}` : text;
}

/* Dates and times (13 Oct, Q42 section 9b): always absolute, never "Yesterday" or a time without
   its day, and written here, not by the browser engine, so the Mac app (WebKit) and a browser
   (Chromium) say the same. The clock follows the Mac's 12- or 24-hour setting. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Whether this Mac shows the time on a 12-hour clock. */
export function twelveHour(): boolean {
  try {
    return Boolean(new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12);
  } catch {
    return false;
  }
}

/** "14:30", or "2:30 pm" on a 12-hour clock. */
export function timeText(date: Date, twelve = twelveHour()): string {
  const m = String(date.getMinutes()).padStart(2, "0");
  if (!twelve) return `${String(date.getHours()).padStart(2, "0")}:${m}`;
  const h = date.getHours() % 12 || 12;
  return `${h}:${m} ${date.getHours() < 12 ? "am" : "pm"}`;
}

/** "13 Oct" this year, "28 Sep 2025" in another. */
export function dayText(date: Date, now = new Date()): string {
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

/** A stored day ("2026-10-13") the same way: "13 Oct". */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return dayText(new Date(y, m - 1, d));
}

/** A moment: "13 Oct, 14:30" (or "13 Oct, 2:30 pm"), with the year when it is another year. */
export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${dayText(date)}, ${timeText(date)}`;
}

/** A heading for a day: "Monday 13 October", with the year when it is another year. */
export function dayLabel(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return String(iso);
  const text = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${LONG_MONTHS[date.getMonth()]}`;
  return date.getFullYear() === new Date().getFullYear() ? text : `${text} ${date.getFullYear()}`;
}

/** A month: "October 2026". */
export function monthText(year: number, monthIndex: number): string {
  return `${LONG_MONTHS[monthIndex]} ${year}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
