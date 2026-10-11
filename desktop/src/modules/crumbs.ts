import type { Crumb } from "../ui";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A breadcrumb never names the same thing twice in a row (9 Oct, Vikas: project "Deals" ›
 *  collection "Deals" is one "Deals"). Of a run of equal names the last stays, since it is the
 *  deeper page. `next` is what the header shows right after the crumbs (the active tab or
 *  collection): a last crumb with the same name goes, so "Deals · Deals" is one "Deals" (U7). */
export function dedupeCrumbs(crumbs: Crumb[], next?: string): Crumb[] {
  const kept = crumbs.filter((c, i) => i === crumbs.length - 1 || !same(c.label, crumbs[i + 1].label));
  return next !== undefined && kept.length && same(kept[kept.length - 1].label, next) ? kept.slice(0, -1) : kept;
}
