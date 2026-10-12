import { hasTauri } from "../core/session";

/** On the Mac the window has no title bar of its own (`titleBarStyle: "Overlay"`): the sidebar's
 *  top row holds the window controls and the header line is where the window is dragged from
 *  (rulebook §3; the owner, 12 Oct). In a browser nothing changes. */
export function macTitleBar(): boolean {
  return hasTauri() && /Mac/.test(navigator.userAgent);
}

/** What a press acts on rather than passes through: controls, and anything focusable. Shared
 *  with the folded panels' double-click, so the two never disagree. */
export const ACTIVE = [
  "button", "a", "input", "textarea", "select", "label", "summary", "[draggable='true']",
  "[tabindex]:not([tabindex='-1'])", "[contenteditable]:not([contenteditable='false'])",
  ...["button", "menu", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "combobox", "switch",
    "checkbox", "radio", "slider", "link", "option", "textbox", "searchbox"].map((r) => `[role='${r}']`),
].join(", ");

const BAR = ".rail__top, .pagehead";

/** Drag the window from the empty parts of the header line, as from a Mac title bar; a
 *  double-click there is the Mac's own (zoom or minimize, the person's choice). Ctrl-click is a
 *  right-click on the Mac, so it never drags. In full screen the controls are gone, and so is the
 *  room kept for them (`titlebar--full`). One listener for every header. */
export function startTitleBar(doc: Document = document): () => void {
  const root = doc.documentElement;
  root.classList.add("titlebar");
  const win = import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow());
  const down = (e: MouseEvent) => {
    const t = e.target as Element | null;
    if (e.button !== 0 || e.ctrlKey || !t?.closest?.(BAR) || t.closest(ACTIVE)) return;
    void win.then((w) => w.startDragging()).catch(() => undefined);
  };
  doc.addEventListener("mousedown", down);
  let unlisten: (() => void) | null = null;
  let stopped = false;
  const full = () => void win.then((w) => w.isFullscreen()).then((on) => root.classList.toggle("titlebar--full", on)).catch(() => undefined);
  void win.then((w) => w.onResized(full)).then((u) => (stopped ? u() : (unlisten = u))).catch(() => undefined);
  full();
  return () => {
    stopped = true;
    unlisten?.();
    root.classList.remove("titlebar", "titlebar--full");
    doc.removeEventListener("mousedown", down);
  };
}
