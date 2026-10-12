/** Bubbles (an experiment, 12 Oct): where Alpha points on the page in `<main>`. Alpha may write
 *  `[[bubble: <target text> | <comment>]]` in a reply (stripped from the shown text); a reply that
 *  quotes or bolds the exact text of something visible also gets a bubble there. */
import { useSyncExternalStore } from "react";

export interface Bubble { id: number; el: Element; text: string }

let bubbles: Bubble[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const bubbleStore = {
  subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
  get: () => bubbles,
  add(el: Element, text: string) {
    if (bubbles.some((b) => b.el === el)) return;
    bubbles = [...bubbles, { id: next++, el, text }];
    emit();
  },
  remove(id: number) {
    bubbles = bubbles.filter((b) => b.id !== id);
    emit();
  },
  clear() {
    if (!bubbles.length) return;
    bubbles = [];
    emit();
  },
};

export function useBubbles() {
  const list = useSyncExternalStore(bubbleStore.subscribe, bubbleStore.get);
  return { bubbles: list, add: bubbleStore.add, remove: bubbleStore.remove, clear: bubbleStore.clear };
}

const MARK = /\[\[\s*bubble\s*:\s*([^|\]]+?)\s*(?:\|\s*([^\]]*?)\s*)?\]\]/gi;

/** The bubble marks in a reply. */
export function parseBubbles(text: string): { target: string; comment: string }[] {
  return [...text.matchAll(MARK)].map((m) => ({ target: m[1], comment: m[2] ?? "" }));
}

/** A reply as shown: without its bubble marks. */
export const withoutBubbles = (text: string) => text.replace(MARK, "").replace(/[ \t]{2,}/g, " ").trim();

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const CANDIDATES = "h1, h2, h3, h4, th, [role=columnheader], button, a, label, td, dt, strong, [class*=title]";

/** The element in `root` whose visible text best matches `target`: exact first, then the shortest
 *  that contains it. `exact` takes only an exact match. */
export function findTarget(root: ParentNode, target: string, exact = false): Element | null {
  const want = norm(target);
  if (!want) return null;
  let best: Element | null = null;
  let bestLen = Infinity;
  for (const el of root.querySelectorAll(CANDIDATES)) {
    if ((el as HTMLElement).closest?.("[hidden], [aria-hidden=true]")) continue;
    const have = norm(el.textContent ?? "");
    if (have === want) return el;
    if (!exact && have.includes(want) && have.length < bestLen) {
      best = el;
      bestLen = have.length;
    }
  }
  return best;
}

/** Turns a finished reply into bubbles on `root` (the page in `<main>`). */
export function bubblesFromReply(reply: string, root: ParentNode | null): void {
  if (!root) return;
  for (const { target, comment } of parseBubbles(reply)) {
    const el = findTarget(root, target);
    if (el) bubbleStore.add(el, comment);
  }
  const plain = withoutBubbles(reply);
  const sentences = plain.split(/(?<=[.!?])\s+/);
  for (const m of plain.matchAll(/\*\*([^*]+)\*\*|"([^"\n]+)"|“([^”\n]+)”/g)) {
    const named = m[1] ?? m[2] ?? m[3];
    const el = findTarget(root, named, true);
    if (!el) continue;
    const sentence = sentences.find((s) => s.includes(m[0])) ?? "";
    bubbleStore.add(el, sentence.replace(/\*\*/g, "").trim());
  }
}
