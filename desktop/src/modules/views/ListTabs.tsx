/**
 * A table's saved lists as tabs in its toolbar (13 Oct, Q42 section 3c; the feature from pull
 * request #5, the look main's own: the view switch's pill). "All", then each list (★ on the one
 * the table opens on), then + to save the current view under a name. The current list's ⋮ holds
 * Rename, Save changes, Open the table on it, Remove (after a yes); a dot says the view has
 * changed since the list was saved. Lists that don't fit go under More, measured against the
 * toolbar, so the toolbar stays one line.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { SavedList } from "../../core/client";
import { Button, Confirm, IconButton, Popover } from "../../ui";
import { ChevronDown, ColumnMenuIcon, PlusIcon } from "../../ui/icons";

function NameForm({ initial, action, onSubmit }: { initial: string; action: string; onSubmit: (title: string) => Promise<boolean> | void }) {
  const [title, setTitle] = useState(initial);
  return (
    <form className="listtabs__form" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void onSubmit(title.trim()); }}>
      <input autoFocus className="textfield" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name this list" aria-label="List name" />
      <Button size="sm" variant="primary" type="submit" disabled={!title.trim()}>
        {action}
      </Button>
    </form>
  );
}

function ListMenu({ list, dirty, onRename, onUpdate, onDefault, onRemove }: { list: SavedList; dirty: boolean; onRename: (title: string) => Promise<boolean>; onUpdate: () => void; onDefault: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRenaming(false); }} label={`${list.title}: list`} align="start" trigger={<IconButton size="sm" className="listtab__menu" label={`More for the list ${list.title}`} icon={<ColumnMenuIcon />} />}>
        {renaming ? (
          <NameForm initial={list.title} action="Rename" onSubmit={async (t) => { if (await onRename(t)) { setRenaming(false); setOpen(false); } return true; }} />
        ) : (
          <div className="colmenu">
            <button type="button" className="menu__item" onClick={() => setRenaming(true)}>
              Rename…
            </button>
            <button type="button" className="menu__item" disabled={!dirty} title={dirty ? undefined : "Nothing has changed since it was saved"} onClick={() => { onUpdate(); setOpen(false); }}>
              Save changes to this list
            </button>
            {!list.is_default ? (
              <button type="button" className="menu__item" onClick={() => { onDefault(); setOpen(false); }}>
                Open the table on this list
              </button>
            ) : null}
            <button type="button" className="menu__item menu__item--danger" onClick={() => { setOpen(false); setAsking(true); }}>
              Remove this list…
            </button>
          </div>
        )}
      </Popover>
      <Confirm open={asking} title={`Remove the list ${list.title}?`} action="Remove it" onConfirm={() => { setAsking(false); onRemove(); }} onCancel={() => setAsking(false)}>
        The rows stay; only this way of looking at them goes.
      </Confirm>
    </>
  );
}

export function ListTabs({ lists, current, dirty, onPick, onSave, onRename, onUpdate, onDefault, onRemove }: { lists: SavedList[]; current: string; dirty: boolean; onPick: (id: string) => void; onSave: (title: string) => Promise<boolean>; onRename: (id: string, title: string) => Promise<boolean>; onUpdate: () => void; onDefault: (id: string) => void; onRemove: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(lists.length);
  const [saving, setSaving] = useState(false);
  const labels = lists.map((l) => l.title).join("|");

  // how many lists fit beside the rest of the toolbar, measured, so the toolbar stays one line
  useLayoutEffect(() => {
    const toolbar = box.current?.parentElement;
    if (!toolbar || !measure.current) return;
    const compute = () => {
      const cs = getComputedStyle(toolbar);
      const gap = parseFloat(cs.columnGap) || 0;
      let room = toolbar.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0") - gap;
      for (const el of Array.from(toolbar.children) as HTMLElement[]) {
        if (el === box.current || el === measure.current || el.classList.contains("spacer")) continue;
        room -= el.getBoundingClientRect().width + gap;
      }
      const widths = (Array.from(measure.current!.children) as HTMLElement[]).map((c) => c.getBoundingClientRect().width);
      if (!widths.some((w) => w > 0)) {
        setFit(lists.length); // nothing measured (a test's document): every list shows
        return;
      }
      const [all, ...rest] = widths;
      const listW = rest.slice(0, lists.length);
      const [more, plus] = rest.slice(lists.length);
      let used = all + plus + 8;
      let k = 0;
      for (let i = 0; i < listW.length; i++) {
        if (used + listW[i] + (i < listW.length - 1 ? more : 0) > room) break;
        used += listW[i];
        k++;
      }
      setFit(k);
    };
    compute();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(compute);
    watch.observe(toolbar);
    return () => watch.disconnect();
  }, [labels, lists.length, current, dirty]);

  let shown = lists.slice(0, fit);
  const at = lists.findIndex((l) => l.id === current);
  if (at >= fit && fit > 0) shown = [...lists.slice(0, fit - 1), lists[at]]; // the current list is always a tab
  const hidden = lists.filter((l) => !shown.includes(l));

  const tab = (id: string, words: string, extra?: ReactNode) => (
    <button key={id} type="button" role="tab" aria-selected={current === id} onClick={() => onPick(id)}>
      {words}
      {extra}
    </button>
  );
  return (
    <>
      <div ref={box} className="toggle toggle--views listtabs" role="tablist" aria-label="Saved lists">
        {tab("all", "All")}
        {shown.map((l) => (
          <span key={l.id} className="listtab">
            {tab(l.id, `${l.is_default ? "★ " : ""}${l.title}`, current === l.id && dirty ? <span className="listtab__dot" aria-label="changed since saved" /> : null)}
            {current === l.id ? <ListMenu list={l} dirty={dirty} onRename={(t) => onRename(l.id, t)} onUpdate={onUpdate} onDefault={() => onDefault(l.id)} onRemove={() => onRemove(l.id)} /> : null}
          </span>
        ))}
        {hidden.length ? (
          <Popover label="More lists" align="start" trigger={<button type="button" className="listtabs__more">More <ChevronDown size={12} aria-hidden="true" /></button>}>
            <div className="colmenu">
              {hidden.map((l) => (
                <button key={l.id} type="button" className="menu__item" onClick={() => onPick(l.id)}>
                  {l.is_default ? "★ " : ""}
                  {l.title}
                </button>
              ))}
            </div>
          </Popover>
        ) : null}
        <Popover open={saving} onOpenChange={setSaving} label="Save as a list" align="start" trigger={<IconButton size="sm" className="listtabs__add" label="Save the current view as a list" icon={<PlusIcon />} />}>
          <NameForm initial="" action="Save" onSubmit={async (t) => { if (await onSave(t)) setSaving(false); return true; }} />
        </Popover>
      </div>
      {/* every tab at its own width, out of sight, so the fit above is measured, not guessed */}
      <div ref={measure} className="toggle toggle--views listtabs listtabs--measure" aria-hidden="true">
        <button type="button" tabIndex={-1}>All</button>
        {lists.map((l) => (
          <button key={l.id} type="button" tabIndex={-1}>
            {l.is_default ? "★ " : ""}
            {l.title}
            <span className="listtab__dot" />
            <span className="listtab__menu-room" />
          </button>
        ))}
        <button type="button" tabIndex={-1}>More <ChevronDown size={12} /></button>
        <button type="button" tabIndex={-1}><PlusIcon size={14} /></button>
      </div>
    </>
  );
}
