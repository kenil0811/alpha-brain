/** ⌘K: jump to a page (Connections and About you too) or a project, start a new one, or ask
 *  Alpha whatever was typed. A plain substring filter and a small listbox (Arrow, Enter, Esc)
 *  on the shared Dialog, with the keys spelled out underneath. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Activity, FolderPlus, Home, Link2, MessageCircle, Settings, Sparkles, UserRound, Users, type LucideIcon } from "lucide-react";
import type { ModuleCard } from "../core/client";
import { Dialog, DialogContent, Input } from "../ui";
import { projectIcon } from "./projectIcons";
import type { Surface } from "./Rail";

interface Command {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void;
}

export function CommandMenu({ modules, onGo, onNew, onAsk }: { modules: ModuleCard[]; onGo: (s: Surface) => void; onNew: () => void; onAsk: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  const items = useMemo<Command[]>(
    () => [
      { id: "home", label: "Go to Home", icon: Home, run: () => onGo({ kind: "home" }) },
      { id: "activity", label: "Go to Activity", icon: Activity, run: () => onGo({ kind: "activity" }) },
      { id: "connections", label: "Go to Connections", icon: Link2, run: () => onGo({ kind: "intelligence", tab: "connections" }) },
      { id: "about", label: "Go to About you", icon: UserRound, run: () => onGo({ kind: "intelligence", tab: "knowledge" }) },
      { id: "people", label: "Go to People & Companies", icon: Users, run: () => onGo({ kind: "people" }) },
      { id: "intelligence", label: "Go to Intelligence", icon: Sparkles, run: () => onGo({ kind: "intelligence" }) },
      { id: "settings", label: "Go to Settings", icon: Settings, run: () => onGo({ kind: "settings" }) },
      ...modules.map((m) => ({ id: `m-${m.id}`, label: `Open ${m.name}`, icon: projectIcon(m), run: () => onGo({ kind: "module", id: m.id }) })),
      { id: "new", label: "New project", icon: FolderPlus, run: onNew },
    ],
    [modules, onGo, onNew],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    const hits = items.filter((i) => i.label.toLowerCase().includes(q));
    return [...hits, { id: "ask", label: `Ask Zazoo: ${query.trim()}`, icon: MessageCircle, run: () => onAsk(query.trim()) }];
  }, [items, query, onAsk]);

  const choose = (item: Command | undefined) => {
    if (!item) return;
    item.run();
    setOpen(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(shown[active]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {open ? (
        <DialogContent title="Jump to…">
          <Input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Go to a page, open a project…"
            aria-label="Command menu"
            role="combobox"
            aria-expanded
            aria-controls="command-menu-list"
            aria-activedescendant={shown[active] ? `command-${shown[active].id}` : undefined}
          />
          <ul id="command-menu-list" role="listbox" className="command-menu__list" aria-label="Places">
            {shown.map((item, index) => {
              const Icon = item.icon;
              return (
                <li key={item.id} id={`command-${item.id}`} role="option" aria-selected={index === active} className={index === active ? "command-menu__item command-menu__item--active" : "command-menu__item"} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}>
                  <Icon size={15} aria-hidden="true" />
                  <span className="command-menu__label">{item.label}</span>
                </li>
              );
            })}
          </ul>
          <div className="command-menu__hint">
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move · <kbd>Enter</kbd> to choose · <kbd>Esc</kbd> to close · <kbd>⌘K</kbd> to reopen
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
