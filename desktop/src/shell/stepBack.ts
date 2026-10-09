/**
 * Escape steps a side panel back one level: wide → normal → folded (the UI rulebook §3 and §16).
 * Which panel is the one with the focus inside it (the sidebar, or the assistant panel); focus in
 * the main area does nothing. It never takes an Escape that belongs to something else: an open
 * dialog, menu, popover or list; a key a field has already used; a text field with something typed
 * in it (Escape may be cancelling that). (9 Oct, the UI rulebook phase 2.)
 */
import { useEffect } from "react";

export interface PanelStep {
  folded: boolean;
  wide: boolean;
  narrow: () => void;
  fold: () => void;
}

/** One step back for a panel: nothing when it is already folded. */
export function stepBack(p: PanelStep) {
  if (p.folded) return;
  if (p.wide) p.narrow();
  else p.fold();
}

const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';

/** The panel an Escape in `target` belongs to, if any. */
export function panelOf(target: EventTarget | null): "rail" | "panel" | null {
  if (!(target instanceof Element)) return null;
  const panel = target.closest('.rail, .assist, [data-panel]');
  if (!panel) return null;
  return panel.matches('.rail, [data-panel="rail"]') ? "rail" : "panel";
}

export function useStepBack(rail: PanelStep, panel: PanelStep) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
      if (document.querySelector(OVERLAY)) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ((t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) && t.value !== ""))) return;
      const which = panelOf(t);
      if (!which) return;
      e.preventDefault();
      stepBack(which === "rail" ? rail : panel);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}
