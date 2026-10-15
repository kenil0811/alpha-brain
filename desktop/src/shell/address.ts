/**
 * Pages have addresses: the place the window shows is in `location.hash`, so back and forward
 * work and the companion or ⌘K can open a page by its address (an idea from pull request #3,
 * rebuilt on main's Surface). `#/home`, `#/activity`, `#/activity/<entry>`, `#/people`, `#/people/<id>`, `#/m/<id>`,
 * `#/m/<id>/<table>` (a module on one of its tables), `#/m/<id>/<table>/<record>` (a record's own page; `#/records/<table>/<record>` for a table that
 * belongs to no module), `#/assistant`, `#/assistant/<conversation>`, `#/intelligence/<tab>`, `#/intelligence/goals/<goal>`,
 * `#/settings`. Nothing
 * else is in the address: what is open inside a
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
      return surface.table ? `/m/${encodeURIComponent(surface.id)}/${encodeURIComponent(surface.table)}` : `/m/${encodeURIComponent(surface.id)}`;
    case "assistant":
      return surface.id ? `/assistant/${encodeURIComponent(surface.id)}` : "/assistant";
    case "intelligence":
      return surface.tab ? `/intelligence/${encodeURIComponent(surface.tab)}` : "/intelligence";
    case "skill":
      return `/intelligence/skills/${encodeURIComponent(surface.name)}`;
    case "agent":
      return `/intelligence/agents/${encodeURIComponent(surface.id)}`;
    case "goal":
      return `/intelligence/goals/${encodeURIComponent(surface.id)}`;
    case "entry":
      return `/activity/${encodeURIComponent(surface.id)}`;
    case "settings":
      return "/settings";
    case "record":
      return surface.module ? `/m/${encodeURIComponent(surface.module)}/${encodeURIComponent(surface.table)}/${encodeURIComponent(surface.id)}` : `/records/${encodeURIComponent(surface.table)}/${encodeURIComponent(surface.id)}`;
  }
}

/** The surface an address names, or null when it names none (then the remembered place wins). */
export function surfaceFromPath(path: string): Surface | null {
  const parts = path.replace(/^#?\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [head, rest, third] = [parts[0], parts[1], parts[2]];
  if (!head) return null;
  if (head === "home" || head === "activity" || head === "people" || head === "settings") {
    if (head === "people" && rest) return { kind: "entity", id: rest };
    if (head === "activity" && rest) return { kind: "entry", id: rest };
    return knownSurface({ kind: head });
  }
  if (head === "m" && rest && third && parts[3]) return { kind: "record", module: rest, table: third, id: parts[3] };
  if (head === "m" && rest && third) return { kind: "module", id: rest, table: third };
  if (head === "m" && rest) return { kind: "module", id: rest };
  if (head === "records" && rest && third) return { kind: "record", table: rest, id: third };
  if (head === "assistant") return rest ? { kind: "assistant", id: rest } : { kind: "assistant" };
  if (head === "intelligence") {
    if (rest === "skills" && third) return { kind: "skill", name: third };
    // agents, and the address they had before 15 Oct 2026 (automations), so an old link still opens
    if ((rest === "agents" || rest === "automations") && third) return { kind: "agent", id: third };
    if (rest === "goals" && third) return { kind: "goal", id: third };
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
