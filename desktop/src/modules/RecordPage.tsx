/**
 * A record's own page (the UI rulebook §7): a sticky header (a back link to the collection, a
 * breadcrumb module › collection › record, and ⋮ More: Duplicate, Pin, History, Delete), then one
 * centred column: the type as a small uppercase eyebrow, a line icon, the title in serif, a card
 * with every field labelled and editable, and below it the person's chosen sections (Notes,
 * Intelligence, Governance).
 *
 * The page is the form: edits are held here and nothing is written until Save, which sends one
 * `editRecord(table, id, only what changed, revision)`; Discard puts the saved values back. A
 * refusal from the core shows in red under the field it names (or above the buttons) and the
 * edits stay. Leaving with changes (the back link, the breadcrumb, the sidebar, Back, ⌘K) asks
 * in a dialog: Save, Discard or Stay. The leaving is intercepted in the window: the App asks the
 * page through `onGuard` before it changes surface. A new record is this same page with id "new":
 * empty but for sensible defaults (today for a required date, the first status or choice); Save
 * adds it and the address becomes the new record's. (9 Oct, the UI rulebook, record pages.)
 * Forced edits (the rulebook's red marking) are not done: decided with the owner.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Client, JournalEntry, ModuleCard, RecordRow, Relations, TableDesc } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { BackLink } from "../shell/BackLink";
import type { Surface } from "../shell/Rail";
import { Breadcrumb, Button, Confirm, Dialog, IconButton, Notice, PageHeader, SectionCard, Trouble, useContextMenu, type ContextItem } from "../ui";
import { CopyIcon, DeleteIcon, FileText, HistoryIcon, ICON, MoreHorizontal, PinIcon, UnpinIcon } from "../ui/icons";
import { openChoices, titleFieldOf, type FieldInfo } from "./fields";
import { when } from "./format";
import { fieldLabel, isEmpty, RecordField } from "./record/RecordField";
import { changesFrom, entriesAbout, HistoryDialog } from "./record/RecordHistory";
import { GovernanceSection, IntelligenceSection, NotesSection } from "./record/RecordSections";

/** What the App asks before the window leaves this page: true when it is holding the leaving
 *  (and will ask the person), false when the page lets it go. */
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

const same = (a: unknown, b: unknown) => (isEmpty(a) && isEmpty(b)) || JSON.stringify(a) === JSON.stringify(b);

type Loaded = { desc: TableDesc; row: RecordRow | null; relations: Relations };

export function RecordPage({ client, module, table, id, version, modules, onGo, onChanged, onAsk, onGuard }: { client: Client; module: string; table: string; id: string; version: number; modules: ModuleCard[]; onGo: (s: Surface) => void; onChanged: () => void; onAsk?: (text: string) => void; onGuard: (guard: LeaveGuard | null) => void }) {
  const isNew = id === "new";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [journal, setJournal] = useState<JournalEntry[]>(NO_JOURNAL);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [leaving, setLeaving] = useState<{ proceed: () => void } | null>(null);
  const [asking, setAsking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [undone, setUndone] = useState(0);
  const [pins, setPins] = usePreference<Record<string, string[]>>(client, PREF.pinnedRecords, NO_MAP);
  const [sectionPref] = usePreference<Record<string, string[]>>(client, PREF.recordSections, NO_MAP);
  const dirtyRef = useRef(false);
  dirtyRef.current = Object.keys(draft).length > 0;
  const dirty = dirtyRef.current;

  useEffect(() => {
    let live = true;
    const load: Promise<Loaded> = isNew
      ? client.module(module).then((d) => {
          const desc = d.tables.find((t) => t.name === table);
          if (!desc) throw new Error(`There is no collection ${table} in this module.`);
          return { desc, row: null, relations: {} };
        })
      : client.record(table, id).then((r) => ({ desc: r.table, row: r.record, relations: r.relations }));
    load
      .then((l) => {
        if (!live) return;
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
      .then((e) => live && setJournal(e))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, isNew, journalModule, Boolean(loaded), version]); // eslint-disable-line react-hooks/exhaustive-deps

  // The App asks before it leaves this page; a held leaving waits for the person's answer.
  useEffect(() => {
    onGuard((proceed) => {
      if (!dirtyRef.current) return false;
      setLeaving({ proceed });
      return true;
    });
    return () => onGuard(null);
  }, [onGuard]);

  const pinned = (pins[table] ?? []).includes(id);
  const saveFirst = "Save the record first.";
  const { menu, openFrom } = useContextMenu((): ContextItem[] => [
    { label: "Duplicate", icon: <CopyIcon size={ICON} />, onSelect: () => void duplicate(), disabled: isNew ? saveFirst : dirty ? "Save or discard your changes first; a duplicate copies what is saved." : undefined },
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
          {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't open this record: {error}</Trouble> : <p className="faint">Loading this record…</p>}
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
    setSaved(false);
    setFieldErrors((e) => {
      if (!(name in e)) return e;
      const { [name]: _gone, ...rest } = e;
      return rest;
    });
  }

  function refuse(e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    const hit = fields.find((f) => message.includes(`'${f.name}'`));
    if (hit) setFieldErrors({ [hit.name]: message });
    else setProblem(message);
  }

  /** One `editRecord` with only what changed and the revision, or `addRecord` for a new one. */
  async function save(navigate = true): Promise<boolean> {
    setSaving(true);
    setProblem(null);
    setFieldErrors({});
    try {
      if (isNew) {
        const values = Object.fromEntries(Object.entries({ ...base, ...draft }).filter(([, v]) => !isEmpty(v)));
        const made = await client.addRecord(table, values);
        dirtyRef.current = false;
        setDraft({});
        onChanged();
        if (navigate) onGo({ kind: "record", module, table, id: made.id });
        return true;
      }
      const next = await client.editRecord(table, id, draft, row!.revision);
      dirtyRef.current = false;
      setLoaded((l) => (l ? { ...l, row: next } : l));
      setDraft({});
      setUndone(0);
      setSaved(true);
      onChanged();
      return true;
    } catch (e) {
      refuse(e);
      return false;
    } finally {
      setSaving(false);
    }
  }
  function discard() {
    setDraft({});
    setUndone(0);
    setSaved(false);
    setProblem(null);
    setFieldErrors({});
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
      await client.deleteRecord(table, id, row!.revision);
      dirtyRef.current = false;
      setAsking(false);
      onChanged();
      toCollection();
    } catch (e) {
      setAsking(false);
      setProblem(`Couldn't delete it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function togglePin() {
    const mine = pins[table] ?? [];
    const failed = await setPins({ ...pins, [table]: pinned ? mine.filter((x) => x !== id) : [...mine, id] });
    if (failed) setProblem(`Couldn't ${pinned ? "unpin" : "pin"} it: ${failed}`);
  }

  // Undo puts the old value into the form, Redo the new one; Save writes what the form holds.
  const known = (values: Record<string, unknown>) => Object.entries(values).filter(([k]) => fields.some((f) => f.name === k));
  function undo() {
    const c = changes[undone];
    if (!c) return;
    for (const [k, v] of known(c.before)) setField(k, v);
    setUndone(undone + 1);
  }
  function redo() {
    const c = changes[undone - 1];
    if (!c) return;
    for (const [k, v] of known(c.after)) setField(k, v);
    setUndone(undone - 1);
  }

  const fieldWords = (names: string[]) => names.map((n) => fieldLabel(fields.find((f) => f.name === n) ?? { name: n, kind: "text" })).join(", ");
  /** Where a relation's pill opens: a person or company's page, or the related record's page. */
  const openerFor = (f: FieldInfo, rid: string): (() => void) | null => {
    const t = f.relation ?? "";
    if (t.startsWith("entity:") || t === "person" || t === "organisation") return () => onGo({ kind: "entity", id: rid });
    const m = modules.find((x) => x.tables.some((tb) => tb.name === t));
    return m ? () => onGo({ kind: "record", module: m.id, table: t, id: rid }) : null;
  };
  const showBar = dirty || isNew || problem !== null || saved;
  return (
    <>
      <PageHeader
        left={
          <>
            <BackLink to={collection} onClick={() => toCollection()} />
            <Breadcrumb items={[{ label: mod?.name ?? "Module", onClick: () => toCollection("summary") }, { label: collection, onClick: () => toCollection() }, { label: titleText }]} />
          </>
        }
        right={<IconButton label="More" icon={<MoreHorizontal />} onClick={(e) => openFrom(undefined, e.currentTarget)} />}
      />
      {menu}
      <div className="page page--record">
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
          <SectionCard title="Details" subtitle="Every field can be edited here. Nothing is written until you save.">
            <div className="recform">
              {fields.map((f) => {
                const v = valueOf(f);
                return <RecordField key={f.name} client={client} field={f} value={v} row={row} relations={loaded.relations} open={isEmpty(v) ? null : openerFor(f, String(v))} error={fieldErrors[f.name]} onChange={(next) => setField(f.name, next)} />;
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
            {showBar ? (
              <div className="recbar">
                {problem ? <Notice tone="bad">{problem}</Notice> : null}
                {saved && !dirty ? <Notice>Saved.</Notice> : null}
                <span className="spacer" />
                {dirty || isNew ? (
                  <>
                    <Button variant="primary" disabled={saving} onClick={() => void save()}>
                      Save
                    </Button>
                    <Button disabled={saving} onClick={discard}>
                      Discard
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </SectionCard>
          {sections.includes("notes") ? <NotesSection client={client} table={table} id={id} title={titleText} version={version} onChanged={onChanged} /> : null}
          {sections.includes("intelligence") ? <IntelligenceSection client={client} row={row} about={about} version={version} onChanged={onChanged} onAsk={onAsk} /> : null}
          {sections.includes("governance") ? <GovernanceSection row={row} fields={fields} /> : null}
        </div>
      </div>
      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} changes={changes} fields={fields} undone={undone} onUndo={undo} onRedo={redo} />
      <Confirm open={asking} title={`Delete ${titleText}?`} action="Delete" onConfirm={() => void remove()} onCancel={() => setAsking(false)}>
        It leaves {collection}. Activity keeps that it was here and what it held, but the window cannot bring it back.
      </Confirm>
      <Dialog open={leaving !== null} onOpenChange={(o) => !o && setLeaving(null)} title="Save your changes?">
        <div className="dialog__body">You changed {fieldWords(Object.keys(draft)) || "this record"}. Nothing is written until you save.</div>
        <div className="row dialog__actions">
          <Button variant="ghost" onClick={() => setLeaving(null)}>
            Stay
          </Button>
          <Button
            onClick={() => {
              const go = leaving?.proceed;
              setLeaving(null);
              discard();
              go?.();
            }}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            autoFocus
            onClick={async () => {
              const go = leaving?.proceed;
              const ok = await save(false);
              setLeaving(null);
              if (ok) go?.(); // a refusal keeps the edits and shows on the page
            }}
          >
            Save
          </Button>
        </div>
      </Dialog>
    </>
  );
}
