import type { HTMLAttributes, ReactNode } from "react";

/** A small coloured word: a state, a kind, a count. Tone says what it means, never red for
 *  decoration. */
export function Badge({ tone = "gray", className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: "good" | "warn" | "bad" | "info" | "gray"; children: ReactNode }) {
  return (
    <span className={["pill", `pill--${tone}`, className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </span>
  );
}
