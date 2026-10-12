import { type InputHTMLAttributes, useEffect, useId, useRef, useState } from "react";
import { formatNumberText, parseNumber } from "../modules/parse";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "defaultValue">;

/**
 * A number typed the way a person writes it: "1,240", "1 240", "$1,200", "1.2k", "2.5m", "-3",
 * "(3)" for -3, "15%" for 15 (the percent sign is dropped; the field holds 15, not 0.15), and the
 * field's own `unit` after it ("320 kcal"). Leaving the field or Enter tidies the text to grouped
 * digits ("1,240") and reports the number, or null when emptied (refused with `required`). Text
 * it can't read (another word, "1,5") is kept, with a line beside it saying so, and nothing is
 * reported. Right-aligned, tabular figures. Other props (id, aria-label, onKeyDown…) go to the
 * input.
 */
export function NumberField({ value, onChange, unit, required = false, label, className = "textfield", onBlur, onKeyDown, ...rest }: InputProps & {
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  /** The field's unit, which may follow the number ("kcal", "USD"). */
  unit?: string | null;
  required?: boolean;
  /** The field's name, for the input when it has no visible label. */
  label?: string;
}) {
  const [text, setText] = useState(() => formatNumberText(value));
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== input.current) {
      setText(formatNumberText(value));
      setError(null);
    }
  }, [value]);
  const commit = () => {
    if (!text.trim()) {
      if (required) return setError("A number is needed here.");
      setError(null);
      return onChange(null);
    }
    const n = parseNumber(text, unit);
    if (n === null) return setError("Couldn't read that as a number.");
    setText(formatNumberText(n));
    setError(null);
    onChange(n);
  };
  const errId = `${useId()}-error`;
  return (
    <span className={`numfield${error ? " numfield--bad" : ""}`}>
      <input
        ref={input}
        type="text"
        inputMode="decimal"
        className={`${className} numfield__input`}
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
        onBlur={(e) => {
          commit();
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          onKeyDown?.(e);
        }}
      />
      {error ? (
        <span id={errId} role="alert" className="numfield__err">
          {error}
        </span>
      ) : null}
    </span>
  );
}
