/**
 * The sidebar (the UI rulebook §4), left of the frame. Top to bottom: the workspace button (the
 * top row, at the shared header height), Home with what needs the person, Network, the person's
 * projects (modules in the code) as a tree in their own order, New project, and pinned at the bottom
 * Intelligence and Settings. Only the module list scrolls. It holds nothing else: no headings,
 * no status lines, no agents, automations or records (9 Oct, the UI rulebook phase 2; the old
 * "Your modules" heading and "Alpha is running" went).
 *
 * The workspace button: a click opens its menu; a double-click on the name renames the workspace
 * in place, on the tile changes its logo (9 Oct, Vikas). The Activity bell sits in the assistant
 * panel's header since the owner's review (9 Oct).
 *
 * A module is dragged to reorder it or dropped on the middle of another to move it inside;
 * Alt+↑/↓ reorder from the keyboard, Alt+→ moves it inside the one above, Alt+← out. The order
 * is `PREF.moduleOrder`; a move into another module is the core's `moveModule`. Right-click a
 * module (or its ⋯) for its menu. Folded, each item is its icon with a tiny label under it.
 *
 * Network is shipped pre-built but sits among the projects like one (9 Oct, the owner): it is
 * reordered with them (its place is the id `network` in the same order, first until moved), and
 * its menu has a project's items; Rename and Delete stay disabled, and it never nests.
 */
import * as RadixPopover from "@radix-ui/react-popover";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { Client, ModuleCard } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { Button, IconButton, Tooltip, useContextMenu, type ContextItem } from "../ui";
import { SUBTITLES } from "../ui/subtitles";
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
  MoreVertical,
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
  /** Activity: not a page; asking for it opens the assistant panel's bell over the page that is open. */
  | { kind: "activity" }
  /** One Activity entry's own page (9 Oct, the owner: every element has a page). */
  | { kind: "entry"; id: string }
  | { kind: "intelligence"; tab?: string }
  | { kind: "settings" }
  | { kind: "people" }
  | { kind: "entity"; id: string }
  | { kind: "skill"; name: string }
  | { kind: "automation"; id: string }
  | { kind: "agent"; id: string }
  /** A connection's or a fact's own page, inside Intelligence (9 Oct, the owner: pages, not dialogs). */
  | { kind: "connection"; id: string }
  | { kind: "fact"; id: string }
  /** The New project page (9 Oct, the owner). */
  | { kind: "new-project" }
  | { kind: "module"; id: string }
  /** A record's own page (the UI rulebook §7); `id` is "new" for a record not yet made. */
  | { kind: "record"; module: string; table: string; id: string };

/** Whether sidebar item `b` is the current place `a`. */
export function sameSurface(a: Surface, b: Surface): boolean {
  if (b.kind === "people" && a.kind === "entity") return true; // a person's page is inside Network
  if (b.kind === "intelligence" && (a.kind === "skill" || a.kind === "automation" || a.kind === "agent" || a.kind === "connection" || a.kind === "fact")) return true; // item pages live under Intelligence
  if (b.kind === "module" && a.kind === "record") return a.module === b.id; // a record's page is inside its module
  if (a.kind !== b.kind) return false;
  if (a.kind === "module" && b.kind === "module") return a.id === b.id;
  return true;
}

export { treeOf, type ModuleBranch };

/** The workspace's name until the person gives it one (9 Oct, the owner). */
export const DEFAULT_WORKSPACE = "Kenil's workspace";

const FOLDED_KEY = "alpha.rail.folded";
function readFolded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLDED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** A remembered place that no longer exists (an older build's) becomes Home. Intelligence's old
 *  Activity tab is the bell now, and its old Map tab lives in Second Brain (9 Oct). */
export function knownSurface(value: unknown): Surface {
  const s = value as Surface | null;
  if (s && s.kind === "intelligence" && s.tab === "activity") return { kind: "activity" };
  if (s && s.kind === "intelligence" && s.tab === "map") return { kind: "intelligence", tab: "second-brain" };
  if (s && (s.kind === "home" || s.kind === "activity" || s.kind === "intelligence" || s.kind === "settings" || s.kind === "people" || s.kind === "new-project" || (s.kind === "record" && typeof s.module === "string" && typeof s.table === "string" && typeof s.id === "string") || ((s.kind === "module" || s.kind === "entity" || s.kind === "entry" || s.kind === "automation" || s.kind === "agent" || s.kind === "connection" || s.kind === "fact") && typeof s.id === "string") || (s.kind === "skill" && typeof s.name === "string"))) return s;
  return { kind: "home" };
}

const NO_IDS: string[] = [];
const NO_ICONS: Record<string, string> = {};
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : NO_IDS);

/** Network's place among the projects: its id in `PREF.moduleOrder` and the hidden list. */
export const NETWORK = "network";
const NETWORK_FIXED = "Network is pre-built; renaming or deleting it needs Alpha's core";
const NETWORK_CARD: ModuleCard = { id: NETWORK, name: "Network", goal: null, parent: null, tables: [], records: 0, last_at: null, last_text: null, threads: [], created_at: "" };

type Row = { kind: "module"; module: ModuleCard };

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
  const [workspace, setWorkspace] = usePreference<string>(client, PREF.workspaceName, DEFAULT_WORKSPACE);
  const [logoPref, setLogo] = usePreference<string | null>(client, PREF.workspaceLogo, null);
  const logo = typeof logoPref === "string" ? logoPref : "";
  const [orderPref, setOrder] = usePreference<string[]>(client, PREF.moduleOrder, NO_IDS);
  const [hiddenPref, setHidden] = usePreference<string[]>(client, PREF.hiddenModules, NO_IDS);
  const [iconsPref, setIcons] = usePreference<Record<string, string>>(client, PREF.moduleIcons, NO_ICONS);
  const name = typeof workspace === "string" && workspace.trim() ? workspace.trim() : DEFAULT_WORKSPACE;
  const stored = ids(orderPref);
  const order = stored.includes(NETWORK) ? stored : [NETWORK, ...stored]; // Network first until moved
  const all = [...modules, NETWORK_CARD];
  const hidden = ids(hiddenPref);
  const icons = iconsPref && typeof iconsPref === "object" ? iconsPref : NO_ICONS;

  const [dialog, setDialog] = useState<{ kind: "move" | "above" | "icon"; module: ModuleCard } | { kind: "options" } | null>(null);
  const [said, setSaid] = useState(""); // announced politely to a screen reader
  const [trouble, setTrouble] = useState<string | null>(null); // what failed, for a few seconds
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; zone: "before" | "inside" | "after" } | null>(null);
  const refocus = useRef<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [logoOpen, setLogoOpen] = useState(false);
  const clickTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  const byId = (id: string) => all.find((m) => m.id === id);
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
    if ((id === NETWORK || parent === NETWORK) && parent !== null) return; // Network never nests
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
    const err = await setOrder(withPlace(order, siblingsOf(all, order, parent).map((s) => s.id), id, target, after));
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

  const networkItems = (m: ModuleCard): ContextItem[] => [
    { label: "Open", icon: <OpenIcon />, onSelect: () => onGo({ kind: "people" }) },
    { label: "Rename", icon: <RenameIcon />, onSelect: () => undefined, disabled: NETWORK_FIXED },
    { label: "Change icon", icon: <ChangeIconIcon />, onSelect: () => setDialog({ kind: "icon", module: m }) },
    { label: "Move…", icon: <MoveIcon />, onSelect: () => undefined, disabled: "Network stays at the top level; drag it, or Alt+↑/↓, to reorder it.", separatorBefore: true },
    { label: "Hide", icon: <HideIcon />, onSelect: () => void hide(m), separatorBefore: true },
    { label: "Delete", icon: <DeleteIcon />, onSelect: () => undefined, danger: true, disabled: NETWORK_FIXED },
    { label: "View options", icon: <ViewOptionsIcon />, onSelect: () => setDialog({ kind: "options" }), separatorBefore: true },
  ];
  const moduleItems = (m: ModuleCard): ContextItem[] => [
    { label: "Open", icon: <OpenIcon />, onSelect: () => onGo({ kind: "module", id: m.id }) },
    { label: "Rename", icon: <RenameIcon />, onSelect: () => undefined, disabled: "Renaming a project isn't something this window can do yet." },
    { label: "Change icon", icon: <ChangeIconIcon />, onSelect: () => setDialog({ kind: "icon", module: m }) },
    { label: "Move…", icon: <MoveIcon />, onSelect: () => setDialog({ kind: "move", module: m }), separatorBefore: true },
    { label: "A new project above it…", icon: <AboveIcon />, onSelect: () => setDialog({ kind: "above", module: m }) },
    { label: "Hide", icon: <HideIcon />, onSelect: () => void hide(m), separatorBefore: true },
    { label: "Delete", icon: <DeleteIcon />, onSelect: () => undefined, danger: true, disabled: "The core can't delete a project from this window yet. Hide it to take it off the sidebar." },
    { label: "View options", icon: <ViewOptionsIcon />, onSelect: () => setDialog({ kind: "options" }), separatorBefore: true },
  ];
  const rowMenu = useContextMenu<Row>((r) => (r.module.id === NETWORK ? networkItems(r.module) : moduleItems(r.module)));
  const workspaceMenu = useContextMenu<void>([
    { label: "Rename", icon: <RenameIcon />, onSelect: () => setRenaming(true), disabled: collapsed ? "Unfold the sidebar to rename the workspace." : undefined },
    { label: "Change logo…", icon: <ChangeIconIcon />, onSelect: () => setLogoOpen(true) },
    { label: "Manage Workspace", icon: <BuildingIcon />, onSelect: () => undefined, disabled: "Alpha keeps one workspace for you today.", separatorBefore: true },
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
    const near = siblingsOf(all, order, parent).filter((s) => !hidden.includes(s.id));
    const at = near.findIndex((s) => s.id === m.id);
    const nests = m.id !== NETWORK && at > 0 && near[at - 1].id !== NETWORK;
    if (e.key === "ArrowUp" && at > 0) void place(m.id, parent, near[at - 1].id, false);
    else if (e.key === "ArrowDown" && at >= 0 && at < near.length - 1) void place(m.id, parent, near[at + 1].id, true);
    else if (e.key === "ArrowRight" && nests) void place(m.id, near[at - 1].id, null);
    else if (e.key === "ArrowLeft" && parent) {
      const up = byId(parent)?.parent;
      void place(m.id, up && byId(up) ? up : null, parent, true);
    }
  }

  // dragging a module over another: top and bottom quarters reorder, the middle moves it inside
  const mayDrop = (target: string) => Boolean(drag) && drag !== target && !isInside(modules, target, drag!) && !(drag === NETWORK && byId(target)?.parent);
  /** Where a drop on `m` lands; Network neither takes a project inside nor goes inside one. */
  const zoneOn = (m: ModuleCard, e: DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const zone = dropZone(e.clientY - r.top, r.height);
    if (zone !== "inside" || (m.id !== NETWORK && drag !== NETWORK)) return zone;
    return e.clientY - r.top < r.height / 2 ? "before" : "after";
  };
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
    // WebKit (the Mac app's engine) drops only on an element whose dragenter was cancelled too;
    // without it a drop onto another project never fired there (9 Oct, the owner: "nesting is broken").
    onDragEnter: (e: DragEvent<HTMLElement>) => {
      if (mayDrop(m.id)) e.preventDefault();
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!mayDrop(m.id)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const zone = zoneOn(m, e);
      setDrop((d) => (d && d.id === m.id && d.zone === zone ? d : { id: m.id, zone }));
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop((d) => (d?.id === m.id ? null : d));
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!drag || !mayDrop(m.id)) return;
      e.preventDefault();
      const zone = zoneOn(m, e);
      const moved = drag;
      setDrag(null);
      setDrop(null);
      if (zone === "inside") void place(moved, m.id, null);
      else void place(moved, m.parent && byId(m.parent) ? m.parent : null, m.id, zone === "after");
    },
  });

  const item = (o: { key: string; icon: ReactNode; label: string; onClick: () => void; current?: boolean; count?: number; depth?: number; fold?: { open: boolean; onToggle: () => void }; menu?: Row; module?: ModuleCard; className?: string; hint?: string }) => {
    const bound = o.menu ? rowMenu.bind(o.menu) : null;
    const dropHere = o.module && drop?.id === o.module.id ? ` navrow--drop-${drop.zone}` : "";
    const button = (
      <button
        type="button"
        className={`navbtn${o.current ? " navbtn--current" : ""}${o.className ? ` ${o.className}` : ""}`}
        aria-current={o.current ? "page" : undefined}
        aria-label={o.label}
        title={collapsed && !o.hint ? o.label : undefined}
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
    );
    return (
      <div key={o.key} className={`navrow${o.fold ? " navrow--fold" : ""}${o.module && drag === o.module.id ? " navrow--dragging" : ""}${dropHere}`} style={o.depth && !collapsed ? { paddingLeft: o.depth * 14 } : undefined} {...(o.module ? dragProps(o.module) : {})}>
        {o.hint ? <Tooltip text={collapsed ? `${o.label} — ${o.hint}` : o.hint}>{button}</Tooltip> : button}
        {o.fold && !collapsed ? (
          <button type="button" className="navfold" aria-label={o.fold.open ? `Fold ${o.label}` : `Unfold ${o.label}`} aria-expanded={o.fold.open} onClick={o.fold.onToggle}>
            {o.fold.open ? <ChevronDown size={ICON_SM} aria-hidden="true" /> : <ChevronRight size={ICON_SM} aria-hidden="true" />}
          </button>
        ) : null}
        {o.menu && !collapsed ? <IconButton size="sm" className="navmore" label={`More for ${o.label}`} icon={<MoreVertical size={ICON_SM} />} onClick={(e) => rowMenu.openFrom(o.menu!, e.currentTarget)} /> : null}
      </div>
    );
  };
  const go = (target: Surface, icon: ReactNode, label: string, count?: number, hint?: string) => item({ key: target.kind, icon, label, count, hint, current: sameSurface(surface, target), onClick: () => onGo(target) });

  const branches = (list: ModuleBranch[], depth: number): ReactNode[] =>
    list.flatMap((b) => {
      const m = b.module;
      if (m.id === NETWORK) {
        const icon = icons[NETWORK] ? iconNamed(icons[NETWORK], ICON) : <PeopleIcon />;
        return [item({ key: "people", icon, label: m.name, depth, current: sameSurface(surface, { kind: "people" }), onClick: () => onGo({ kind: "people" }), menu: { kind: "module", module: m }, module: m })];
      }
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
  const tree = treeOf(all, order, hidden);

  // One click opens the menu, a moment later so a double-click can edit instead; a keyboard
  // click (no pointer, `detail` 0) opens it at once.
  const wsClick = (e: MouseEvent<HTMLButtonElement>) => {
    const at = e.currentTarget;
    window.clearTimeout(clickTimer.current);
    if (e.detail === 0) workspaceMenu.openFrom(undefined, at);
    else if (e.detail === 1) clickTimer.current = window.setTimeout(() => workspaceMenu.openFrom(undefined, at), 220);
  };
  const wsDouble = (e: MouseEvent<HTMLButtonElement>) => {
    window.clearTimeout(clickTimer.current);
    if ((e.target as Element).closest(".wsbtn__tile")) setLogoOpen(true);
    else if (!collapsed) setRenaming(true);
  };
  async function rename(next: string) {
    setRenaming(false);
    const clean = next.trim();
    if (!clean || clean === name) return;
    const err = await setWorkspace(clean);
    if (err) fail("rename the workspace", err);
  }
  async function saveLogo(next: string | null) {
    setLogoOpen(false);
    const err = await setLogo(next);
    if (err) fail("change the logo", err);
  }
  return (
    <nav className={collapsed ? "rail rail--collapsed" : "rail"} aria-label="Alpha">
      <RadixPopover.Root open={logoOpen} onOpenChange={setLogoOpen}>
        <RadixPopover.Anchor asChild>
          <div className="rail__top">
            {renaming ? (
              <div className="wsbtn wsbtn--edit">
                <WorkspaceTile logo={logo} name={name} className="wsbtn__tile" />
                <NameInput name={name} onDone={(v) => void rename(v)} onCancel={() => setRenaming(false)} />
              </div>
            ) : (
              <button type="button" className="wsbtn" aria-label={name} aria-haspopup="menu" title={collapsed ? name : undefined} onClick={wsClick} onDoubleClick={wsDouble} onContextMenu={workspaceMenu.bind().onContextMenu}>
                <WorkspaceTile logo={logo} name={name} className="wsbtn__tile" />
                <span className="wsbtn__name">{name}</span>
                <ChevronDown className="wsbtn__chev" size={ICON_SM} aria-hidden="true" />
              </button>
            )}
            <IconButton className="rail__fold" size="sm" label={collapsed ? "Unfold the sidebar" : "Fold the sidebar"} aria-expanded={!collapsed} icon={collapsed ? <ChevronsRight size={ICON_SM} /> : <ChevronsLeft size={ICON_SM} />} onClick={onToggleCollapsed} />
          </div>
        </RadixPopover.Anchor>
        <RadixPopover.Portal>
          <RadixPopover.Content className="menu__list wslogo" align="start" sideOffset={4} aria-label="Workspace logo">
            <LogoPicker hasLogo={Boolean(logo)} onPick={(v) => void saveLogo(v)} onTrouble={(e) => fail("use that image", e)} />
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>
      <div className="rail__main">
        {go({ kind: "home" }, <HomeIcon />, "Home", needs)}
        <div className="rail__scroll">
          {tree.length === 0 ? <p className="faint rail__none">All hidden. View options brings them back.</p> : null}
          {branches(tree, 0)}
          {modules.length === 0 ? <p className="faint rail__none">No projects yet. Ask for one.</p> : null}
          <button type="button" className="navbtn navbtn--new" onClick={onNew} aria-label="New project" title={collapsed ? "New project" : undefined}>
            <span className="navbtn__ico" aria-hidden="true">
              <PlusIcon />
            </span>
            <span className="navbtn__text">New project</span>
          </button>
        </div>
      </div>
      {trouble ? (
        <p className="rail__trouble" role="alert">
          {trouble}
        </p>
      ) : null}
      <div className="rail__bottom">
        {go({ kind: "intelligence" }, <IntelligenceIcon />, "Intelligence", undefined, SUBTITLES.intelligence)}
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

/** The workspace's tile: its logo (an image, or a letter or emoji the person chose), else the
 *  first letter of its name. Settings shows the same tile. */
export function WorkspaceTile({ logo, name, className }: { logo: string; name: string; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      {logo.startsWith("data:image/") ? <img src={logo} alt="" /> : logo || ([...name][0]?.toUpperCase() ?? "A")}
    </span>
  );
}

/** The workspace's name, edited in place: Enter or clicking away saves, Escape cancels. */
function NameInput({ name, onDone, onCancel }: { name: string; onDone: (v: string) => void; onCancel: () => void }) {
  const cancelled = useRef(false);
  return (
    <input
      className="wsbtn__input"
      aria-label="Workspace name"
      defaultValue={name}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.preventDefault(); // the sidebar does not fold on this Escape
          cancelled.current = true;
          onCancel();
        }
      }}
      onBlur={(e) => {
        if (!cancelled.current) onDone(e.currentTarget.value);
      }}
    />
  );
}

/** An image file as a PNG data URL no larger than 128px a side, so it is small enough to keep
 *  as a preference. */
async function smallImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 128 / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("this window can't draw images");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The workspace logo's choices: an image, a letter or emoji, or none (the name's first letter). */
function LogoPicker({ hasLogo, onPick, onTrouble }: { hasLogo: boolean; onPick: (logo: string | null) => void; onTrouble: (e: unknown) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [mark, setMark] = useState("");
  const short = [...mark.trim()].slice(0, 2).join("");
  return (
    <div className="wslogo__body">
      <Button size="sm" onClick={() => file.current?.click()}>
        Upload image
      </Button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        aria-label="Logo image"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) smallImage(f).then(onPick, onTrouble);
        }}
      />
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (short) onPick(short); }}>
        <input className="textfield wslogo__mark" value={mark} onChange={(e) => setMark(e.target.value)} placeholder="A or 🚀" aria-label="Letter or emoji" />
        <Button size="sm" type="submit" disabledReason={short ? undefined : "Type a letter or an emoji first."}>
          Use
        </Button>
      </form>
      <Button size="sm" variant="ghost" disabledReason={hasLogo ? undefined : "There is no logo to remove."} onClick={() => onPick(null)}>
        Remove
      </Button>
    </div>
  );
}
