import * as RadixPopover from "@radix-ui/react-popover";
import { type FocusEvent, type InputHTMLAttributes, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { dateOf, formatDate, isoOf, parseDate } from "../modules/parse";
import { IconButton } from "./IconButton";
import { Calendar, ChevronLeft, ChevronRight, ICON_SM } from "./icons";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const sameDay = (a: Date | null, b: Date) => Boolean(a) && a!.getFullYear() === b.getFullYear() && a!.getMonth() === b.getMonth() && a!.getDate() === b.getDate();

/** A month of days, Monday first; arrows move the day, Page Up and Down the month, Enter picks. */
function MonthGrid({ selected, onPick }: { selected: Date | null; onPick: (d: Date) => void }) {
  const [cursor, setCursor] = useState(() => selected ?? new Date());
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // the focused day follows the cursor (and starts on the chosen day)
    grid.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
  }, [cursor]);
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(y, m, i + 1))];
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const shift = (days: number, months = 0) => {
    setCursor(new Date(y, m + months, months ? Math.min(cursor.getDate(), new Date(y, m + months + 1, 0).getDate()) : cursor.getDate() + days));
  };
  const key = (e: KeyboardEvent) => {
    const moves: Record<string, () => void> = { ArrowLeft: () => shift(-1), ArrowRight: () => shift(1), ArrowUp: () => shift(-7), ArrowDown: () => shift(7), PageUp: () => shift(0, -1), PageDown: () => shift(0, 1) };
    if (moves[e.key]) {
      e.preventDefault();
      moves[e.key]();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(cursor);
    }
  };
  const today = new Date();
  return (
    <div className="datefield__cal">
      <div className="datefield__head">
        <IconButton size="sm" label="Previous month" icon={<ChevronLeft size={ICON_SM} />} onClick={() => shift(0, -1)} />
        <span className="datefield__month" aria-live="polite">
          {MONTHS[m]} {y}
        </span>
        <IconButton size="sm" label="Next month" icon={<ChevronRight size={ICON_SM} />} onClick={() => shift(0, 1)} />
      </div>
      <div ref={grid} role="grid" aria-label={`${MONTHS[m]} ${y}`} className="datefield__grid" onKeyDown={key}>
        <div role="row" className="datefield__week">
          {DAYS.map((d) => (
            <span key={d} role="columnheader" className="datefield__dow">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((week, i) => (
          <div role="row" key={i} className="datefield__week">
            {week.map((d, j) =>
              d ? (
                <span role="gridcell" key={j} aria-selected={sameDay(selected, d)}>
                  <button type="button" tabIndex={sameDay(cursor, d) ? 0 : -1} className={`datefield__day${sameDay(selected, d) ? " datefield__day--on" : ""}${sameDay(today, d) ? " datefield__day--today" : ""}`} aria-label={formatDate(isoOf(d, false), false)} onClick={() => onPick(d)}>
                    {d.getDate()}
                  </button>
                </span>
              ) : (
                <span role="gridcell" key={j} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "defaultValue">;

/**
 * A date (or date and time) typed the way a person says it: "13 Oct", "13/10" (day first),
 * "tomorrow", "next friday", "in 3 days", with "14:30" or "2:30pm" after it for a time. Leaving
 * the field, Enter, or picking a day in the calendar tidies the text to "13 Oct 2026" (", 14:30")
 * and reports the value: "2026-10-13", or "2026-10-13T14:30" with `withTime` (local, no zone), or
 * null when emptied (refused with `required`). Text it can't read is kept, with a line beside it
 * saying so, and nothing is reported. Other props (id, aria-label, onKeyDown, className…) go to
 * the input.
 */
export function DateField({ value, onChange, withTime = false, required = false, label, className = "textfield", onBlur, onKeyDown, ...rest }: InputProps & {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
  withTime?: boolean;
  required?: boolean;
  /** The field's name, for the calendar button and, without a visible label, the input. */
  label?: string;
}) {
  const shown = (v: string | null | undefined) => formatDate(v, withTime);
  const [text, setText] = useState(() => shown(value));
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // a value from outside replaces the text, unless the person is typing
    if (document.activeElement !== input.current) {
      setText(shown(value));
      setError(null);
    }
  }, [value, withTime]);
  const emit = (iso: string | null, report = true) => {
    setText(shown(iso));
    setError(null);
    if (report) onChange(iso);
  };
  /** Reads the text: tidies it and reports the value, or says it can't. `report` false only
   *  tidies (focus went from the text to the calendar button, still inside the field). */
  const commit = (report = true) => {
    const t = text.trim();
    if (!t) {
      if (required) setError("A date is needed here. Try 13 Oct 2026.");
      else emit(null, report);
      return;
    }
    const read = parseDate(t, new Date());
    if (!read) {
      setError(`Couldn't read that as a date. Try ${withTime ? "13 Oct 2026, 14:30" : "13 Oct 2026"}.`);
      return;
    }
    emit(withTime ? (read.hasTime ? read.iso : `${read.iso}T00:00`) : read.iso.slice(0, 10), report);
  };
  const leave = (e: FocusEvent<HTMLSpanElement>) => {
    const to = e.relatedTarget as Node | null;
    if (to && (wrap.current?.contains(to) || pop.current?.contains(to))) {
      if (e.target === input.current) commit(false); // still in the field or its calendar
      return;
    }
    commit();
  };
  const pick = (d: Date) => {
    const was = dateOf(value);
    if (withTime && was) d.setHours(was.getHours(), was.getMinutes());
    setOpen(false);
    emit(isoOf(d, withTime));
  };
  const errId = `${useId()}-error`;
  return (
    <span ref={wrap} className={`datefield${error ? " datefield--bad" : ""}`} onBlur={leave}>
      <span className="datefield__box">
        <input
          ref={input}
          type="text"
          className={className}
          aria-label={rest.id ? undefined : label}
          {...rest}
          value={text}
          autoComplete="off"
          aria-invalid={error ? true : rest["aria-invalid"]}
          aria-describedby={[rest["aria-describedby"], error ? errId : undefined].filter(Boolean).join(" ") || undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "ArrowDown" && e.altKey) {
              e.preventDefault();
              setOpen(true);
            }
            onKeyDown?.(e);
          }}
        />
        <RadixPopover.Root open={open} onOpenChange={setOpen}>
          <RadixPopover.Trigger asChild>
            <IconButton size="sm" className="datefield__btn" label={label ? `Calendar for ${label}` : "Calendar"} icon={<Calendar size={ICON_SM} />} />
          </RadixPopover.Trigger>
          <RadixPopover.Portal>
            <RadixPopover.Content ref={pop} className="datefield__pop" align="end" sideOffset={4} aria-label={label ? `Pick ${label}` : "Pick a date"} onKeyDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <MonthGrid selected={dateOf(parseDate(text, new Date())?.iso ?? value)} onPick={pick} />
            </RadixPopover.Content>
          </RadixPopover.Portal>
        </RadixPopover.Root>
      </span>
      {error ? (
        <span id={errId} role="alert" className="datefield__err">
          {error}
        </span>
      ) : null}
    </span>
  );
}
