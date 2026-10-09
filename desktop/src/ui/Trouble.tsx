import type { ReactNode } from "react";
import { Notice } from "./Notice";

/** Something that didn't work, said where it happened, with the way to try again. A page never
 * shows "Loading…" for ever or an empty list in place of a failure. A `Notice` of the red kind. */
export function Trouble({ children, onRetry, retryLabel = "Try again" }: { children: ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return (
    <Notice tone="bad" className="trouble" onRetry={onRetry} retryLabel={retryLabel}>
      {children}
    </Notice>
  );
}
