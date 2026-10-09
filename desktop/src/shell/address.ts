/**
 * Pages have addresses: the place the window shows is in `location.hash`, so back and forward
 * work and the companion or ⌘K can open a page by its address (an idea from pull request #3,
 * rebuilt on main's Surface). `#/home`, `#/network`, `#/network/<id>`, `#/m/<id>`, `#/m/<id>/<table>/<record>` (a record's page; `new` for one not made yet),
 * `#/intelligence/<tab>`, `#/intelligence/agents/<id>`, `#/settings`, and `#/activity`, which
 * opens the sidebar's bell over the page that is open. Old addresses still work: `#/people…`
 * is Network, `#/intelligence/activity` the bell, `#/intelligence/map` Second Brain (9 Oct).
 * Nothing else is in the address: what is open inside a page stays where it was.
 */
import { knownSurface, type Surface } from "./Rail";

export function pathFor(surface: Surface): string {
  switch (surface.kind) {
    case "home":
      return "/home";
    case "activity":
      return "/activity";
    case "people":
      return "/network";
    case "entity":
      return `/network/${encodeURIComponent(surface.id)}`;
    case "module":
      return `/m/${encodeURIComponent(surface.id)}`;
    case "record":
      return `/m/${encodeURIComponent(surface.module)}/${encodeURIComponent(surface.table)}/${encodeURIComponent(surface.id)}`;
    case "intelligence":
      return surface.tab ? `/intelligence/${encodeURIComponent(surface.tab)}` : "/intelligence";
    case "skill":
      return `/intelligence/skills/${encodeURIComponent(surface.name)}`;
    case "automation":
      return `/intelligence/automations/${encodeURIComponent(surface.id)}`;
    case "agent":
      return `/intelligence/agents/${encodeURIComponent(surface.id)}`;
    case "settings":
      return "/settings";
  }
}

/** The surface an address names, or null when it names none (then the remembered place wins). */
export function surfaceFromPath(path: string): Surface | null {
  const parts = path.replace(/^#?\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [head, rest, third] = [parts[0], parts[1], parts[2]];
  if (!head) return null;
  if (head === "people" || head === "network") return rest ? { kind: "entity", id: rest } : { kind: "people" };
  if (head === "home" || head === "activity" || head === "settings") return knownSurface({ kind: head });
  if (head === "m" && rest && third && parts[3]) return { kind: "record", module: rest, table: third, id: parts[3] };
  if (head === "m" && rest) return { kind: "module", id: rest };
  if (head === "intelligence") {
    if (rest === "skills" && third) return { kind: "skill", name: third };
    if (rest === "automations" && third) return { kind: "automation", id: third };
    if (rest === "agents" && third) return { kind: "agent", id: third };
    return knownSurface(rest ? { kind: "intelligence", tab: rest } : { kind: "intelligence" });
  }
  return null;
}

export function currentHashSurface(): Surface | null {
  return surfaceFromPath(window.location.hash);
}

/** Put a surface in the address (a new history entry, or in place of this one: an old address
 *  rewritten to its new name) unless it is already there. */
export function pushAddress(surface: Surface, replace = false): void {
  const next = `#${pathFor(surface)}`;
  if (window.location.hash === next) return;
  if (replace) window.history.replaceState(null, "", next);
  else window.history.pushState(null, "", next);
}
