import { useState, type ReactNode } from "react";
import type { Client, ModuleCard } from "../core/client";
import { ProjectMenu } from "../modules/ProjectMenu";
import { IconButton, Menu, MenuItem, useComingSoon } from "../ui";
import { HomeIcon, ActivityIcon, PeopleIcon, ModuleIcon, IntelligenceIcon, SettingsIcon, PlusIcon, ChevronsLeft, ChevronsRight, MoreHorizontal } from "../ui/icons";

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

/** Modules as a tree: the top-level ones, each with the ones inside it, by name. */
export interface ModuleBranch {
  module: ModuleCard;
  inside: ModuleBranch[];
}
export function treeOf(modules: ModuleCard[]): ModuleBranch[] {
  const ids = new Set(modules.map((m) => m.id));
  const branch = (m: ModuleCard): ModuleBranch => ({ module: m, inside: modules.filter((c) => c.parent === m.id).sort((a, b) => a.name.localeCompare(b.name)).map(branch) });
  // A module whose parent is unknown here is shown at the top rather than lost.
  return modules.filter((m) => !m.parent || !ids.has(m.parent)).sort((a, b) => a.name.localeCompare(b.name)).map(branch);
}

const FOLDED_KEY = "alpha.rail.folded";
function readFolded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
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
  client,
  onChanged,
}: {
  surface: Surface;
  modules: ModuleCard[];
  needs: number;
  runtime: "connecting" | "connected" | "unavailable" | "lost";
  onGo: (surface: Surface) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** For a project's menu (its ⋯ or a right-click on its row). */
  client?: Client | null;
  onChanged?: () => void;
}) {
  const soon = useComingSoon();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [folded, setFolded] = useState<Set<string>>(readFolded);
  const toggleFold = (id: string) =>
    setFolded((f) => {
      const next = new Set(f);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FOLDED_KEY, JSON.stringify([...next]));
      } catch {
        /* per-window convenience */
      }
      return next;
    });
  const item = (target: Surface, icon: ReactNode, label: string, count?: number, depth = 0, fold?: { open: boolean; onToggle: () => void }, project?: ModuleCard) => {
    const current = sameSurface(surface, target);
    const key = target.kind === "module" || target.kind === "entity" || target.kind === "automation" ? `${target.kind}:${target.id}` : target.kind === "skill" ? `skill:${target.name}` : target.kind;
    return (
      <div key={key} className="navrow" style={depth ? { paddingLeft: depth * 14 } : undefined} onContextMenu={project && client && !collapsed ? (e) => { e.preventDefault(); setMenuFor(project.id); } : undefined}>
        <button type="button" className={`navbtn${current ? " navbtn--current" : ""}`} aria-current={current ? "page" : undefined} aria-label={label} title={collapsed ? label : undefined} onClick={() => onGo(target)}>
          <span className="navbtn__ico" aria-hidden="true">
            {icon}
          </span>
          <span className="navbtn__text">{label}</span>
          {count ? <span className="navbtn__count">{count}</span> : null}
        </button>
        {fold && !collapsed ? (
          <button type="button" className="navfold" aria-label={fold.open ? `Fold ${label}` : `Unfold ${label}`} aria-expanded={fold.open} onClick={fold.onToggle}>
            {fold.open ? "▾" : "▸"}
          </button>
        ) : null}
        {project && client && !collapsed ? (
          <ProjectMenu client={client} module={project} open={menuFor === project.id} onOpenChange={(open) => setMenuFor(open ? project.id : null)} onGo={onGo} onChanged={onChanged ?? (() => undefined)} trigger={<IconButton size="sm" className="navrow__menu" label={`${label} options`} icon={<MoreHorizontal />} />} />
        ) : null}
      </div>
    );
  };
  const branches = (list: ModuleBranch[], depth: number): ReactNode[] =>
    list.flatMap((b) => {
      const open = !folded.has(b.module.id);
      const row = item({ kind: "module", id: b.module.id }, <ModuleIcon />, b.module.name, undefined, depth, b.inside.length ? { open, onToggle: () => toggleFold(b.module.id) } : undefined, b.module);
      return open ? [row, ...branches(b.inside, depth + 1)] : [row];
    });
  const status = runtime === "connected" ? "Alpha is running" : runtime === "connecting" ? "Starting" : runtime === "lost" ? "Core not answering" : "Core not running";
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
        {branches(treeOf(modules), 0)}
        <div className="navrow">
          {/* A project file dropped here would be added from it (the core's import route). */}
          <button type="button" className="navbtn navbtn--new" onClick={onNew} aria-label="New" title={collapsed ? "New" : undefined} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) soon("Adding a project from a file"); }}>
            <span className="navbtn__ico" aria-hidden="true" style={{ color: "var(--primary)" }}>
              <PlusIcon />
            </span>
            <span className="navbtn__text">New</span>
          </button>
          {!collapsed ? (
            <Menu align="start" trigger={<IconButton size="sm" className="navrow__menu" label="More ways to add a project" icon={<MoreHorizontal />} />}>
              <MenuItem onSelect={() => soon("Adding a project from a file")}>Add from a file…</MenuItem>
            </Menu>
          ) : null}
        </div>
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
