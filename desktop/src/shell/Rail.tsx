import type { ReactNode } from "react";
import type { ModuleCard } from "../core/client";
import { IconButton } from "../ui";
import { HomeIcon, ActivityIcon, PeopleIcon, ModuleIcon, IntelligenceIcon, SettingsIcon, PlusIcon, ChevronsLeft, ChevronsRight } from "../ui/icons";

export type Surface =
  | { kind: "home" }
  | { kind: "activity" }
  | { kind: "intelligence"; tab?: string }
  | { kind: "settings" }
  | { kind: "people" }
  | { kind: "entity"; id: string }
  | { kind: "skill"; name: string }
  | { kind: "automation"; id: string }
  | { kind: "module"; id: string };

/** Whether rail item `b` is the current place `a`. */
export function sameSurface(a: Surface, b: Surface): boolean {
  if (b.kind === "people" && a.kind === "entity") return true; // a person's page is inside People & Companies
  if (b.kind === "intelligence" && (a.kind === "skill" || a.kind === "automation")) return true; // item pages live under Intelligence
  if (a.kind !== b.kind) return false;
  if (a.kind === "module" && b.kind === "module") return a.id === b.id;
  return true;
}

/** A remembered place that no longer exists (an older build's) becomes Home. */
export function knownSurface(value: unknown): Surface {
  const s = value as Surface | null;
  if (s && (s.kind === "home" || s.kind === "activity" || s.kind === "intelligence" || s.kind === "settings" || s.kind === "people" || ((s.kind === "module" || s.kind === "entity" || s.kind === "automation") && typeof s.id === "string") || (s.kind === "skill" && typeof s.name === "string"))) return s;
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
  const item = (target: Surface, icon: ReactNode, label: string, count?: number) => {
    const current = sameSurface(surface, target);
    const key = target.kind === "module" || target.kind === "entity" || target.kind === "automation" ? `${target.kind}:${target.id}` : target.kind === "skill" ? `skill:${target.name}` : target.kind;
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
        <IconButton className="rail__fold" label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} aria-expanded={!collapsed} icon={collapsed ? <ChevronsRight /> : <ChevronsLeft />} onClick={onToggleCollapsed} />
      </div>
      {item({ kind: "home" }, <HomeIcon />, "Home", needs)}
      {item({ kind: "activity" }, <ActivityIcon />, "Activity")}
      {item({ kind: "people" }, <PeopleIcon />, "People & Companies")}
      <div className="rail__scroll">
        <div className="rail__group">Your modules</div>
        {modules.length === 0 ? <p className="faint" style={{ padding: "4px 10px" }}>None yet. Ask for one.</p> : null}
        {modules.map((m) => item({ kind: "module", id: m.id }, <ModuleIcon />, m.name))}
        <button type="button" className="navbtn navbtn--new" onClick={onNew} aria-label="New" title={collapsed ? "New" : undefined}>
          <span className="navbtn__ico" aria-hidden="true" style={{ color: "var(--primary)" }}>
            <PlusIcon />
          </span>
          <span className="navbtn__text">New</span>
        </button>
      </div>
      {item({ kind: "intelligence" }, <IntelligenceIcon />, "Intelligence")}
      {item({ kind: "settings" }, <SettingsIcon />, "Settings")}
      <div className={`rail__status rail__status--${runtime}`} role="status" title={collapsed ? status : undefined}>
        <i aria-hidden="true" />
        <span className="rail__status-text">{status}</span>
      </div>
    </nav>
  );
}
