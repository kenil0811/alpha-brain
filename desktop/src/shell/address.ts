/**
 * Pages have addresses: the place the window shows is in `location.hash`, so back and forward
 * work and the companion or ⌘K can open a page by its address (an idea from pull request #3,
 * rebuilt on main's Surface). `#/home`, `#/activity`, `#/people`, `#/people/<id>`, `#/m/<id>`,
 * `#/intelligence/<tab>`, `#/settings`, `#/settings/<section>`. Nothing else is in the address: what is open inside a
 * page stays where it was.
 */
import { knownSurface, type Surface } from "./Rail";

export function pathFor(surface: Surface): string {
  switch (surface.kind) {
    case "home":
      return "/home";
    case "activity":
      return "/activity";
    case "people":
      return "/people";
    case "entity":
      return `/people/${encodeURIComponent(surface.id)}`;
    case "module":
      return `/m/${encodeURIComponent(surface.id)}`;
    case "intelligence":
      return surface.tab ? `/intelligence/${encodeURIComponent(surface.tab)}` : "/intelligence";
    case "skill":
      return `/intelligence/skills/${encodeURIComponent(surface.name)}`;
    case "automation":
      return `/intelligence/automations/${encodeURIComponent(surface.id)}`;
    case "settings":
      return surface.section ? `/settings/${encodeURIComponent(surface.section)}` : "/settings";
  }
}

/** The surface an address names, or null when it names none (then the remembered place wins). */
export function surfaceFromPath(path: string): Surface | null {
  const parts = path.replace(/^#?\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [head, rest, third] = [parts[0], parts[1], parts[2]];
  if (!head) return null;
  if (head === "settings") return rest ? { kind: "settings", section: rest } : { kind: "settings" };
  if (head === "home" || head === "activity" || head === "people") {
    if (head === "people" && rest) return { kind: "entity", id: rest };
    return knownSurface({ kind: head });
  }
  if (head === "m" && rest) return { kind: "module", id: rest };
  if (head === "intelligence") {
    if (rest === "skills" && third) return { kind: "skill", name: third };
    if (rest === "automations" && third) return { kind: "automation", id: third };
    return rest ? { kind: "intelligence", tab: rest } : { kind: "intelligence" };
  }
  return null;
}

export function currentHashSurface(): Surface | null {
  return surfaceFromPath(window.location.hash);
}

/** Put a surface in the address (a new history entry) unless it is already there. */
export function pushAddress(surface: Surface): void {
  const next = `#${pathFor(surface)}`;
  if (window.location.hash === next) return;
  window.history.pushState(null, "", next);
}
