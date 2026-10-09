/**
 * ⌘K: search everything and go there. Pages and modules match as you type; from two
 * characters the core's search adds people, records, documents and journal entries; a sentence
 * that matches nothing goes to Alpha as a question. Arrow keys move, Enter goes, Escape closes.
 * (An idea from pull request #3, rebuilt on main's search route.)
 * "/" (outside a text field) opens the same menu as Insert: what can be added from where the
 * person is (the UI rulebook §15): a new record in the module's collections, a new module, files.
 * New view is not listed: making one lives in the data view's own toolbar, out of reach here.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { moduleWords } from "../core/client";
import type { Client, ModuleCard, SearchResult } from "../core/client";
import { host } from "../core/host";
import { Dialog } from "../ui";
import { ActivityIcon, File, HomeIcon, IntelligenceIcon, ModuleIcon, PeopleIcon, PlusIcon, SettingsIcon, UploadIcon } from "../ui/icons";
import type { Surface } from "./Rail";

interface Item {
  key: string;
  kind: "page" | "module" | "person" | "record" | "document" | "journal" | "ask" | "insert" | "upload";
  label: string;
  hint?: string;
  go: () => void;
}

const PAGES: { label: string; surface: Surface; icon: React.ReactNode }[] = [
  { label: "Home", surface: { kind: "home" }, icon: <HomeIcon size={14} /> },
  { label: "Activity", surface: { kind: "activity" }, icon: <ActivityIcon size={14} /> },
  { label: "Network", surface: { kind: "people" }, icon: <PeopleIcon size={14} /> },
  { label: "Intelligence", surface: { kind: "intelligence" }, icon: <IntelligenceIcon size={14} /> },
  { label: "Settings", surface: { kind: "settings" }, icon: <SettingsIcon size={14} /> },
];

export function CommandMenu({
  open,
  onOpenChange,
  client,
  modules,
  onGo,
  onAsk,
  insert,
  surface,
  onNewModule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  modules: ModuleCard[];
  onGo: (s: Surface) => void;
  onAsk: (text: string) => void;
  /** Opened by "/": list what can be added, not what can be found. */
  insert?: boolean;
  /** Where the person is, for Insert. */
  surface?: Surface;
  /** Starts a new project (the sidebar's New project). */
  onNewModule?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const [hits, setHits] = useState<SearchResult | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits(null);
      setActive(0);
      setNote(null);
    }
  }, [open]);

  // The core's search, a moment after typing stops; a late answer never overwrites a newer one.
  const [trouble, setTrouble] = useState<string | null>(null);
  useEffect(() => {
    if (q.length < 2 || insert) {
      setHits(null);
      setTrouble(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      client
        .search(q)
        .then((r) => {
          if (!live) return;
          setHits(r);
          setTrouble(null);
        })
        .catch((e: unknown) => {
          if (!live) return;
          setHits(null);
          setTrouble(e instanceof Error ? e.message : String(e));
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, q, insert]);

  const scope = surface?.kind === "module" ? surface.id : surface?.kind === "record" ? surface.module : null;
  const scopeModule = scope ? modules.find((m) => m.id === scope) : undefined;
  const upload = async (picked: globalThis.File[]) => {
    if (!picked.length) return;
    setNote({ ok: true, text: picked.length === 1 ? "Adding 1 file…" : `Adding ${picked.length} files…` });
    try {
      const out = await client.addFiles(picked, scope ? { module: scope } : {});
      setNote({ ok: true, text: `${picked.length === 1 ? "Added 1 file" : `Added ${picked.length} files`}${scopeModule ? ` to ${scopeModule.name}` : ""}.${out.turn ? " Alpha is reading it." : ""}` });
    } catch (e) {
      setNote({ ok: false, text: `Couldn't add the files: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const items = useMemo<Item[]>(() => {
    const close = () => onOpenChange(false);
    const out: Item[] = [];
    if (insert) {
      if (scope) {
        const tables = (scopeModule?.tables ?? []).map((t) => (typeof t === "string" ? { name: t, title: t } : t));
        const here = surface?.kind === "record" ? tables.filter((t) => t.name === surface.table) : tables;
        for (const t of here.length ? here : surface?.kind === "record" ? [{ name: surface.table, title: surface.table }] : [])
          out.push({ key: `new:${t.name}`, kind: "insert", label: here.length > 1 ? `New record in ${t.title}` : "New record", hint: t.title, go: () => { onGo({ kind: "record", module: scope, table: t.name, id: "new" }); close(); } });
      }
      if (onNewModule) out.push({ key: "new-module", kind: "module", label: "New project", go: () => { onNewModule(); close(); } });
      out.push({ key: "upload", kind: "upload", label: "Upload files", hint: scopeModule ? `To ${scopeModule.name}` : undefined, go: () => files.current?.click() });
      return out.filter((i) => !q || i.label.toLowerCase().includes(q));
    }
    for (const p of PAGES) if (!q || p.label.toLowerCase().includes(q)) out.push({ key: `page:${p.label}`, kind: "page", label: p.label, go: () => { onGo(p.surface); close(); } });
    for (const m of modules) if (!q || moduleWords(m).toLowerCase().includes(q)) out.push({ key: `module:${m.id}`, kind: "module", label: moduleWords(m), hint: m.goal ?? undefined, go: () => { onGo({ kind: "module", id: m.id }); close(); } });
    if (hits) {
      for (const p of hits.people.slice(0, 5)) out.push({ key: `person:${p.id}`, kind: "person", label: p.name, hint: p.kind === "person" ? "Person" : "Organisation", go: () => { onGo({ kind: "entity", id: p.id }); close(); } });
      for (const r of hits.records.slice(0, 6)) {
        const owner = modules.find((m) => m.tables.some((t) => (typeof t === "string" ? t : (t as { name: string }).name) === r.collection));
        out.push({ key: `record:${r.id}`, kind: "record", label: r.snippet.replace(/[[\]]/g, "").slice(0, 90), hint: owner ? `${owner.name} · ${r.collection}` : r.collection, go: () => { onGo(owner ? { kind: "module", id: owner.id } : { kind: "home" }); close(); } });
      }
      for (const d of hits.documents.slice(0, 4)) out.push({ key: `doc:${d.id}`, kind: "document", label: d.title, hint: "Document", go: () => { if (host.available()) void host.openPath(d.path); close(); } });
      for (const j of hits.journal.slice(0, 4)) out.push({ key: `journal:${j.id}`, kind: "journal", label: j.text.slice(0, 90), hint: "In Activity", go: () => { onGo({ kind: "activity" }); close(); } });
    }
    if (q.length >= 3) out.push({ key: "ask", kind: "ask", label: `Ask Alpha: “${query.trim()}”`, go: () => { onAsk(query.trim()); close(); } });
    return out;
  }, [q, query, modules, hits, onGo, onAsk, onOpenChange, insert, scope, scopeModule, surface, onNewModule]);

  useEffect(() => setActive(0), [q, hits]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={insert ? "Insert" : "Search everything"} className="dialog--command">
      <input ref={files} type="file" multiple hidden onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <input
        ref={inputRef}
        autoFocus
        className="command__input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={insert ? "What to add" : "A page, a project, a person, a row, a document, or a question for Alpha"}
        aria-label={insert ? "Insert" : "Search everything"}
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls="command-list"
        aria-activedescendant={items[active] ? `command-${items[active].key}` : undefined}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && items[active]) {
            e.preventDefault();
            items[active].go();
          }
        }}
      />
      {note ? <p className={note.ok ? "faint" : "notice"} role="status" style={{ padding: "6px 12px" }}>{note.text}</p> : null}
      {trouble ? <p className="notice" role="alert" style={{ padding: "6px 12px" }}>Search isn't answering: {trouble}</p> : null}
      <ul id="command-list" className="command__list" role="listbox" aria-label="Results">
        {items.map((item, i) => (
          <li key={item.key} id={`command-${item.key}`} role="option" aria-selected={i === active} className={`command__item${i === active ? " command__item--active" : ""}`} onMouseEnter={() => setActive(i)} onClick={item.go}>
            <span className="command__ico" aria-hidden="true">
              {item.kind === "page" ? PAGES.find((p) => p.label === item.label)?.icon : item.kind === "module" ? <ModuleIcon size={14} /> : item.kind === "person" ? <PeopleIcon size={14} /> : item.kind === "document" ? <File size={14} /> : item.kind === "journal" ? <ActivityIcon size={14} /> : item.kind === "ask" ? <IntelligenceIcon size={14} /> : item.kind === "insert" ? <PlusIcon size={14} /> : item.kind === "upload" ? <UploadIcon size={14} /> : <ModuleIcon size={14} />}
            </span>
            <span className="command__label">{item.label}</span>
            {item.hint ? <span className="faint command__hint">{item.hint}</span> : null}
          </li>
        ))}
        {!items.length ? <li className="empty">Nothing matches.</li> : null}
      </ul>
    </Dialog>
  );
}
