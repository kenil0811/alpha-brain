import type { ReactNode } from "react";
import { Button } from "./Button";

/** Something that didn't work, said where it happened, with the way to try again. A page never
 * shows "Loading…" for ever or an empty list in place of a failure. */
export function Trouble({ children, onRetry, retryLabel = "Try again" }: { children: ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return (
    <p className="notice trouble" role="alert">
      <span>{children}</span>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </p>
  );
}
