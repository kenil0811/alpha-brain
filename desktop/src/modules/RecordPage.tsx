/**
 * A record's own page (the UI rulebook §7): a sticky header (a back link to the collection, a
 * breadcrumb module › collection › record, and ⋮ More: Duplicate, Pin, History, Delete), then one
 * centred column: the type as a small uppercase eyebrow, a line icon, the title in serif, a card
 * with every field labelled and editable, and below it the person's chosen sections (Notes,
 * Intelligence, Governance).
 *
 * The page is the form, and it saves as you go, the same as a table cell: a field saves when it
 * is left (Enter in a one-line input; a choice when it is picked), one `editRecord(table, id,
 * {that field}, revision)` and only when its value changed, and a quiet "Saved." shows beside it.
 * A refusal shows in red beside the field it names (or the field just left) and the typed value
 * stays. Writes go one after another, so each carries the revision the last one returned. ⌘Z and
 * ⇧⌘Z (outside a text input, which keeps its own undo of typing) step through History, saving the
 * old or new values. Nothing is ever held unsaved past a field, so leaving the page asks nothing;
 * `onGuard` is still taken from the callers and no longer used. A new record is this same page
 * with id "new": empty but for sensible defaults (today for a required date, the first status or
 * choice); the first field left with a value adds it (with the defaults and anything else typed),
 * and the address becomes the new record's. (9 Oct, the UI rulebook, record pages.)
 * Forced edits (the rulebook's red marking) are not done: decided with the owner.
 * Autosave plus a visible control (the owner, 9 Oct: assist and inform rather than assume): a new
 * or just-edited record shows a small bar with Save (writes whatever a field still holds, then
 * confirms) and, for a record made in this visit, Cancel (deletes it after a one-line yes, and goes
 * back). After a save "Saved" shows for a few seconds, then "Last saved 14:32". The header is a
 * Back button named for the project, then the rest of the trail with no name twice ("← Deals · X").
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Client, JournalEntry, ModuleCard, RecordRow, Relations, TableDesc } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { BackLink } from "../shell/BackLink";
import type { Surface } from "../shell/Rail";
import { Breadcrumb, Button, Confirm, IconButton, Notice, PageHeader, SectionCard, Trouble, useContextMenu, type ContextItem } from "../ui";
import { CopyIcon, DeleteIcon, FileText, HistoryIcon, ICON, MoreVertical, PinIcon, UnpinIcon } from "../ui/icons";
import { dedupeCrumbs } from "./crumbs";
import { openChoices, titleFieldOf, type FieldInfo } from "./fields";
import { timeText, when } from "./format";
import { isEmpty, RecordField } from "./record/RecordField";
import { changesFrom, entriesAbout, HistoryDialog, type Change } from "./record/RecordHistory";
import { GovernanceSection, IntelligenceSection, NotesSection } from "./record/RecordSections";

/** What the App asks before the window leaves this page: true when it is holding the leaving.
 *  The page saves as you go and no longer holds a leaving; the type stays for the callers. */
export type LeaveGuard = (proceed: () => void) => boolean;

type Section = "notes" | "intelligence" | "governance";
const ALL_SECTIONS: Section[] = ["notes", "intelligence", "governance"];
const NO_MAP: Record<string, string[]> = {};
const NO_JOURNAL: JournalEntry[] = [];

/** "Deals" → "Deal": the collection's name for one record, for the eyebrow. */
export function singular(title: string): string {
  const t = title.trim();
  if (/ies$/i.test(t)) return `${t.slice(0, -3)}y`;
  if (/(ss|us|is)$/i.test(t)) return t;
  return /s$/i.test(t) ? t.slice(0, -1) : t;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** What a new record starts with: today for a required date, the first status or choice. */
export function defaultsFor(fields: FieldInfo[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === "date" && f.required) out[f.name] = today();
    else if (f.kind === "status") out[f.name] = openChoices(f)[0] ?? f.choices?.[0];
    else if (f.kind === "choice" && f.choices?.length) out[f.name] = f.choices[0];
  }
  return out;
}

/** Records made in this visit of the window, and when each was made: the page is mounted afresh
 *  when a new record gets its address, so these outlive the page. */
const madeHere = new Set<string>();
const savedAt = new Map<string, number>();
/** How long "Saved" shows before the bar says when. */
const SAVED_FOR = 3000;

const same = (a: unknown, b: unknown) => (isEmpty(a) && isEmpty(b)) || JSON.stringify(a) === JSON.stringify(b);

type Loaded = { desc: TableDesc; row: RecordRow | null; relations: Relations };

export function RecordPage({ client, module, table, id, version, modules, onGo, onChanged, onAsk }: { client: Client; module: string; table: string; id: string; version: number; modules: ModuleCard[]; onGo: (s: Surface) => void; onChanged: () => void; onAsk?: (text: string) => void; onGuard?: (guard: LeaveGuard | null) => void }) {
  const isNew = id === "new";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [journal, setJournal] = useState<JournalEntry[]>(NO_JOURNAL);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Undo steps through the history as it stood when stepping began; a new edit starts afresh.
  const [steps, setSteps] = useState<Change[] | null>(null);
  const [undone, setUndone] = useState(0);
  // After a write the history is behind until the journal is read again; ⌘Z waits for it.
  const [stale, setStale] = useState(false);
  const [jtick, setJtick] = useState(0);
  const [pins, setPins] = usePreference<Record<string, string[]>>(client, PREF.pinnedRecords, NO_MAP);
  const [sectionPref] = usePreference<Record<string, string[]>>(client, PREF.recordSections, NO_MAP);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const rowRef = useRef<RecordRow | null>(null); // the saved row: the revision the next write carries
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(true);
  const keys = useRef({ undo: () => {}, redo: () => {}, flush: () => {} });
  const here = `${table}/${id}`;
  const [lastSaved, setLastSaved] = useState<number | null>(() => savedAt.get(here) ?? null);
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  // "Saved" for a few seconds after a save, then "Last saved 14:32"
  useEffect(() => {
    if (lastSaved === null) return;
    const left = lastSaved + SAVED_FOR - Date.now();
    if (left <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), left);
    return () => window.clearTimeout(timer);
  }, [lastSaved]);

  useEffect(() => {
    let live = true;
    const load: Promise<Loaded> = isNew
      ? client.module(module).then((d) => {
          const desc = d.tables.find((t) => t.name === table);
          if (!desc) throw new Error(`There is no collection ${table} in this project.`);
          return { desc, row: null, relations: {} };
        })
      : client.record(table, id).then((r) => ({ desc: r.table, row: r.record, relations: r.relations }));
    load
      .then((l) => {
        if (!live) return;
        rowRef.current = l.row;
        setLoaded(l);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, module, table, id, isNew, version, tick]);

  // The journal holds every change to the record (its history) and what has acted on it.
  const journalModule = loaded?.desc.module ?? undefined;
  useEffect(() => {
    if (isNew || !loaded) return;
    let live = true;
    client
      .activity({ module: journalModule, limit: 500 })
      .then((e) => {
        if (!live) return;
        setJournal(e);
        setStale(false);
      })
      .catch(() => live && setStale(false));
    return () => {
      live = false;
    };
  }, [client, isNew, journalModule, Boolean(loaded), version, jtick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘Z and ⇧⌘Z step through the history; in a text input they stay the input's own undo of typing.
  // Leaving the page writes whatever a field still holds (a field removed with focus is not "left").
  useEffect(() => {
    mounted.current = true;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
      if (e.shiftKey) keys.current.redo();
      else keys.current.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      mounted.current = false;
      keys.current.flush();
    };
  }, []);

  const pinned = (pins[table] ?? []).includes(id);
  const saveFirst = "Fill in a field first; the record is made when you leave it.";
  const { menu, openFrom } = useContextMenu((): ContextItem[] => [
    { label: "Duplicate", icon: <CopyIcon size={ICON} />, onSelect: () => void duplicate(), disabled: isNew ? saveFirst : undefined },
    { label: pinned ? "Unpin" : "Pin", icon: pinned ? <UnpinIcon size={ICON} /> : <PinIcon size={ICON} />, onSelect: () => void togglePin(), disabled: isNew ? saveFirst : undefined },
    { label: "History", icon: <HistoryIcon size={ICON} />, onSelect: () => setHistoryOpen(true), disabled: isNew ? "A new record has no history yet." : undefined },
    { label: "Delete", icon: <DeleteIcon size={ICON} />, danger: true, separatorBefore: true, onSelect: () => setAsking(true), disabled: isNew ? "Nothing to delete yet; this record is not saved." : undefined },
  ]);

  const mod = modules.find((m) => m.id === module);
  const toCollection = useCallback(
    (tab?: string) => {
      try {
        localStorage.setItem(`alpha.module.${module}.tab`, tab ?? table); // the module page opens on this collection
      } catch {
        /* per-window convenience */
      }
      onGo({ kind: "module", id: module });
    },
    [module, table, onGo],
  );

  const desc = loaded?.desc ?? null;
  const row = loaded?.row ?? null;
  const fields: FieldInfo[] = desc?.fields ?? [];
  const titleField = desc ? titleFieldOf(fields, desc.title_field) : undefined;
  const collection = desc?.title ?? table;
  const base = row?.values ?? (desc ? defaultsFor(fields) : {});
  const valueOf = (f: FieldInfo) => (f.name in draft ? draft[f.name] : base[f.name]);

  if (!loaded || !desc) {
    return (
      <>
        <PageHeader left={<BackLink to={collection} onClick={() => toCollection()} />} />
        <div className="page page--record">
          {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't open this record: {error}</Trouble> : <p className="faint">Loading the {collection} record…</p>}
        </div>
      </>
    );
  }

  const titleText = isNew ? `New ${singular(collection)}` : String((titleField && row?.values[titleField]) || "Untitled");
  const about = isNew ? NO_JOURNAL : entriesAbout(journal, table, id);
  const changes = changesFrom(about);
  const sections = ((sectionPref[table] as Section[] | undefined) ?? ALL_SECTIONS).filter((s) => ALL_SECTIONS.includes(s));

  function setField(name: string, value: unknown) {
    setDraft((d) => {
      const next = { ...d };
      if (same(value, base[name])) delete next[name];
      else next[name] = value;
      return next;
    });
    setSavedNames([]);
    setFieldErrors((e) => {
      if (!(name in e)) return e;
      const { [name]: _gone, ...rest } = e;
      return rest;
    });
  }

  /** Writes these values: `editRecord` with the revision, or `addRecord` (with the defaults and
   *  whatever else is typed) while the record is new. One write at a time, in order. A refusal
   *  shows beside the field it names, else beside the first one written, and the input stays. */
  function write(values: Record<string, unknown>): Promise<boolean> {
    const names = Object.keys(values);
    setStale(true);
    const run = async () => {
      const current = rowRef.current;
      try {
        const next = current
          ? await client.editRecord(table, current.id, values, current.revision)
          : await client.addRecord(table, Object.fromEntries(Object.entries({ ...base, ...draftRef.current, ...values }).filter(([, v]) => !isEmpty(v))));
        rowRef.current = next;
        const at = Date.now();
        if (!current) {
          madeHere.add(`${table}/${next.id}`);
          savedAt.set(`${table}/${next.id}`, at); // the page opens afresh at the new address
        }
        setLastSaved(at);
        setNow(at);
        setLoaded((l) => (l ? { ...l, row: next } : l));
        setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k, v]) => !(k in values && same(v, values[k])))));
        setFieldErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in values))));
        setSavedNames(names);
        setJtick((n) => n + 1);
        onChanged();
        if (!current && mounted.current) onGo({ kind: "record", module, table, id: next.id });
        return true;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const hit = fields.find((f) => message.includes(`'${f.name}'`))?.name ?? names[0];
        setFieldErrors((prev) => ({ ...prev, [hit]: message }));
        setSavedNames([]);
        setStale(false);
        return false;
      }
    };
    const done = queue.current.then(run);
    queue.current = done;
    return done;
  }

  /** A field was left (or a choice picked): save it if its value changed. */
  function commit(name: string, value: unknown) {
    setField(name, value);
    const current = rowRef.current;
    if (same(value, (current?.values ?? base)[name])) return;
    if (!current && isEmpty(value)) return; // a new record is made by the first field left with a value
    setSteps(null);
    setUndone(0);
    void write({ [name]: value });
  }

  // Undo writes a change's old values back, Redo its new ones, each saved at once.
  const known = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).filter(([k]) => fields.some((f) => f.name === k)));
  const list = steps ?? changes;
  const canUndo = !stale && undone < list.length;
  const canRedo = !stale && undone > 0;
  async function undo() {
    if (!canUndo) return;
    setSteps(list);
    if (await write(known(list[undone].before))) setUndone(undone + 1);
  }
  async function redo() {
    if (!canRedo) return;
    if (await write(known(list[undone - 1].after))) setUndone(undone - 1);
  }
  keys.current = {
    undo: () => void undo(),
    redo: () => void redo(),
    flush: () => {
      if (!rowRef.current) return; // a new record is not made by leaving the page
      const held = Object.entries(draftRef.current).filter(([k, v]) => !same(v, rowRef.current?.values[k]));
      if (held.length) void write(Object.fromEntries(held));
    },
  };

  /** Save: whatever a field still holds is written (a new record is made from it), then confirmed. */
  async function saveNow() {
    const current = rowRef.current;
    const held = Object.fromEntries(Object.entries(draftRef.current).filter(([k, v]) => !same(v, (current?.values ?? base)[k])));
    if (Object.keys(held).length || (!current && Object.values({ ...base, ...draftRef.current }).some((v) => !isEmpty(v)))) {
      setSteps(null);
      setUndone(0);
      await write(held);
    } else {
      const at = Date.now();
      setLastSaved(at);
      setNow(at);
    }
  }

  async function duplicate() {
    try {
      const copy = await client.addRecord(table, Object.fromEntries(Object.entries(row!.values).filter(([, v]) => !isEmpty(v))));
      onChanged();
      onGo({ kind: "record", module, table, id: copy.id });
    } catch (e) {
      setProblem(`Couldn't duplicate it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function remove() {
    try {
      await client.deleteRecord(table, rowRef.current!.id, rowRef.current!.revision);
      rowRef.current = null;
      draftRef.current = {};
      setAsking(false);
      setCancelling(false);
      onChanged();
      toCollection();
    } catch (e) {
      setAsking(false);
      setCancelling(false);
      setProblem(`Couldn't delete it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function togglePin() {
    const mine = pins[table] ?? [];
    const failed = await setPins({ ...pins, [table]: pinned ? mine.filter((x) => x !== id) : [...mine, id] });
    if (failed) setProblem(`Couldn't ${pinned ? "unpin" : "pin"} it: ${failed}`);
  }

  /** Where a relation's pill opens: a person or company's page, or the related record's page. */
  const openerFor = (f: FieldInfo, rid: string): (() => void) | null => {
    const t = f.relation ?? "";
    if (t.startsWith("entity:") || t === "person" || t === "organisation") return () => onGo({ kind: "entity", id: rid });
    const m = modules.find((x) => x.tables.some((tb) => tb.name === t));
    return m ? () => onGo({ kind: "record", module: m.id, table: t, id: rid }) : null;
  };
  // "← Deals · Bakery": Back is named for the project; the trail after it never repeats a name.
  const [first, ...trail] = dedupeCrumbs([{ label: mod?.name ?? collection }, { label: collection, onClick: () => toCollection() }, { label: titleText }]);
  const made = madeHere.has(here);
  const held = Object.keys(draft).length > 0;
  const savedLine = lastSaved === null ? (held ? "Not saved yet" : "") : now - lastSaved < SAVED_FOR ? "Saved" : `Last saved ${timeText(new Date(lastSaved))}`;
  return (
    <>
      <PageHeader
        left={
          <>
            <BackLink to={first.label} onClick={() => toCollection()} />
            {trail.length ? <span className="crumb__dot" aria-hidden="true">·</span> : null}
            {trail.length ? <Breadcrumb items={trail} /> : null}
          </>
        }
        right={<IconButton label="More" icon={<MoreVertical />} onClick={(e) => openFrom(undefined, e.currentTarget)} />}
      />
      {menu}
      <div className="page page--record">
        {isNew || made || held || lastSaved !== null ? (
          <div className="savebar" role="region" aria-label="Saving">
            <span className="faint" role="status">
              {savedLine}
            </span>
            <span className="spacer" />
            {isNew || made ? (
              <Button size="sm" variant="ghost" onClick={() => (rowRef.current ? setCancelling(true) : toCollection())}>
                Cancel
              </Button>
            ) : null}
            <Button size="sm" variant="primary" disabledReason={!row && !held ? saveFirst : undefined} onClick={() => void saveNow()}>
              Save
            </Button>
          </div>
        ) : null}
        <div className="record">
          <div className="rechead">
            <span className="rechead__tile" aria-hidden="true">
              <FileText size={ICON} />
            </span>
            <div className="rechead__text">
              <div className="eyebrow">{singular(collection)}</div>
              <h1 className="serif">{titleText}</h1>
            </div>
          </div>
          <SectionCard title="Details" subtitle="Every field can be edited here, and saves when you leave it.">
            <div className="recform">
              {fields.map((f) => {
                const v = valueOf(f);
                return <RecordField key={f.name} client={client} field={f} value={v} row={row} relations={loaded.relations} open={isEmpty(v) ? null : openerFor(f, String(v))} error={fieldErrors[f.name]} saved={savedNames.includes(f.name)} onChange={(next) => setField(f.name, next)} onCommit={(next) => commit(f.name, next)} />;
              })}
            </div>
            {row ? (
              <dl className="recmeta">
                <div>
                  <dt>Added</dt>
                  <dd>{when(row.created_at)}</dd>
                </div>
                <div>
                  <dt>Last changed</dt>
                  <dd>{when(row.updated_at)}</dd>
                </div>
              </dl>
            ) : null}
            {problem ? (
              <div className="recbar">
                <Notice tone="bad">{problem}</Notice>
              </div>
            ) : null}
          </SectionCard>
          {sections.includes("notes") ? <NotesSection client={client} table={table} id={id} title={titleText} version={version} onChanged={onChanged} /> : null}
          {sections.includes("intelligence") ? <IntelligenceSection client={client} row={row} about={about} version={version} onChanged={onChanged} onAsk={onAsk} /> : null}
          {sections.includes("governance") ? <GovernanceSection row={row} fields={fields} /> : null}
        </div>
      </div>
      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} changes={changes} fields={fields} undone={list.slice(0, undone).map((c) => c.id)} canUndo={canUndo} canRedo={canRedo} onUndo={() => void undo()} onRedo={() => void redo()} />
      <Confirm open={cancelling} title="Cancel this new record?" action="Delete it" onConfirm={() => void remove()} onCancel={() => setCancelling(false)}>
        It was made in this visit; it is deleted and you go back to {collection}.
      </Confirm>
      <Confirm open={asking} title={`Delete ${titleText}?`} action="Delete" onConfirm={() => void remove()} onCancel={() => setAsking(false)}>
        It leaves {collection}. Activity keeps that it was here and what it held, but the window cannot bring it back.
      </Confirm>
    </>
  );
}
