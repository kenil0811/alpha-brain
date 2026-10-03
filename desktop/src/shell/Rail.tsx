/**
 * The rail: the workspace name (with the core's status dot), Home, People & Companies, the
 * person's projects (drag to reorder, open, hide), New project, and Intelligence and Settings at
 * the foot. Activity is
 * the bell in Zazoo's header. It collapses to icons and resizes (ui/panel).
 */
import { useRef, useState } from "react";
import { FileUp, FolderPlus, Home as HomeIcon, MoreVertical, Settings as SettingsIcon, Sparkles, UserRound, Users, type LucideIcon } from "lucide-react";
import type { ModuleCard } from "../core/client";
import { CollapseToggleButton, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, ResizeHandle, Tooltip, useComingSoon, type PanelControl } from "../ui";
import { ProjectMenuItems } from "./ProjectMenu";
import { useOpenOnClick } from "../dataviews/cells";
import { projectIcon } from "./projectIcons";
import { IconButton } from "../ui/IconButton";

export type Surface =
  | { kind: "home" }
  | { kind: "activity" }
  | { kind: "intelligence"; tab?: string; item?: string }
  | { kind: "settings"; section?: string }
  | { kind: "people" }
  | { kind: "entity"; id: string }
  | { kind: "module"; id: string; section?: string };

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

/** Where a place lives in the window's address (`#/m/<id>/<section>`, `#/settings/<section>`,
 *  `#/intelligence/<tab>/<item>`, `#/people/<id>`), so back and forward work. */
export function surfacePath(s: Surface): string {
  if (s.kind === "module") return `/m/${encodeURIComponent(s.id)}${s.section && s.section !== "app" ? `/${s.section}` : ""}`;
  if (s.kind === "intelligence") return s.tab ? `/intelligence/${s.tab}${s.item ? `/${encodeURIComponent(s.item)}` : ""}` : "/intelligence";
  if (s.kind === "settings") return s.section ? `/settings/${s.section}` : "/settings";
  if (s.kind === "entity") return `/people/${encodeURIComponent(s.id)}`;
  return s.kind === "home" ? "/" : `/${s.kind}`;
}

const MODULE_SECTIONS = new Set(["app", "activity", "settings"]);

export function surfaceFromPath(path: string): Surface | null {
  const [, first, second, third] = path.replace(/^#/, "").split("/");
  if (!first) return path.replace(/^#/, "") === "/" ? { kind: "home" } : null;
  if (first === "m" && second) return third && MODULE_SECTIONS.has(third) ? { kind: "module", id: decodeURIComponent(second), section: third } : { kind: "module", id: decodeURIComponent(second) };
  // A person's page is in People & Companies; the second brain's old address for it leads there.
  const person = first === "people" ? second : first === "intelligence" && second === "brain" ? third : undefined;
  if (person) return { kind: "entity", id: decodeURIComponent(person) };
  if (first === "intelligence") return second ? (third ? { kind: "intelligence", tab: second, item: decodeURIComponent(third) } : { kind: "intelligence", tab: second }) : { kind: "intelligence" };
  // Alpha's aliases: Connections and About you live in Intelligence.
  if (first === "connections" || (first === "settings" && second === "connections")) return { kind: "intelligence", tab: "connections" };
  if (first === "about") return { kind: "intelligence", tab: "knowledge" };
  if (first === "settings") return second ? { kind: "settings", section: second } : { kind: "settings" };
  return knownSurface({ kind: first });
}

const HIDDEN_KEY = "alpha.rail.hiddenModules";
const ORDER_KEY = "alpha.rail.moduleOrder";
const WORKSPACE_KEY = "alpha.workspace.name";

function readList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function writeList(key: string, value: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* per-window convenience only */
  }
}

/** The person's drag order (new projects after known ones, in the core's order), minus hidden. */
function useOrdering(modules: ModuleCard[]) {
  const [order, setOrder] = useState<string[]>(() => readList(ORDER_KEY));
  const [hidden, setHidden] = useState<string[]>(() => readList(HIDDEN_KEY));
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  const ordered = [...modules].sort((a, b) => rank(a.id) - rank(b.id));
  const reorder = (dragId: string, dropId: string) => {
    const ids = ordered.map((m) => m.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(dropId);
    if (from === -1 || to === -1 || from === to) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    setOrder(ids);
    writeList(ORDER_KEY, ids);
  };
  const hide = (id: string) => {
    const next = [...new Set([...hidden, id])];
    setHidden(next);
    writeList(HIDDEN_KEY, next);
  };
  const showAll = () => {
    setHidden([]);
    writeList(HIDDEN_KEY, []);
  };
  return { visible: ordered.filter((m) => !hidden.includes(m.id)), hiddenCount: modules.filter((m) => hidden.includes(m.id)).length, reorder, hide, showAll };
}

export function Rail({
  surface,
  modules,
  runtime,
  onGo,
  onNew,
  panel,
}: {
  surface: Surface;
  modules: ModuleCard[];
  runtime: "connecting" | "connected" | "unavailable";
  onGo: (surface: Surface) => void;
  onNew: () => void;
  panel: PanelControl;
}) {
  const collapsed = panel.collapsed;
  const { visible, hiddenCount, reorder, hide, showAll } = useOrdering(modules);
  const dragId = useRef<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState(() => {
    try {
      return localStorage.getItem(WORKSPACE_KEY) || "Alpha";
    } catch {
      return "Alpha";
    }
  });
  const [renaming, setRenaming] = useState(false);
  const [brandMenu, setBrandMenu] = useState(false);
  const brandClicks = useOpenOnClick();
  const soon = useComingSoon();

  const saveWorkspace = (value: string) => {
    const name = value.trim();
    // ponytail: kept in this window's storage; move to a core setting when workspaces sync.
    if (name) {
      setWorkspace(name);
      try {
        localStorage.setItem(WORKSPACE_KEY, name);
      } catch {
        /* per-window convenience only */
      }
    }
    setRenaming(false);
  };

  const item = (target: Surface, Icon: LucideIcon, label: string) => {
    const current = sameSurface(surface, target);
    return (
      <button key={target.kind} type="button" className={`navbtn${current ? " navbtn--current" : ""}`} aria-current={current ? "page" : undefined} aria-label={label} title={collapsed ? label : undefined} onClick={() => onGo(target)}>
        <span className="navbtn__ico" aria-hidden="true">
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <span className="navbtn__text">{label}</span>
      </button>
    );
  };

  const projectRow = (m: ModuleCard) => {
    const target: Surface = { kind: "module", id: m.id };
    const current = sameSurface(surface, target);
    const Icon = projectIcon(m);
    return (
      <div
        key={m.id}
        className={`navrow${dropOn === m.id ? " navrow--drop" : ""}`}
        draggable={!collapsed}
        onDragStart={() => {
          dragId.current = m.id;
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (dragId.current) setDropOn(m.id);
        }}
        onDragLeave={() => setDropOn(null)}
        onDrop={(e) => {
          e.preventDefault();
          if (dragId.current) reorder(dragId.current, m.id);
          dragId.current = null;
          setDropOn(null);
        }}
        onContextMenu={(e) => {
          if (collapsed) return;
          e.preventDefault();
          setMenuFor(m.id);
        }}
      >
        <button type="button" className={`navbtn navrow__main${current ? " navbtn--current" : ""}`} aria-current={current ? "page" : undefined} aria-label={m.name} title={collapsed ? m.name : undefined} onClick={() => onGo(target)}>
          <span className="navbtn__ico" aria-hidden="true">
            <Icon size={16} strokeWidth={1.75} />
          </span>
          <span className="navbtn__text">{m.name}</span>
        </button>
        {!collapsed ? (
          <DropdownMenu open={menuFor === m.id} onOpenChange={(open) => setMenuFor(open ? m.id : null)}>
            <DropdownMenuTrigger asChild>
              <IconButton size="sm" className="navrow__menu" aria-label={`${m.name} options`}>
                <MoreVertical size={14} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <ProjectMenuItems onOpen={() => onGo(target)} onHide={() => hide(m.id)} />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    );
  };

  const runtimeLabel = runtime === "connected" ? "Alpha is running" : runtime === "connecting" ? "Starting" : "Core not running";
  return (
    <nav className={collapsed ? "rail rail--collapsed" : "rail"} aria-label="Alpha" style={{ width: panel.displayWidth }}>
      <div className="brand" data-tauri-drag-region>
        <Tooltip content={runtimeLabel}>
          <div className={`brand__mark brand__mark--${runtime}`} role="status">
            <span className="sr-only">{runtimeLabel}</span>
          </div>
        </Tooltip>
        {renaming ? (
          <input
            className="brand__input"
            aria-label="Workspace name"
            defaultValue={workspace}
            maxLength={40}
            autoFocus
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={(e) => saveWorkspace(e.target.value)}
          />
        ) : (
          <DropdownMenu open={brandMenu} onOpenChange={setBrandMenu}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="brand__name"
                aria-label={`Workspace: ${workspace}`}
                title="Double-click to rename"
                // A click opens the menu (after a beat, so a double click can rename instead).
                onPointerDown={(e) => e.preventDefault()}
                onClick={(e) => brandClicks.click(e, () => setBrandMenu(true))}
                onDoubleClick={() => {
                  brandClicks.cancel();
                  setRenaming(true);
                }}
              >
                {workspace}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onGo({ kind: "intelligence", tab: "knowledge" })}>
                <UserRound size={14} strokeWidth={1.75} aria-hidden="true" /> About you
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename workspace</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onGo({ kind: "settings" })}>
                <SettingsIcon size={14} strokeWidth={1.75} aria-hidden="true" /> Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <CollapseToggleButton side="left" collapsed={collapsed} onClick={panel.toggleCollapsed} controls="rail-body" className="rail__fold" />
      </div>
      <div id="rail-body" className="rail__body">
        {item({ kind: "home" }, HomeIcon, "Home")}
        {item({ kind: "people" }, Users, "People & Companies")}
        {visible.map(projectRow)}
        <div className="navrow">
          <button
            type="button"
            className="navbtn navbtn--new navrow__main"
            aria-label="New project"
            title={collapsed ? "New project" : undefined}
            onClick={onNew}
            // A project file dropped here would be added (backend-requests.md §4).
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) soon("Adding a project from a file");
            }}
          >
            <span className="navbtn__ico" aria-hidden="true">
              <FolderPlus size={16} strokeWidth={1.75} />
            </span>
            <span className="navbtn__text">{collapsed ? "New" : "New project"}</span>
          </button>
          {!collapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton size="sm" className="navrow__menu" aria-label="More ways to add a project">
                  <MoreVertical size={14} />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => soon("Adding a project from a file")}>
                  <FileUp size={14} strokeWidth={1.75} aria-hidden="true" /> Add from a file…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {!collapsed && hiddenCount > 0 ? (
          <button type="button" className="navbtn" onClick={showAll}>
            <span className="navbtn__text faint">{hiddenCount} hidden · Show all</span>
          </button>
        ) : null}
        <div className="rail__spacer" />
        {item({ kind: "intelligence" }, Sparkles, "Intelligence")}
        {item({ kind: "settings" }, SettingsIcon, "Settings")}
      </div>
      {!collapsed ? <ResizeHandle side="left" onMouseDown={panel.startDrag} onStep={panel.resizeBy} label="Resize the sidebar" value={panel.displayWidth} min={76} max={360} isDragging={panel.isDragging} /> : null}
    </nav>
  );
}
