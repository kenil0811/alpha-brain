/**
 * The sidebar's modules in the person's own order (13 Oct, Q42 section 5; the feature from pull
 * request #5). The order is one list of module ids (`sidebar_order`): under any one parent the
 * modules follow it, and those it doesn't name (new ones) come after, by name, so a new module
 * goes at the end of its level until it is moved. Ids of modules that no longer exist are
 * ignored. A hidden module (`sidebar_hidden`) leaves the sidebar with what is inside it. Pure,
 * so tested without a window.
 */
import type { ModuleCard } from "../core/client";

/** Modules as a tree: the top-level ones, each with the ones inside it. */
export interface ModuleBranch {
  module: ModuleCard;
  inside: ModuleBranch[];
}

/** The modules under `parent` (null: the top level), in the person's order, then the rest by
 *  name. A module whose parent isn't among `modules` counts as top level: shown, never lost. */
export function siblingsOf(modules: ModuleCard[], order: string[], parent: string | null): ModuleCard[] {
  const ids = new Set(modules.map((m) => m.id));
  const rank = new Map(order.map((id, i) => [id, i] as const));
  return modules
    .filter((m) => (parent === null ? !m.parent || !ids.has(m.parent) : m.parent === parent))
    .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || a.name.localeCompare(b.name));
}

/** The tree the sidebar draws: in order, without the hidden modules and what is inside them. */
export function treeOf(modules: ModuleCard[], order: string[] = [], hidden: string[] = []): ModuleBranch[] {
  const gone = new Set(hidden);
  const branch = (m: ModuleCard): ModuleBranch => ({ module: m, inside: siblingsOf(modules, order, m.id).filter((c) => !gone.has(c.id)).map(branch) });
  return siblingsOf(modules, order, null).filter((m) => !gone.has(m.id)).map(branch);
}

/** The order after `id` is placed among `siblings` (the ids under one parent, in order): before
 *  `target`, after it, or at the end when there is none. Only this parent's order is rewritten. */
export function withPlace(order: string[], siblings: string[], id: string, target: string | null, after = false): string[] {
  const rest = siblings.filter((s) => s !== id);
  const at = target ? rest.indexOf(target) : -1;
  rest.splice(at < 0 ? rest.length : at + (after ? 1 : 0), 0, id);
  return [...order.filter((o) => o !== id && !rest.includes(o)), ...rest];
}

/** Whether `id` is `ancestor` or sits anywhere inside it: a module can't move into itself. */
export function isInside(modules: ModuleCard[], id: string, ancestor: string): boolean {
  const byId = new Map(modules.map((m) => [m.id, m] as const));
  const seen = new Set<string>();
  for (let at: string | null | undefined = id; at && !seen.has(at); at = byId.get(at)?.parent) {
    if (at === ancestor) return true;
    seen.add(at);
  }
  return false;
}

export type DropZone = "before" | "inside" | "after";

/** Where on a row a drop lands: its top quarter is above it, its bottom quarter below, the
 *  middle inside it. */
export function dropZone(offsetY: number, height: number): DropZone {
  const f = height > 0 ? offsetY / height : 0.5;
  return f < 0.25 ? "before" : f > 0.75 ? "after" : "inside";
}

/** The ids `ids` with the modules that no longer exist taken out. */
export const existing = (ids: unknown, modules: ModuleCard[]): string[] => {
  const known = new Set(modules.map((m) => m.id));
  return Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string" && known.has(i)) : [];
};
