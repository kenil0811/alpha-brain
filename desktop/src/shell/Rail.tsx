/**
 * The sidebar: Home, Activity, People & Companies, the person's modules as a tree, New, then the
 * Assistant, Intelligence, Settings and the core's state. Section 5 of Q42 (13 Oct; the features
 * from pull request #5, the look main's own) adds the person's own arrangement of the modules:
 * dragged into their own order or into another module (the core's move, journaled), Alt+arrows
 * from the keyboard, an icon each (picked from the name until the person picks one), hidden from
 * the sidebar and shown again, and the workspace's name (double-click it). A right-click on a
 * module opens its menu (Kenil: "i dont want three dot, just right click is enough"); the
 * keyboard's menu key or Shift+F10 opens it too. All of it is kept in the world's preferences.
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { say, type Client, type ModuleCard } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { Button, IconButton, Popover } from "../ui";
import { HomeIcon, ActivityIcon, PeopleIcon, AssistantIcon, IntelligenceIcon, SettingsIcon, PlusIcon, ChevronsLeft, ChevronsRight, ChevronRight, Check, HideIcon, X } from "../ui/icons";
import { iconFor, iconFromName, MODULE_ICONS, useModuleIcons } from "./moduleIcons";
import { RemoveModuleDialog } from "./RemoveModule";
import { dropZone, existing, isInside, siblingsOf, treeOf, withPlace, type DropZone, type ModuleBranch } from "./sidebarOrder";

export type Surface =
  | { kind: "home" }
  | { kind: "activity" }
  | { kind: "assistant"; id?: string }
  | { kind: "intelligence"; tab?: string }
  | { kind: "settings" }
  | { kind: "people" }
  | { kind: "entity"; id: string }
  | { kind: "skill"; name: string }
  | { kind: "automation"; id: string }
  /** `table`: the module opened on that table's tab. */
  | { kind: "module"; id: string; table?: string }
  /** One record's own page; `module` is the module its table belongs to, when it has one. */
  | { kind: "record"; table: string; id: string; module?: string };

/** Whether rail item `b` is the current place `a`. */
export function sameSurface(a: Surface, b: Surface): boolean {
  if (b.kind === "people" && a.kind === "entity") return true; // a person's page is inside People & Companies
  if (b.kind === "intelligence" && (a.kind === "skill" || a.kind === "automation")) return true; // item pages live under Intelligence
  if (b.kind === "assistant" && a.kind === "assistant") return true; // any conversation open on the page
  if (a.kind === "record" && b.kind === "module") return a.module === b.id; // a record's page is inside its module
  if (a.kind !== b.kind) return false;
  if (a.kind === "module" && b.kind === "module") return a.id === b.id;
  return true;
}

export { treeOf, type ModuleBranch } from "./sidebarOrder";

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
  if (s && (s.kind === "home" || s.kind === "activity" || s.kind === "assistant" || s.kind === "intelligence" || s.kind === "settings" || s.kind === "people" || ((s.kind === "module" || s.kind === "entity" || s.kind === "automation") && typeof s.id === "string") || (s.kind === "skill" && typeof s.name === "string") || (s.kind === "record" && typeof s.table === "string" && typeof s.id === "string"))) return s;
  return { kind: "home" };
}

const NO_IDS: string[] = [];

/** What the right-click menu is open on, and where. */
type MenuAt = { module: ModuleCard; x: number; y: number };

export function Rail({
  client = null,
  surface,
  modules,
  needs,
  runtime,
  onGo,
  onNew,
  onChanged,
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
  /** A module moved: the window reads the modules again. */
  onChanged?: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [folded, setFolded] = useState<Set<string>>(readFolded);
  const keepFolded = (next: Set<string>) => {
    try {
      localStorage.setItem(FOLDED_KEY, JSON.stringify([...next]));
    } catch {
      /* per-window convenience */
    }
    return next;
  };
  const toggleFold = (id: string) =>
    setFolded((f) => {
      const next = new Set(f);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return keepFolded(next);
    });
  const unfold = (id: string) =>
    setFolded((f) => {
      if (!f.has(id)) return f;
      const next = new Set(f);
      next.delete(id);
      return keepFolded(next);
    });

  const [orderPref, setOrder] = usePreference<string[]>(client, PREF.sidebarOrder, NO_IDS);
  const [hiddenPref, setHidden] = usePreference<string[]>(client, PREF.sidebarHidden, NO_IDS);
  const [icons, setIcons] = useModuleIcons(client);
  const [workspace, setWorkspace] = usePreference<string | null>(client, PREF.workspaceName, null);
  const order = existing(orderPref, modules);
  const hidden = existing(hiddenPref, modules);
  const name = typeof workspace === "string" && workspace.trim() ? workspace.trim() : "Alpha";

  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [drag, setDragState] = useState<string | null>(null);
  const dragging = useRef<string | null>(null); // read by the drag events, which can come before a render
  const setDrag = (id: string | null) => {
    dragging.current = id;
    setDragState(id);
  };
  const [over, setOver] = useState<{ id: string; zone: DropZone } | null>(null);
  const [renaming, setRenaming] = useState(false);
  // a module renamed in place, and one being taken away (slice 2 A1, A3)
  const [renamingModule, setRenamingModule] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ModuleCard | null>(null);
  const skipRefocus = useRef(false);
  const refocus = useRef<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const byId = (id: string | null | undefined) => modules.find((m) => m.id === id);
  const parentOf = (m: ModuleCard) => (m.parent && byId(m.parent) ? m.parent : null);
  const fail = (what: string, why: string) => setNote(`Couldn't ${what}: ${why}`);

  // after a keyboard move the module's row keeps the focus
  useEffect(() => {
    const id = refocus.current;
    if (!id) return;
    refocus.current = null;
    navRef.current?.querySelector<HTMLElement>(`[data-module="${CSS.escape(id)}"]`)?.focus();
  });

  /** Put module `id` before or after `target`, or inside it: the core moves it when its parent
   *  changes (journaled, as on the module's page); the order is the person's own. */
  async function place(id: string, target: string, zone: DropZone) {
    const m = byId(id);
    const t = byId(target);
    if (!m || !t || id === target || isInside(modules, target, id)) return;
    setNote(null);
    const parent = zone === "inside" ? t.id : parentOf(t);
    if (parent !== parentOf(m)) {
      if (!client) return fail(`move ${m.name}`, "Alpha's core isn't connected yet.");
      try {
        await client.moveModule(id, parent);
      } catch (e) {
        return fail(`move ${m.name}`, say(e));
      }
      if (parent) unfold(parent);
      onChanged?.();
    }
    const siblings = siblingsOf(modules, order, parent).map((s) => s.id);
    const err = await setOrder(withPlace(order, siblings, id, zone === "inside" ? null : target, zone === "after"));
    if (err) fail(`keep the order of ${m.name}`, err);
  }

  async function moveTo(m: ModuleCard, parent: string | null) {
    if (!client) return fail(`move ${m.name}`, "Alpha's core isn't connected yet.");
    setNote(null);
    try {
      await client.moveModule(m.id, parent);
    } catch (e) {
      return fail(`move ${m.name}`, say(e));
    }
    if (parent) unfold(parent);
    // it goes at the end of where it now sits until it is moved again
    const err = await setOrder(withPlace(order, siblingsOf(modules, order, parent).map((s) => s.id), m.id, null));
    if (err) fail(`keep the order of ${m.name}`, err);
    onChanged?.();
  }

  async function hide(m: ModuleCard) {
    setNote(null);
    const err = await setHidden([...hidden.filter((h) => h !== m.id), m.id]);
    if (err) fail(`hide ${m.name}`, err);
  }
  async function show(id: string) {
    setNote(null);
    const err = await setHidden(hidden.filter((h) => h !== id));
    if (err) fail(`show ${byId(id)?.name ?? "it"}`, err);
  }
  async function pickIcon(m: ModuleCard, icon: string | null) {
    const next = { ...icons };
    if (icon) next[m.id] = icon;
    else delete next[m.id];
    const err = await setIcons(next);
    if (err) fail(`change the icon of ${m.name}`, err);
  }
  async function renameModule(m: ModuleCard, next: string) {
    if (renamingModule !== m.id) return; // Enter saved it already; this is the blur after
    setRenamingModule(null);
    const clean = next.trim();
    if (clean === m.name) return;
    if (!client) return fail(`rename ${m.name}`, "Alpha's core isn't connected yet.");
    setNote(null);
    try {
      await client.renameModule(m.id, clean);
      onChanged?.();
    } catch (e) {
      fail(`rename ${m.name}`, say(e));
    }
  }
  async function rename(next: string) {
    setRenaming(false);
    const clean = next.trim();
    if (clean === (typeof workspace === "string" ? workspace.trim() : "") || (!clean && name === "Alpha")) return;
    const err = await setWorkspace(clean && clean !== "Alpha" ? clean : null);
    if (err) fail("rename the workspace", err);
  }

  /** Alt+arrows on a module: up and down reorder it among the ones beside it, right puts it
   *  inside the one above, left takes it out of the one it is in. */
  function keyMove(e: KeyboardEvent<HTMLButtonElement>, m: ModuleCard) {
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ module: m, x: r.left + 24, y: r.bottom });
      return;
    }
    if (!e.altKey || collapsed) return;
    const parent = parentOf(m);
    const near = siblingsOf(modules, order, parent).filter((s) => !hidden.includes(s.id));
    const at = near.findIndex((s) => s.id === m.id);
    let move: [string, DropZone] | null = null;
    if (e.key === "ArrowUp" && at > 0) move = [near[at - 1].id, "before"];
    else if (e.key === "ArrowDown" && at >= 0 && at < near.length - 1) move = [near[at + 1].id, "after"];
    else if (e.key === "ArrowRight" && at > 0) move = [near[at - 1].id, "inside"];
    else if (e.key === "ArrowLeft" && parent) move = [parent, "after"];
    if (!move) return;
    e.preventDefault();
    refocus.current = m.id;
    void place(m.id, ...move);
  }

  // dragging a module over another: the top and bottom quarters put it above or below, the middle inside
  const mayDrop = (target: string) => {
    const d = dragging.current;
    return Boolean(d) && d !== target && !isInside(modules, target, d!);
  };
  const dragProps = (m: ModuleCard) =>
    collapsed
      ? {}
      : {
          onDragEnter: (e: DragEvent<HTMLDivElement>) => {
            // WebKit (the Mac app) drops only where dragenter was cancelled too (pull request #5's finding)
            if (mayDrop(m.id)) e.preventDefault();
          },
          onDragOver: (e: DragEvent<HTMLDivElement>) => {
            if (!mayDrop(m.id)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const r = e.currentTarget.getBoundingClientRect();
            const zone = dropZone(e.clientY - r.top, r.height);
            if (over?.id !== m.id || over.zone !== zone) setOver({ id: m.id, zone });
          },
          onDragLeave: (e: DragEvent<HTMLDivElement>) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o?.id === m.id ? null : o));
          },
          onDrop: (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            const moved = dragging.current;
            // where it lands is read from the drop itself, never from the last drawn state
            const r = e.currentTarget.getBoundingClientRect();
            const zone = dropZone(e.clientY - r.top, r.height);
            setDrag(null);
            setOver(null);
            if (moved && moved !== m.id) void place(moved, m.id, zone);
          },
        };

  const item = (target: Surface, icon: ReactNode, label: string, count?: number, depth = 0, fold?: { open: boolean; onToggle: () => void }, module?: ModuleCard) => {
    const current = sameSurface(surface, target);
    const key = target.kind === "module" || target.kind === "entity" || target.kind === "automation" ? `${target.kind}:${target.id}` : target.kind === "skill" ? `skill:${target.name}` : target.kind;
    const drop = module && over?.id === module.id ? ` navrow--drop-${over.zone}` : "";
    if (module && renamingModule === module.id && !collapsed) {
      return (
        <div key={key} className="navrow" style={depth ? { paddingLeft: depth * 14 } : undefined}>
          <input
            className="textfield rail__rename"
            aria-label={`New name for ${module.name}`}
            defaultValue={module.name}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void renameModule(module, e.currentTarget.value);
              if (e.key === "Escape") setRenamingModule(null);
            }}
            onBlur={(e) => void renameModule(module, e.currentTarget.value)}
          />
        </div>
      );
    }
    return (
      <div key={key} className={`navrow${drop}${module && drag === module.id ? " navrow--dragging" : ""}`} style={depth ? { paddingLeft: depth * 14 } : undefined} {...(module ? dragProps(module) : {})}>
        <button
          type="button"
          className={`navbtn${current ? " navbtn--current" : ""}`}
          aria-current={current ? "page" : undefined}
          aria-label={label}
          title={collapsed ? label : undefined}
          onClick={() => onGo(target)}
          {...(module
            ? {
                "data-module": module.id,
                draggable: !collapsed,
                onDragStart: (e: DragEvent<HTMLButtonElement>) => {
                  e.dataTransfer.setData("text/plain", module.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDrag(module.id);
                },
                onDragEnd: () => {
                  setDrag(null);
                  setOver(null);
                },
                onContextMenu: (e: MouseEvent<HTMLButtonElement>) => {
                  e.preventDefault();
                  setMenu({ module, x: e.clientX, y: e.clientY });
                },
                onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => keyMove(e, module),
              }
            : {})}
        >
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
      const { Icon } = iconFor(icons, b.module.id, b.module.name);
      const row = item({ kind: "module", id: b.module.id }, <Icon />, b.module.name, undefined, depth, b.inside.length ? { open, onToggle: () => toggleFold(b.module.id) } : undefined, b.module);
      return open ? [row, ...branches(b.inside, depth + 1)] : [row];
    });
  const status = runtime === "connected" ? "Alpha is running" : runtime === "connecting" ? "Starting" : runtime === "lost" ? "Core not answering" : "Core not running";
  const where = (m: ModuleCard) => (m.path && m.path.length > 1 ? m.path.join(" › ") : m.name);
  const m = menu?.module;
  const pickedIcon = m ? icons[m.id] : undefined;
  const fromName = m ? MODULE_ICONS.find((c) => c.name === iconFromName(m.name)) ?? MODULE_ICONS[0] : null;
  const destinations = m ? modules.filter((x) => x.id !== m.id && x.id !== parentOf(m) && !isInside(modules, x.id, m.id)).sort((a, b) => where(a).localeCompare(where(b))) : [];
  return (
    <nav ref={navRef} className={collapsed ? "rail rail--collapsed" : "rail"} aria-label="Alpha">
      <div className="brand">
        <div className="brand__mark" aria-hidden="true">
          A
        </div>
        {renaming && !collapsed ? (
          <input
            className="textfield brand__input"
            aria-label="The workspace's name"
            defaultValue={name === "Alpha" ? "" : name}
            placeholder="Alpha"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void rename(e.currentTarget.value);
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={(e) => void rename(e.currentTarget.value)}
          />
        ) : (
          <b
            className="brand__name"
            tabIndex={collapsed ? -1 : 0}
            title="Double-click to rename the workspace"
            onDoubleClick={() => !collapsed && setRenaming(true)}
            onKeyDown={(e) => {
              if (e.key === "F2" || e.key === "Enter") setRenaming(true);
            }}
          >
            {name}
          </b>
        )}
        <IconButton className="rail__fold" label={collapsed ? "Expand the sidebar" : "Collapse the sidebar"} aria-expanded={!collapsed} icon={collapsed ? <ChevronsRight /> : <ChevronsLeft />} onClick={onToggleCollapsed} />
      </div>
      {item({ kind: "home" }, <HomeIcon />, "Home", needs)}
      {item({ kind: "activity" }, <ActivityIcon />, "Activity")}
      {item({ kind: "people" }, <PeopleIcon />, "People & Companies")}
      <div className="rail__scroll">
        <div className="rail__group">Your modules</div>
        {modules.length === 0 ? <p className="faint" style={{ padding: "4px 10px" }}>None yet. Ask for one.</p> : null}
        {branches(treeOf(modules, order, hidden), 0)}
        {note ? (
          <p className="rail__note" role="alert">
            {note}
            <IconButton size="sm" label="Dismiss" icon={<X />} onClick={() => setNote(null)} />
          </p>
        ) : null}
        <button type="button" className="navbtn navbtn--new" onClick={onNew} aria-label="New" title={collapsed ? "New" : undefined}>
          <span className="navbtn__ico" aria-hidden="true" style={{ color: "var(--primary)" }}>
            <PlusIcon />
          </span>
          <span className="navbtn__text">New</span>
        </button>
        {hidden.length && !collapsed ? (
          <Popover
            label="Hidden from the sidebar"
            align="start"
            side="right"
            trigger={
              <button type="button" className="navbtn navbtn--quiet rail__hidden">
                <span className="navbtn__ico" aria-hidden="true">
                  <HideIcon />
                </span>
                <span className="navbtn__text">Hidden · {hidden.length}</span>
              </button>
            }
          >
            <div className="colmenu">
              <div className="menu__head">Hidden from the sidebar</div>
              {hidden.map((id) => {
                const h = byId(id)!;
                const { Icon } = iconFor(icons, h.id, h.name);
                return (
                  <div key={id} className="menu__item rail__hiddenrow">
                    <Icon size={15} aria-hidden="true" />
                    <span className="navbtn__text">{where(h)}</span>
                    <Button size="sm" onClick={() => void show(id)}>
                      Show in the sidebar
                    </Button>
                  </div>
                );
              })}
            </div>
          </Popover>
        ) : null}
      </div>
      {item({ kind: "assistant" }, <AssistantIcon />, "Assistant")}
      {item({ kind: "intelligence" }, <IntelligenceIcon />, "Intelligence")}
      {item({ kind: "settings" }, <SettingsIcon />, "Settings")}
      <div className={`rail__status rail__status--${runtime}`} role="status" title={collapsed ? status : undefined}>
        <i aria-hidden="true" />
        <span className="rail__status-text">{status}</span>
      </div>
      <DropdownMenu.Root open={menu !== null} onOpenChange={(o) => !o && setMenu(null)} modal={false}>
        <DropdownMenu.Trigger asChild>
          <span className="ctxanchor" style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} aria-hidden="true" tabIndex={-1} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="menu__list popover"
            align="start"
            sideOffset={2}
            collisionPadding={8}
            aria-label={m ? `${m.name}: menu` : undefined}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              if (skipRefocus.current) {
                skipRefocus.current = false; // the rename box or the dialog takes the focus
                return;
              }
              if (m) navRef.current?.querySelector<HTMLElement>(`[data-module="${CSS.escape(m.id)}"]`)?.focus();
            }}
          >
            {m ? (
              <>
                <DropdownMenu.Item className="menu__item" onSelect={() => onGo({ kind: "module", id: m.id })}>
                  Open
                </DropdownMenu.Item>
                {!collapsed ? (
                  <DropdownMenu.Item className="menu__item" onSelect={() => { skipRefocus.current = true; setRenamingModule(m.id); }}>
                    Rename…
                  </DropdownMenu.Item>
                ) : null}
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="menu__item menu__item--sub">
                    Change icon <ChevronRight size={14} aria-hidden="true" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent className="menu__list popover iconmenu" sideOffset={4} collisionPadding={8}>
                      <DropdownMenu.Item className="menu__item iconmenu__name" onSelect={() => void pickIcon(m, null)}>
                        {fromName ? <fromName.Icon size={15} aria-hidden="true" /> : null}
                        From its name
                        {!pickedIcon ? <Check size={14} aria-label="chosen" className="iconmenu__tick" /> : null}
                      </DropdownMenu.Item>
                      <div className="iconmenu__grid">
                        {MODULE_ICONS.map((c) => (
                          <DropdownMenu.Item key={c.name} className="menu__item" onSelect={() => void pickIcon(m, c.name)}>
                            <c.Icon size={15} aria-hidden="true" />
                            {c.label}
                            {pickedIcon === c.name ? <Check size={14} aria-label="chosen" className="iconmenu__tick" /> : null}
                          </DropdownMenu.Item>
                        ))}
                      </div>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="menu__item menu__item--sub" disabled={!parentOf(m) && !destinations.length}>
                    Move to <ChevronRight size={14} aria-hidden="true" />
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent className="menu__list popover" sideOffset={4} collisionPadding={8}>
                      {parentOf(m) ? (
                        <DropdownMenu.Item className="menu__item" onSelect={() => void moveTo(m, null)}>
                          The top level
                        </DropdownMenu.Item>
                      ) : null}
                      {destinations.map((d) => (
                        <DropdownMenu.Item key={d.id} className="menu__item" onSelect={() => void moveTo(m, d.id)}>
                          Inside {where(d)}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
                <DropdownMenu.Separator className="menu__sep" />
                <DropdownMenu.Item className="menu__item" onSelect={() => void hide(m)}>
                  Hide from the sidebar
                </DropdownMenu.Item>
                {client ? (
                  <DropdownMenu.Item className="menu__item menu__item--danger" onSelect={() => { skipRefocus.current = true; setRemoving(m); }}>
                    Remove…
                  </DropdownMenu.Item>
                ) : null}
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {client && removing ? (
        <RemoveModuleDialog
          client={client}
          module={removing}
          open
          onClose={() => setRemoving(null)}
          onDone={(how) => {
            const gone = removing;
            setRemoving(null);
            onChanged?.();
            // a page of what went away is gone too: back Home
            const here = surface.kind === "module" ? surface.id : surface.kind === "record" ? surface.module : undefined;
            if (how !== "hide" && here && isInside(modules, here, gone.id)) onGo({ kind: "home" });
          }}
        />
      ) : null}
    </nav>
  );
}
