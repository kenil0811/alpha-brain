/**
 * The sidebar's modules as the person ordered them (the UI rulebook §4, 9 Oct). The order is one
 * list of module ids (`PREF.moduleOrder`); inside any one parent the modules follow it, and the
 * ones it does not name (new, or from before) come after, by name. Ids it names that no longer
 * exist are ignored. Hidden modules (`PREF.hiddenModules`) leave the sidebar with what is inside
 * them. Pure, so the order is tested without a window.
 */
import type { ModuleCard } from "../core/client";

/** Modules as a tree: the top-level ones, each with the ones inside it. */
export interface ModuleBranch {
  module: ModuleCard;
  inside: ModuleBranch[];
}

/** `modules` with the given `parent`, in the person's order, then the rest by name. A module
 *  whose parent is not among `modules` counts as top level, so it is shown rather than lost. */
export function siblingsOf(modules: ModuleCard[], order: string[], parent: string | null): ModuleCard[] {
  const ids = new Set(modules.map((m) => m.id));
  const rank = new Map(order.map((id, i) => [id, i] as const));
  return modules
    .filter((m) => (parent === null ? !m.parent || !ids.has(m.parent) : m.parent === parent))
    .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || a.name.localeCompare(b.name));
}

export function treeOf(modules: ModuleCard[], order: string[] = [], hidden: string[] = []): ModuleBranch[] {
  const gone = new Set(hidden);
  const branch = (m: ModuleCard): ModuleBranch => ({ module: m, inside: siblingsOf(modules, order, m.id).filter((c) => !gone.has(c.id)).map(branch) });
  return siblingsOf(modules, order, null).filter((m) => !gone.has(m.id)).map(branch);
}

/** The order list after `id` is placed among `siblings` (the ids now under one parent, in
 *  order): before `target`, after it, or at the end when there is none. Only the relative order
 *  inside this one parent is rewritten; every other parent keeps its own. */
export function withPlace(order: string[], siblings: string[], id: string, target: string | null, after = false): string[] {
  const rest = siblings.filter((s) => s !== id);
  const at = target ? rest.indexOf(target) : -1;
  rest.splice(at < 0 ? rest.length : at + (after ? 1 : 0), 0, id);
  return [...order.filter((o) => !rest.includes(o)), ...rest];
}

/** Whether `id` is `ancestor` or sits anywhere inside it: a module cannot move into itself. */
export function isInside(modules: ModuleCard[], id: string, ancestor: string): boolean {
  const byId = new Map(modules.map((m) => [m.id, m] as const));
  for (let at: string | null | undefined = id, hops = 0; at && hops < 64; at = byId.get(at)?.parent, hops++) if (at === ancestor) return true;
  return false;
}

/** Where on a row a drop lands: the top quarter is above it, the bottom quarter below it, the
 *  middle is inside it. */
export function dropZone(offsetY: number, height: number): "before" | "inside" | "after" {
  const f = height > 0 ? offsetY / height : 0.5;
  return f < 0.25 ? "before" : f > 0.75 ? "after" : "inside";
}
