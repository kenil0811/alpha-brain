import type { Crumb } from "../ui";

/** A breadcrumb never names the same thing twice in a row (9 Oct, Vikas: project "Deals" ›
 *  collection "Deals" is one "Deals"). Of a run of equal names the last stays, since it is the
 *  deeper page. */
export function dedupeCrumbs(crumbs: Crumb[]): Crumb[] {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return crumbs.filter((c, i) => i === crumbs.length - 1 || !same(c.label, crumbs[i + 1].label));
}
