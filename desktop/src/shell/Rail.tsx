import type { ModuleCard } from "../core/client";

export type Surface =
  | { kind: "home" }
  | { kind: "activity" }
  | { kind: "intelligence"; tab?: string }
  | { kind: "settings" }
  | { kind: "people" }
  | { kind: "entity"; id: string }
  | { kind: "module"; id: string };

/** Whether rail item `b` is the current place `a`. */
export function sameSurface(a: Surface, b: Surface): boolean {
  if (b.kind === "people" && a.kind === "entity") return true; // a person's page is inside People & Companies
  if (a.kind !== b.kind) return false;
  if (a.kind === "module" && b.kind === "module") return a.id === b.id;
  return true;
}

/** A remembered place that no longer exists (an older build's) becomes Home. */
export function knownSurface(value: unknown): Surface {
  const s = value as Surface | null;
  if (s && (s.kind === "home" || s.kind === "activity" || s.kind === "intelligence" || s.kind === "settings" || s.kind === "people" || ((s.kind === "module" || s.kind === "entity") && typeof s.id === "string"))) return s;
  return { kind: "home" };
}

export function Rail({
  surface,
  modules,
  needs,
  runtime,
  onGo,
  onNew,
  collapsed,
  onToggleCollapsed,
}: {
  surface: Surface;
  modules: ModuleCard[];
  needs: number;
  runtime: "connecting" | "connected" | "unavailable";
  onGo: (surface: Surface) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const item = (target: Surface, icon: string, label: string, count?: number) => {
    const current = sameSurface(surface, target);
    const key = target.kind === "module" || target.kind === "entity" ? `${target.kind}:${target.id}` : target.kind;
    return (
      <button key={key} type="button" className={`navbtn${current ? " navbtn--current" : ""}`} aria-current={current ? "page" : undefined} aria-label={label} title={collapsed ? label : undefined} onClick={() => onGo(target)}>
        <span className="navbtn__ico" aria-hidden="true">
          {icon}
        </span>
        <span className="navbtn__text">{label}</span>
        {count ? <span className="navbtn__count">{count}</span> : null}
      </button>
    );
  };
  const status = runtime === "connected" ? "Alpha is running" : runtime === "connecting" ? "Starting" : "Core not running";
  return (
    <nav className={collapsed ? "rail rail--collapsed" : "rail"} aria-label="Alpha">
      <div className="brand">
        <div className="brand__mark" aria-hidden="true">
          A
        </div>
        <b>Alpha</b>
        <button type="button" className="iconbtn rail__fold" onClick={onToggleCollapsed} aria-label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} aria-expanded={!collapsed}>
          <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
        </button>
      </div>
      {item({ kind: "home" }, "⌂", "Home", needs)}
      {item({ kind: "activity" }, "◷", "Activity")}
      {item({ kind: "people" }, "☺", "People & Companies")}
      <div className="rail__group">Your modules</div>
      {modules.length === 0 ? <p className="faint" style={{ padding: "4px 10px" }}>None yet. Ask for one.</p> : null}
      {modules.map((m) => item({ kind: "module", id: m.id }, "▦", m.name))}
      <button type="button" className="navbtn navbtn--new" onClick={onNew} aria-label="New" title={collapsed ? "New" : undefined}>
        <span className="navbtn__ico" aria-hidden="true" style={{ color: "var(--primary)" }}>
          +
        </span>
        <span className="navbtn__text">New</span>
      </button>
      <div className="rail__spacer" />
      {item({ kind: "intelligence" }, "◈", "Intelligence")}
      {item({ kind: "settings" }, "⚙", "Settings")}
      <div className={`rail__status rail__status--${runtime}`} role="status" title={collapsed ? status : undefined}>
        <i aria-hidden="true" />
        <span className="rail__status-text">{status}</span>
      </div>
    </nav>
  );
}
