import type { HTMLAttributes, ReactNode } from "react";

/** The five tones of a status chip (the UI rulebook §1): green, yellow, red, blue, grey. Every
 *  module's states map onto these; nothing else is a chip colour. */
export type Tone = "good" | "warn" | "bad" | "info" | "gray";

/** A small coloured word: a state, a kind, a count. Tone says what it means, never red for
 *  decoration. This is the only chip: `.pill--*` is its CSS, there is no second set (9 Oct, the
 *  UI rulebook §14, "one chip"). */
export function Badge({ tone = "gray", className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; children: ReactNode }) {
  return (
    <span className={["pill", `pill--${tone}`, className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </span>
  );
}
