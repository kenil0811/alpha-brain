import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Client, ModuleCard } from "../core/client";
import { IconButton, Menu, MenuItem } from "../ui";
import { HomeIcon, ActivityIcon, PeopleIcon, ModuleIcon, IntelligenceIcon, SettingsIcon, PlusIcon, ChevronsLeft, ChevronsRight } from "../ui/icons";

export type Surface =
  | { kind: "home" }
  | { kind: "activity" }
  | { kind: "intelligence"; tab?: string; item?: string }
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

/** The workspace's name, kept in the core's preferences (so the companion and every window
 *  share it); "Alpha" until the person names it. */
const WORKSPACE_PREF = "workspace_name";
// A single click waits this long for a second one before it opens the menu.
export const DOUBLE_CLICK_MS = 220;

function WorkspaceName({ client, onGo }: { client: Client | null; onGo: (surface: Surface) => void }) {
  const [name, setName] = useState("Alpha");
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!client) return;
    client
      .preference(WORKSPACE_PREF)
      .then((p) => {
        if (typeof p.value === "string" && p.value) setName(p.value);
      })
      .catch(() => undefined);
  }, [client]);
  const save = (value: string) => {
    setRenaming(false);
    const next = value.trim();
    if (!next || next === name) return;
    const was = name;
    setName(next);
    client?.setPreference(WORKSPACE_PREF, next).catch(() => setName(was));
  };
  if (renaming)
    return (
      <input
        className="brand__input"
        aria-label="Workspace name"
        defaultValue={name}
        maxLength={40}
        autoFocus
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setRenaming(false);
        }}
        onBlur={(e) => save(e.target.value)}
      />
    );
  return (
    <Menu
      align="start"
      open={menu}
      onOpenChange={setMenu}
      trigger={
        <button
          type="button"
          className="brand__name"
          aria-label={`Workspace: ${name}`}
          title="Double-click to rename"
          // The menu opens on a click after a beat, so a double click renames instead.
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => {
            clearTimeout(timer.current);
            if (e.detail <= 1) timer.current = setTimeout(() => setMenu(true), DOUBLE_CLICK_MS);
          }}
          onDoubleClick={() => {
            clearTimeout(timer.current);
            setRenaming(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "F2") {
              e.preventDefault();
              setRenaming(true);
            }
          }}
        >
          {name}
        </button>
      }
    >
      <MenuItem onSelect={() => setRenaming(true)}>Rename workspace</MenuItem>
      <MenuItem onSelect={() => onGo({ kind: "intelligence", tab: "knowledge" })}>About you</MenuItem>
      <MenuItem onSelect={() => onGo({ kind: "settings" })}>Settings</MenuItem>
    </Menu>
  );
}

export function Rail({
  client = null,
  surface,
  modules,
  needs,
  runtime,
  onGo,
  onNew,
  collapsed,
  onToggleCollapsed,
}: {
  client?: Client | null;
  surface: Surface;
  modules: ModuleCard[];
  needs: number;
  runtime: "connecting" | "connected" | "unavailable" | "lost";
  onGo: (surface: Surface) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
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
  const item = (target: Surface, icon: ReactNode, label: string, count?: number, depth = 0, fold?: { open: boolean; onToggle: () => void }) => {
    const current = sameSurface(surface, target);
    const key = target.kind === "module" || target.kind === "entity" || target.kind === "automation" ? `${target.kind}:${target.id}` : target.kind === "skill" ? `skill:${target.name}` : target.kind;
    return (
      <div key={key} className="navrow" style={depth ? { paddingLeft: depth * 14 } : undefined}>
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
      </div>
    );
  };
  const branches = (list: ModuleBranch[], depth: number): ReactNode[] =>
    list.flatMap((b) => {
      const open = !folded.has(b.module.id);
      const row = item({ kind: "module", id: b.module.id }, <ModuleIcon />, b.module.name, undefined, depth, b.inside.length ? { open, onToggle: () => toggleFold(b.module.id) } : undefined);
      return open ? [row, ...branches(b.inside, depth + 1)] : [row];
    });
  const status = runtime === "connected" ? "Alpha is running" : runtime === "connecting" ? "Starting" : runtime === "lost" ? "Core not answering" : "Core not running";
  return (
    <nav className={collapsed ? "rail rail--collapsed" : "rail"} aria-label="Alpha">
      <div className="brand">
        {!collapsed ? <WorkspaceName client={client} onGo={onGo} /> : null}
        <IconButton className="rail__fold" label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} aria-expanded={!collapsed} icon={collapsed ? <ChevronsRight /> : <ChevronsLeft />} onClick={onToggleCollapsed} />
      </div>
      {item({ kind: "home" }, <HomeIcon />, "Home", needs)}
      {item({ kind: "activity" }, <ActivityIcon />, "Activity")}
      {item({ kind: "people" }, <PeopleIcon />, "People & Companies")}
      <div className="rail__scroll">
        <div className="rail__group">Your modules</div>
        {modules.length === 0 ? <p className="faint" style={{ padding: "4px 10px" }}>None yet. Ask for one.</p> : null}
        {branches(treeOf(modules), 0)}
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
