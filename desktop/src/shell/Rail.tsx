/**
 * The sidebar (the UI rulebook §4), left of the frame. Top to bottom: the workspace button (the
 * top row, at the shared header height), Home with what needs the person, People & Companies,
 * the person's modules as a tree in their own order, New, and pinned at the bottom Intelligence
 * and Settings. Only the module list scrolls. It holds nothing else: no headings, no status
 * lines, no agents, automations or records (9 Oct, the UI rulebook phase 2; the old "Your modules"
 * heading, Activity and "Alpha is running" went).
 *
 * A module is dragged to reorder it or dropped on the middle of another to move it inside;
 * Alt+↑/↓ reorder from the keyboard, Alt+→ moves it inside the one above, Alt+← out. The order
 * is `PREF.moduleOrder`; a move into another module is the core's `moveModule`. Right-click a
 * module (or its ⋯) for its menu. Folded, each item is its icon with a tiny label under it.
 */
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { Client, ModuleCard } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { IconButton, useContextMenu, type ContextItem } from "../ui";
import {
  AboveIcon,
  ChangeIconIcon,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  DeleteIcon,
  HideIcon,
  HomeIcon,
  ICON,
  ICON_SM,
  IntelligenceIcon,
  MoreHorizontal,
  MoveIcon,
  OpenIcon,
  PeopleIcon,
  PlusIcon,
  RenameIcon,
  SettingsIcon,
  SignOutIcon,
  ViewOptionsIcon,
  BuildingIcon,
} from "../ui/icons";
import { IconDialog, MoveDialog, NewAboveDialog, ViewOptionsDialog } from "./ModuleDialogs";
import { iconNamed } from "./moduleIcons";
import { dropZone, isInside, siblingsOf, treeOf, withPlace, type ModuleBranch } from "./sidebarOrder";

export type Surface =
  | { kind: "home" }
  /** Old: Activity is now Intelligence › Activity; `knownSurface` turns it into that. */
  | { kind: "activity" }
  | { kind: "intelligence"; tab?: string }
  | { kind: "settings" }
  | { kind: "people" }
  | { kind: "entity"; id: string }
  | { kind: "skill"; name: string }
  | { kind: "automation"; id: string }
  | { kind: "agent"; id: string }
  | { kind: "module"; id: string }
  /** A record's own page (the UI rulebook §7); `id` is "new" for a record not yet made. */
  | { kind: "record"; module: string; table: string; id: string };

/** Whether sidebar item `b` is the current place `a`. */
export function sameSurface(a: Surface, b: Surface): boolean {
  if (b.kind === "people" && a.kind === "entity") return true; // a person's page is inside People & Companies
  if (b.kind === "intelligence" && (a.kind === "skill" || a.kind === "automation" || a.kind === "agent")) return true; // item pages live under Intelligence
  if (b.kind === "module" && a.kind === "record") return a.module === b.id; // a record's page is inside its module
  if (a.kind !== b.kind) return false;
  if (a.kind === "module" && b.kind === "module") return a.id === b.id;
  return true;
}

export { treeOf, type ModuleBranch };

const FOLDED_KEY = "alpha.rail.folded";
function readFolded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** A remembered place that no longer exists (an older build's) becomes Home; Activity, which
 *  moved into Intelligence, goes there (the UI rulebook, contract 2). */
export function knownSurface(value: unknown): Surface {
  const s = value as Surface | null;
  if (s && s.kind === "activity") return { kind: "intelligence", tab: "activity" };
  if (s && (s.kind === "home" || s.kind === "intelligence" || s.kind === "settings" || s.kind === "people" || (s.kind === "record" && typeof s.module === "string" && typeof s.table === "string" && typeof s.id === "string") || ((s.kind === "module" || s.kind === "entity" || s.kind === "automation" || s.kind === "agent") && typeof s.id === "string") || (s.kind === "skill" && typeof s.name === "string"))) return s;
  return { kind: "home" };
}

const NO_IDS: string[] = [];
const NO_ICONS: Record<string, string> = {};
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : NO_IDS);

type Row = { kind: "module"; module: ModuleCard } | { kind: "people" };

export function Rail({
  client,
  surface,
  modules,
  needs,
  onGo,
  onNew,
  collapsed,
  onToggleCollapsed,
  onChanged,
}: {
  client: Client | null;
  surface: Surface;
  modules: ModuleCard[];
  needs: number;
  onGo: (surface: Surface) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** After the core changed (a module moved or made): reload what the window shows. */
  onChanged: () => void;
}) {
  const [folded, setFolded] = useState<Set<string>>(readFolded);
  const [workspace] = usePreference<string>(client, PREF.workspaceName, "Alpha");
  const [orderPref, setOrder] = usePreference<string[]>(client, PREF.moduleOrder, NO_IDS);
  const [hiddenPref, setHidden] = usePreference<string[]>(client, PREF.hiddenModules, NO_IDS);
  const [iconsPref, setIcons] = usePreference<Record<string, string>>(client, PREF.moduleIcons, NO_ICONS);
  const name = typeof workspace === "string" && workspace.trim() ? workspace.trim() : "Alpha";
  const order = ids(orderPref);
  const hidden = ids(hiddenPref);
  const icons = iconsPref && typeof iconsPref === "object" ? iconsPref : NO_ICONS;

  const [dialog, setDialog] = useState<{ kind: "move" | "above" | "icon"; module: ModuleCard } | { kind: "options" } | null>(null);
  const [said, setSaid] = useState(""); // announced politely to a screen reader
  const [trouble, setTrouble] = useState<string | null>(null); // what failed, for a few seconds
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; zone: "before" | "inside" | "after" } | null>(null);
  const refocus = useRef<string | null>(null);

  const byId = (id: string) => modules.find((m) => m.id === id);
  const fail = (what: string, e: unknown) => setTrouble(`Couldn't ${what}: ${e instanceof Error ? e.message : String(e)}`);
  useEffect(() => {
    if (!trouble) return;
    const timer = setTimeout(() => setTrouble(null), 8000);
    return () => clearTimeout(timer);
  }, [trouble]);
  // after a keyboard move the row is a new element: give it the focus again
  useEffect(() => {
    if (!refocus.current) return;
    const row = [...document.querySelectorAll<HTMLElement>("[data-module-id]")].find((el) => el.dataset.moduleId === refocus.current);
    if (row) {
      row.focus();
      refocus.current = null;
    }
  });

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

  /** Put module `id` under `parent` (null: the top), before or after `target`, or last when
   *  there is none. A new parent is the core's `moveModule`; the order is the person's own. */
  async function place(id: string, parent: string | null, target: string | null, after = false) {
    const m = byId(id);
    if (!m || !client) return;
    const now = m.parent && byId(m.parent) ? m.parent : null;
    try {
      if (parent !== now) {
        await client.moveModule(id, parent);
        onChanged();
      }
    } catch (e) {
      fail(`move ${m.name}`, e);
      return;
    }
    const err = await setOrder(withPlace(order, siblingsOf(modules, order, parent).map((s) => s.id), id, target, after));
    if (err) return fail(`save the order of ${m.name}`, err);
    refocus.current = id;
    setSaid(`Moved ${m.name} ${target ? `${after ? "below" : "above"} ${byId(target)?.name ?? "it"}` : parent ? `inside ${byId(parent)?.name ?? "it"}` : "to the top level"}.`);
  }

  async function hide(m: ModuleCard) {
    const err = await setHidden([...hidden.filter((h) => h !== m.id), m.id]);
    if (err) return fail(`hide ${m.name}`, err);
    setSaid(`${m.name} hidden. View options brings it back.`);
  }
  async function show(id: string) {
    const err = await setHidden(hidden.filter((h) => h !== id));
    if (err) return fail("show it again", err);
    setSaid(`${byId(id)?.name ?? "It"} is back on the sidebar.`);
  }
  async function makeParent(m: ModuleCard, newName: string) {
    if (!client) return;
    setDialog(null);
    try {
      const made = await client.createModule(newName, null, m.parent ?? null);
      await client.moveModule(m.id, made.id);
      setSaid(`${m.name} now sits inside ${made.name}.`);
      onChanged();
    } catch (e) {
      fail(`make ${newName}`, e);
    }
  }
  async function moveTo(m: ModuleCard, parent: string | null) {
    setDialog(null);
    await place(m.id, parent, null);
  }

  const moduleItems = (m: ModuleCard): ContextItem[] => [
    { label: "Open", icon: <OpenIcon />, onSelect: () => onGo({ kind: "module", id: m.id }) },
    { label: "Rename", icon: <RenameIcon />, onSelect: () => undefined, disabled: "Renaming a module isn't something this window can do yet." },
    { label: "Change icon", icon: <ChangeIconIcon />, onSelect: () => setDialog({ kind: "icon", module: m }) },
    { label: "Move…", icon: <MoveIcon />, onSelect: () => setDialog({ kind: "move", module: m }), separatorBefore: true },
    { label: "A new module above it…", icon: <AboveIcon />, onSelect: () => setDialog({ kind: "above", module: m }) },
    { label: "Hide", icon: <HideIcon />, onSelect: () => void hide(m), separatorBefore: true },
    { label: "Delete", icon: <DeleteIcon />, onSelect: () => undefined, danger: true, disabled: "The core can't delete a module from this window yet. Hide it to take it off the sidebar." },
    { label: "View options", icon: <ViewOptionsIcon />, onSelect: () => setDialog({ kind: "options" }), separatorBefore: true },
  ];
  const rowMenu = useContextMenu<Row>((r) => (r.kind === "people" ? [{ label: "Open", icon: <OpenIcon />, onSelect: () => onGo({ kind: "people" }) }] : moduleItems(r.module)));
  const workspaceMenu = useContextMenu<void>([
    { label: "Manage Workspace", icon: <BuildingIcon />, onSelect: () => undefined, disabled: "Alpha keeps one workspace for you today. Settings is where you rename it." },
    { label: "View options", icon: <ViewOptionsIcon />, onSelect: () => setDialog({ kind: "options" }) },
    { label: collapsed ? "Unfold the sidebar" : "Fold the sidebar", icon: collapsed ? <ChevronsRight /> : <ChevronsLeft />, onSelect: onToggleCollapsed },
    { label: "Sign out", icon: <SignOutIcon />, onSelect: () => undefined, disabled: "There is no account to sign out of: your workspace lives on this Mac.", separatorBefore: true },
  ]);

  /** Alt+arrows on a focused module: up and down reorder among its siblings, right moves it
   *  inside the one above, left moves it out below its parent. */
  function keyReorder(e: KeyboardEvent<HTMLElement>, m: ModuleCard) {
    if (!e.altKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const parent = m.parent && byId(m.parent) ? m.parent : null;
    const near = siblingsOf(modules, order, parent).filter((s) => !hidden.includes(s.id));
    const at = near.findIndex((s) => s.id === m.id);
    if (e.key === "ArrowUp" && at > 0) void place(m.id, parent, near[at - 1].id, false);
    else if (e.key === "ArrowDown" && at >= 0 && at < near.length - 1) void place(m.id, parent, near[at + 1].id, true);
    else if (e.key === "ArrowRight" && at > 0) void place(m.id, near[at - 1].id, null);
    else if (e.key === "ArrowLeft" && parent) {
      const up = byId(parent)?.parent;
      void place(m.id, up && byId(up) ? up : null, parent, true);
    }
  }

  // dragging a module over another: top and bottom quarters reorder, the middle moves it inside
  const mayDrop = (target: string) => Boolean(drag) && drag !== target && !isInside(modules, target, drag!);
  const dragProps = (m: ModuleCard) => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.setData("text/plain", m.id);
      e.dataTransfer.effectAllowed = "move";
      setDrag(m.id);
    },
    onDragEnd: () => {
      setDrag(null);
      setDrop(null);
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!mayDrop(m.id)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const r = e.currentTarget.getBoundingClientRect();
      const zone = dropZone(e.clientY - r.top, r.height);
      setDrop((d) => (d && d.id === m.id && d.zone === zone ? d : { id: m.id, zone }));
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop((d) => (d?.id === m.id ? null : d));
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!drag || !mayDrop(m.id)) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      const zone = dropZone(e.clientY - r.top, r.height);
      const moved = drag;
      setDrag(null);
      setDrop(null);
      if (zone === "inside") void place(moved, m.id, null);
      else void place(moved, m.parent && byId(m.parent) ? m.parent : null, m.id, zone === "after");
    },
  });

  const item = (o: { key: string; icon: ReactNode; label: string; onClick: () => void; current?: boolean; count?: number; depth?: number; fold?: { open: boolean; onToggle: () => void }; menu?: Row; module?: ModuleCard; className?: string }) => {
    const bound = o.menu ? rowMenu.bind(o.menu) : null;
    const dropHere = o.module && drop?.id === o.module.id ? ` navrow--drop-${drop.zone}` : "";
    return (
      <div key={o.key} className={`navrow${o.fold ? " navrow--fold" : ""}${o.module && drag === o.module.id ? " navrow--dragging" : ""}${dropHere}`} style={o.depth && !collapsed ? { paddingLeft: o.depth * 14 } : undefined} {...(o.module ? dragProps(o.module) : {})}>
        <button
          type="button"
          className={`navbtn${o.current ? " navbtn--current" : ""}${o.className ? ` ${o.className}` : ""}`}
          aria-current={o.current ? "page" : undefined}
          aria-label={o.label}
          title={collapsed ? o.label : undefined}
          data-module-id={o.module?.id}
          onClick={o.onClick}
          onContextMenu={bound?.onContextMenu}
          onKeyDown={(e) => {
            bound?.onKeyDown(e);
            if (o.module) keyReorder(e, o.module);
          }}
        >
          <span className="navbtn__ico" aria-hidden="true">
            {o.icon}
          </span>
          <span className="navbtn__text">{o.label}</span>
          {o.count ? <span className="navbtn__count">{o.count}</span> : null}
        </button>
        {o.fold && !collapsed ? (
          <button type="button" className="navfold" aria-label={o.fold.open ? `Fold ${o.label}` : `Unfold ${o.label}`} aria-expanded={o.fold.open} onClick={o.fold.onToggle}>
            {o.fold.open ? <ChevronDown size={ICON_SM} aria-hidden="true" /> : <ChevronRight size={ICON_SM} aria-hidden="true" />}
          </button>
        ) : null}
        {o.menu && !collapsed ? <IconButton size="sm" className="navmore" label={`More for ${o.label}`} icon={<MoreHorizontal size={ICON_SM} />} onClick={(e) => rowMenu.openFrom(o.menu!, e.currentTarget)} /> : null}
      </div>
    );
  };
  const go = (target: Surface, icon: ReactNode, label: string, count?: number) => item({ key: target.kind, icon, label, count, current: sameSurface(surface, target), onClick: () => onGo(target) });

  const branches = (list: ModuleBranch[], depth: number): ReactNode[] =>
    list.flatMap((b) => {
      const m = b.module;
      const open = !folded.has(m.id);
      const row = item({
        key: `module:${m.id}`,
        icon: iconNamed(icons[m.id], ICON),
        label: m.name,
        depth,
        current: sameSurface(surface, { kind: "module", id: m.id }),
        onClick: () => onGo({ kind: "module", id: m.id }),
        fold: b.inside.length ? { open, onToggle: () => toggleFold(m.id) } : undefined,
        menu: { kind: "module", module: m },
        module: m,
      });
      return open ? [row, ...branches(b.inside, depth + 1)] : [row];
    });
  const tree = treeOf(modules, order, hidden);
  const initial = [...name][0]?.toUpperCase() ?? "A";
  return (
    <nav className={collapsed ? "rail rail--collapsed" : "rail"} aria-label="Alpha">
      <div className="rail__top">
        <button type="button" className="wsbtn" aria-label={name} aria-haspopup="menu" title={collapsed ? name : undefined} onClick={(e) => workspaceMenu.openFrom(undefined, e.currentTarget)} onContextMenu={workspaceMenu.bind().onContextMenu}>
          <span className="wsbtn__tile" aria-hidden="true">
            {initial}
          </span>
          <span className="wsbtn__name">{name}</span>
          <ChevronDown className="wsbtn__chev" size={ICON_SM} aria-hidden="true" />
        </button>
        <IconButton className="rail__fold" size="sm" label={collapsed ? "Unfold the sidebar" : "Fold the sidebar"} aria-expanded={!collapsed} icon={collapsed ? <ChevronsRight size={ICON_SM} /> : <ChevronsLeft size={ICON_SM} />} onClick={onToggleCollapsed} />
      </div>
      <div className="rail__main">
        {go({ kind: "home" }, <HomeIcon />, "Home", needs)}
        {item({ key: "people", icon: <PeopleIcon />, label: "People & Companies", current: sameSurface(surface, { kind: "people" }), onClick: () => onGo({ kind: "people" }), menu: { kind: "people" } })}
        <div className="rail__scroll">
          {modules.length === 0 ? <p className="faint rail__none">None yet. Ask for one.</p> : tree.length === 0 ? <p className="faint rail__none">All hidden. View options brings them back.</p> : null}
          {branches(tree, 0)}
          <button type="button" className="navbtn navbtn--new" onClick={onNew} aria-label="New" title={collapsed ? "New" : undefined}>
            <span className="navbtn__ico" aria-hidden="true">
              <PlusIcon />
            </span>
            <span className="navbtn__text">New</span>
          </button>
        </div>
      </div>
      {trouble ? (
        <p className="rail__trouble" role="alert">
          {trouble}
        </p>
      ) : null}
      <div className="rail__bottom">
        {go({ kind: "intelligence" }, <IntelligenceIcon />, "Intelligence")}
        {go({ kind: "settings" }, <SettingsIcon />, "Settings")}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {said}
      </div>
      {rowMenu.menu}
      {workspaceMenu.menu}
      {dialog?.kind === "move" ? <MoveDialog module={dialog.module} modules={modules} onMove={(p) => void moveTo(dialog.module, p)} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "above" ? <NewAboveDialog module={dialog.module} onMake={(n) => void makeParent(dialog.module, n)} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "icon" ? (
        <IconDialog
          module={dialog.module}
          current={icons[dialog.module.id]}
          onClose={() => setDialog(null)}
          onPick={(pick) => {
            const target = dialog.module;
            setDialog(null);
            void setIcons({ ...icons, [target.id]: pick }).then((err) => (err ? fail(`change the icon of ${target.name}`, err) : setSaid(`${target.name} has a new icon.`)));
          }}
        />
      ) : null}
      {dialog?.kind === "options" ? <ViewOptionsDialog hidden={hidden.map(byId).filter((m): m is ModuleCard => Boolean(m))} onShow={(id) => void show(id)} onClose={() => setDialog(null)} /> : null}
    </nav>
  );
}
