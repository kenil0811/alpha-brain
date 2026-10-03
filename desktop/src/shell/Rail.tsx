/**
 * The rail: the workspace name (with the core's status dot), Home, the person's projects with
 * their sub projects nested under them (drag to reorder, open, hide, rename, change icon,
 * export, delete), New project (a project file dropped on it is added), and Intelligence and
 * Settings at the foot. Activity is the bell in the Chief of Staff's header. It collapses to
 * icons and resizes (ui/panel).
 */
import { useCallback, useRef, useState } from "react";
import { Contact, FolderPlus, Home as HomeIcon, MoreVertical, Settings as SettingsIcon, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import type { Client, ModuleCard } from "../core/client";
import { CollapseToggleButton, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, ResizeHandle, Tooltip, useToast, type PanelControl } from "../ui";
import { exportProject, importProject, isProjectFile, ProjectEditDialog, ProjectMenuItems, type ProjectEdit } from "./ProjectMenu";
import { projectIcon } from "./projectIcons";

export type Surface =
  | { kind: "home" }
  | { kind: "activity" }
  | { kind: "intelligence"; tab?: string }
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

/** Where a place lives in the window's address (`#/m/<id>/<section>`, `#/settings/<section>`),
 *  so back and forward work. */
export function surfacePath(s: Surface): string {
  if (s.kind === "module") return `/m/${encodeURIComponent(s.id)}${s.section && s.section !== "app" ? `/${s.section}` : ""}`;
  if (s.kind === "intelligence") return s.tab ? `/intelligence/${s.tab}` : "/intelligence";
  if (s.kind === "settings") return s.section ? `/settings/${s.section}` : "/settings";
  if (s.kind === "entity") return `/people/${encodeURIComponent(s.id)}`;
  return s.kind === "home" ? "/" : `/${s.kind}`;
}

const MODULE_SECTIONS = new Set(["app", "activity", "settings"]);

export function surfaceFromPath(path: string): Surface | null {
  const [, first, second, third] = path.replace(/^#/, "").split("/");
  if (!first) return path.replace(/^#/, "") === "/" ? { kind: "home" } : null;
  if (first === "m" && second) return third && MODULE_SECTIONS.has(third) ? { kind: "module", id: decodeURIComponent(second), section: third } : { kind: "module", id: decodeURIComponent(second) };
  if (first === "intelligence") return second ? { kind: "intelligence", tab: second } : { kind: "intelligence" };
  // Alpha's aliases: Connections and About you live in Intelligence.
  if (first === "connections" || (first === "settings" && second === "connections")) return { kind: "intelligence", tab: "connections" };
  if (first === "about") return { kind: "intelligence", tab: "knowledge" };
  if (first === "people" && second) return { kind: "entity", id: decodeURIComponent(second) };
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
  client,
  onChanged,
}: {
  surface: Surface;
  modules: ModuleCard[];
  runtime: "connecting" | "connected" | "unavailable";
  onGo: (surface: Surface) => void;
  onNew: () => void;
  panel: PanelControl;
  client?: Client | null;
  /** A project was renamed, given an icon, added or deleted. */
  onChanged?: () => void;
}) {
  const collapsed = panel.collapsed;
  const { visible, hiddenCount, reorder, hide, showAll } = useOrdering(modules);
  // Sub projects sit under their project; one whose project is hidden shows at the top level.
  const shownIds = new Set(visible.map((m) => m.id));
  const top = visible.filter((m) => !m.project || !shownIds.has(m.project));
  const toast = useToast();
  const dragId = useRef<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ project: ModuleCard; edit: ProjectEdit } | null>(null);
  const [workspace, setWorkspace] = useState(() => {
    try {
      return localStorage.getItem(WORKSPACE_KEY) || "Alpha";
    } catch {
      return "Alpha";
    }
  });
  const [renaming, setRenaming] = useState(false);

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

  const addFromFile = useCallback(
    async (file: File) => {
      if (!client) return;
      try {
        const made = await importProject(client, file);
        onChanged?.();
        onGo({ kind: "module", id: made.id });
        toast.show(`Added ${made.name}`);
      } catch (e) {
        toast.show(e instanceof Error ? e.message : "That project couldn't be added.");
      }
    },
    [client, onChanged, onGo, toast],
  );

  const item = (target: Surface, Icon: LucideIcon, label: string) => {
    const current = sameSurface(surface, target);
    const key = target.kind === "module" || target.kind === "entity" ? `${target.kind}:${target.id}` : target.kind;
    return (
      <button key={key} type="button" className={`navbtn${current ? " navbtn--current" : ""}`} aria-current={current ? "page" : undefined} aria-label={label} title={collapsed ? label : undefined} onClick={() => onGo(target)}>
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
          if (!client || collapsed) return;
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
        {!collapsed && client ? (
          <DropdownMenu open={menuFor === m.id} onOpenChange={(open) => setMenuFor(open ? m.id : null)}>
            <DropdownMenuTrigger asChild>
              <button type="button" className="iconbtn iconbtn--sm navrow__menu" aria-label={`${m.name} options`}>
                <MoreVertical size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <ProjectMenuItems
                onOpen={() => onGo(target)}
                onPick={(edit) => setEditing({ project: m, edit })}
                onHide={() => hide(m.id)}
                onExport={(rows) =>
                  void exportProject(client, m, rows)
                    .then((words) => toast.show(words))
                    .catch(() => toast.show(`Couldn't export ${m.name}`))
                }
              />
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="brand__name" aria-label={`Workspace: ${workspace}`}>
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
        {item({ kind: "people" }, Contact, "People & Companies")}
        {top.map((m) => {
          const nested = visible.filter((c) => c.project === m.id);
          return nested.length ? (
            <div key={m.id} className="rail__project">
              {projectRow(m)}
              <div className="rail__nested">{nested.map(projectRow)}</div>
            </div>
          ) : (
            projectRow(m)
          );
        })}
        <div className="navrow">
          <button
            type="button"
            className="navbtn navbtn--new navrow__main"
            aria-label="New project"
            title={collapsed ? "New project" : undefined}
            onClick={onNew}
            // A project file dropped here is added straight away.
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = Array.from(e.dataTransfer.files).find(isProjectFile);
              if (file) void addFromFile(file);
            }}
          >
            <span className="navbtn__ico" aria-hidden="true">
              <FolderPlus size={16} strokeWidth={1.75} />
            </span>
            <span className="navbtn__text">{collapsed ? "New" : "New project"}</span>
          </button>
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
      {client ? (
        <ProjectEditDialog
          client={client}
          project={editing?.project ?? null}
          edit={editing?.edit ?? null}
          onClose={() => setEditing(null)}
          subProjects={editing ? modules.filter((x) => x.project === editing.project.id).length : 0}
          onChanged={() => onChanged?.()}
          onDeleted={(id) => {
            onChanged?.();
            if (surface.kind === "module" && surface.id === id) onGo({ kind: "home" });
          }}
        />
      ) : null}
    </nav>
  );
}
