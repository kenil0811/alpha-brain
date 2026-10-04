/**
 * Keyboard shortcuts the person can change (Settings → Shortcuts; pull request #3's). A shortcut
 * is a key plus the modifiers that must be held; ⌘ also matches Ctrl, and other held modifiers
 * are ignored except Shift, so ⌘↩ still sends while ⇧↩ adds a line. `where` says where one
 * works: two clash when they share a combination and a place, and "window" ones work
 * everywhere. `host` ones belong to the Mac menu (the Tauri host), so the window can't change
 * them yet.
 */

export interface Combo {
  key: string;
  mod?: boolean;
  alt?: boolean;
  shift?: boolean;
}

/** Only the fields a DOM or React keyboard event both have. */
type KeyEvent = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

export type ShortcutId = "send" | "cell-save" | "cell-cancel" | "command-menu" | "close" | "quit";

export const SHORTCUTS: { id: ShortcutId; what: string; where: "composer" | "cell" | "window"; combo: Combo; host?: boolean }[] = [
  { id: "send", what: "Send a request to Zazoo", where: "composer", combo: { key: "Enter" } },
  { id: "cell-save", what: "Save a cell you are editing", where: "cell", combo: { key: "Enter" } },
  { id: "cell-cancel", what: "Cancel a cell you are editing", where: "cell", combo: { key: "Escape" } },
  { id: "command-menu", what: "Search everything, or ask Zazoo", where: "window", combo: { key: "k", mod: true } },
  { id: "close", what: "Close the window; Alpha keeps running", where: "window", combo: { key: "w", mod: true }, host: true },
  { id: "quit", what: "Quit Alpha and stop everything", where: "window", combo: { key: "q", mod: true }, host: true },
];

// ponytail: kept in this window's storage, so per Mac; a preference in the world if they should follow the person.
const KEY = "alpha.shortcuts";
const MODIFIERS = new Set(["Meta", "Control", "Alt", "Shift", "CapsLock", "Fn"]);
const NAMES: Record<string, string> = { Enter: "↩", Escape: "Esc", Backspace: "⌫", Delete: "⌦", Tab: "⇥", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", " ": "Space" };

/** The key itself, by position for letters and digits so ⌥K reads as K, not ˚. */
function keyOf(e: KeyEvent): string {
  if (e.code?.startsWith("Key")) return e.code.slice(3).toLowerCase();
  if (e.code?.startsWith("Digit")) return e.code.slice(5);
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

export function comboLabel(c: Combo): string {
  return `${c.alt ? "⌥" : ""}${c.shift ? "⇧" : ""}${c.mod ? "⌘" : ""}${NAMES[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key)}`;
}

export function sameCombo(a: Combo, b: Combo): boolean {
  return a.key === b.key && !a.mod === !b.mod && !a.alt === !b.alt && !a.shift === !b.shift;
}

export function matches(e: KeyEvent, c: Combo): boolean {
  return keyOf(e) === c.key && (!c.mod || e.metaKey || e.ctrlKey) && (!c.alt || e.altKey) && e.shiftKey === Boolean(c.shift);
}

/** The combination a key press records, or null for a bare modifier (keep waiting). */
export function recorded(e: KeyEvent): Combo | null {
  if (MODIFIERS.has(e.key)) return null;
  return { key: keyOf(e), mod: e.metaKey || e.ctrlKey, alt: e.altKey, shift: e.shiftKey };
}

function stored(): Partial<Record<ShortcutId, Combo>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<ShortcutId, Combo>>;
  } catch {
    return {};
  }
}

/** Read at the moment a key is pressed, so a change applies at once. */
export function bindingOf(id: ShortcutId): Combo {
  return stored()[id] ?? SHORTCUTS.find((s) => s.id === id)!.combo;
}

/** Whether a key press is `id`'s shortcut as the person set it. */
export function pressed(e: KeyEvent, id: ShortcutId): boolean {
  return matches(e, bindingOf(id));
}

/** `null` goes back to the default. */
export function saveBinding(id: ShortcutId, combo: Combo | null): void {
  const all = stored();
  if (combo) all[id] = combo;
  else delete all[id];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* lasts until the window closes */
  }
}

/** Why `combo` can't be `id`'s shortcut, in words the row can show; null when it can. */
export function problemWith(id: ShortcutId, combo: Combo): string | null {
  // A plain character would fire while typing.
  if (!combo.mod && !combo.alt && combo.key.length === 1) return "Add ⌘ or ⌥, or typing would trigger it.";
  const own = SHORTCUTS.find((s) => s.id === id)!;
  const clash = SHORTCUTS.find((s) => s.id !== id && (s.where === own.where || s.where === "window" || own.where === "window") && sameCombo(bindingOf(s.id), combo));
  return clash ? `${comboLabel(combo)} already does “${clash.what}”.` : null;
}
