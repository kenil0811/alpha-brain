/**
 * What the window shows for a control whose core or host side isn't built yet: the control is
 * there and looks normal, and using it says so instead of doing nothing. Each one is listed in
 * docs/development/backend-requests.md.
 */
import { useCallback } from "react";
import { Badge } from "./Badge";
import { useOptionalToast } from "./toast";

/** `soon("Undo")` toasts "Undo is coming soon." */
export function useComingSoon(): (what: string) => void {
  const toast = useOptionalToast();
  return useCallback((what: string) => toast?.show(`${what} is coming soon.`), [toast]);
}

/** A row's marker that it isn't wired yet. */
export function SoonBadge() {
  return <Badge variant="neutral">Coming soon</Badge>;
}
