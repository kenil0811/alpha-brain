import type { ReactNode } from "react";
import { Button } from "./Button";

/** Inline feedback, never a toast (the UI rulebook §14): `ok` is a small line of accent text
 *  beside the action, `bad` a small red line, `banner` a pale red banner for a bigger problem.
 *  An error offers Try again where it applies. */
export function Notice({ tone = "ok", banner, onRetry, retryLabel = "Try again", className, children }: { tone?: "ok" | "bad"; banner?: boolean; onRetry?: () => void; retryLabel?: string; className?: string; children: ReactNode }) {
  const bad = banner || tone === "bad";
  const classes = ["notice", bad ? "" : "notice--ok", banner ? "notice--banner" : "", onRetry ? "notice--retry" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <p className={classes} role={bad ? "alert" : "status"}>
      <span>{children}</span>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </p>
  );
}
