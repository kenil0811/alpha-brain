/**
 * A module: its summary, a page per table, what Alpha did here, and what it is made of. The
 * App · Activity · Settings toggle and the subtabs are the current shell's own structure.
 */
import { type DragEvent, useEffect, useMemo, useState, useRef } from "react";
import { moduleWords, say } from "../core/client";
import type { Agent, Client, FileItem, ModuleDetail, ModuleSummary, Note, PageInfo, Skill, Source, ModuleCard } from "../core/client";
import { PageFrame } from "./PageFrame";
import { DataPage } from "./DataPage";
import { formatNumber, humanize, when } from "./format";
import type { Surface } from "../shell/Rail";
import { AgentList } from "../shell/Agents";
import { Button, Tabs, Menu, MenuHeading, MenuItem } from "../ui";
import { ModuleIcon } from "../ui/icons";
import { ModuleGlyph } from "../shell/moduleIcons";
import { RemoveModuleDialog } from "../shell/RemoveModule";
import { FilesView } from "./FilesView";
import { fieldLabel } from "./fields";

type Section = "app" | "activity" | "settings";

/** `table`: open on that table's tab (a record's page going back to it); otherwise the tab last seen. */
export function ModulePage({ client, moduleId, table: wantedTable, version, onChanged, onGo, onSay, modules = [] }: { client: Client; moduleId: string; table?: string; version: number; onChanged: () => void; onGo: (s: Surface) => void; onSay?: (sentence: string) => void; modules?: ModuleCard[] }) {
  const [detail, setDetail] = useState<ModuleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("app");
  const [dragging, setDragging] = useState(false);
  const [dropNote, setDropNote] = useState<string | null>(null);
  // Files come in by the Add files button (the Mac's picker) or by dropping them anywhere on
  // the page; both take the same route (3 Oct: with only the drop, an empty attachments table
  // had no visible way in).
  const picker = useRef<HTMLInputElement>(null);
  async function added(files: File[]) {
    if (!files.length) return;
    try {
      const out = await client.addFiles(files, { module: moduleId });
      setDropNote(`Added ${out.documents.map((d) => d.title).join(", ")}. Alpha is reading ${files.length === 1 ? "it" : "them"} into the tables.`);
      onChanged();
    } catch (err) {
      setDropNote(`Couldn't add ${files.map((f) => f.name).join(", ")}: ${say(err)}`);
    }
    window.setTimeout(() => setDropNote(null), 6000);
  }
  async function dropped(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    await added(Array.from(e.dataTransfer.files ?? []));
  }
  const [tab, setTab] = useState<string>(() => {
    if (wantedTable) return wantedTable;
    try {
      return localStorage.getItem(`alpha.module.${moduleId}.tab`) ?? "summary";
    } catch {
      return "summary";
    }
  });
  useEffect(() => {
    if (wantedTable) setTab(wantedTable);
  }, [wantedTable]);
  useEffect(() => {
    try {
      localStorage.setItem(`alpha.module.${moduleId}.tab`, tab);
    } catch {
      /* per-window convenience */
    }
  }, [moduleId, tab]);
  useEffect(() => {
    client
      .module(moduleId)
      .then((d) => {
        setDetail(d);
        setError(null);
      })
      .catch((e: unknown) => setError(say(e)));
  }, [client, moduleId, version]);

  const table = useMemo(() => detail?.tables.find((t) => t.name === tab) ?? null, [detail, tab]);
  // the files it holds (slice 2 B8), a tab beside its tables once it holds one
  const [files, setFiles] = useState<FileItem[]>([]);
  useEffect(() => {
    Promise.resolve()
      .then(() => client.moduleFiles(moduleId))
      .then(setFiles)
      .catch(() => setFiles([])); // none to show; the tables are the page
  }, [client, moduleId, version]);
  const showFiles = tab === "files" && files.length > 0;
  // the pages Alpha drew (slice 7): a tab each, the front one what the module opens on
  const [pages, setPages] = useState<PageInfo[]>([]);
  useEffect(() => {
    Promise.resolve()
      .then(() => client.modulePages(moduleId))
      .then(setPages)
      .catch(() => setPages([])); // none to show; the tables are the page
  }, [client, moduleId, version]);
  // the front page is shown on Overview (the module's own page, slice 7b); the others are tabs
  const frontPage = useMemo(() => pages.find((p) => p.front) ?? null, [pages]);
  const tabPages = useMemo(() => pages.filter((p) => !p.front), [pages]);
  const pageShown = useMemo(() => (tab.startsWith("page:") ? tabPages.find((p) => `page:${p.name}` === tab) ?? null : null), [tabPages, tab]);
  useEffect(() => {
    if (tab.startsWith("page:") && !pageShown) setTab("summary"); // removed, or now the front
  }, [tab, pageShown]);
  // Where this module could go (never itself, what it holds, or where it already is), and
  // what could come in (never itself, what is already here, or anything above it).
  const canHoldMe = useMemo(() => modules.filter((m) => m.id !== moduleId && m.id !== (detail?.parent ?? null) && !(m.path ?? []).includes(detail?.name ?? "")), [modules, moduleId, detail?.parent, detail?.name]);
  const canMoveIn = useMemo(() => modules.filter((m) => m.id !== moduleId && m.parent !== moduleId && !(detail?.path ?? []).slice(0, -1).includes(m.name)), [modules, moduleId, detail?.path]);
  // The ids behind the path's names, from the rail's cards (the page itself knows the names).
  const pathIds = useMemo(() => {
    const ids: string[] = [];
    let current = modules.find((m) => m.id === moduleId);
    while (current?.parent) {
      ids.unshift(current.parent);
      current = modules.find((m) => m.id === current?.parent);
    }
    return ids;
  }, [modules, moduleId]);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  // its name changed in place, and taking it away (slice 2 A1, A3)
  const [renaming, setRenaming] = useState(false);
  const [nameNote, setNameNote] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  async function rename(next: string) {
    setRenaming(false);
    const clean = next.trim();
    if (!detail || clean === detail.name) return;
    try {
      await client.renameModule(detail.id, clean);
      setNameNote(null);
      onChanged();
    } catch (e) {
      setNameNote(`Couldn't rename it: ${say(e)}`);
    }
  }
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");
  async function moveUnder(parent: string | null) {
    try {
      const card = await client.moveModule(moduleId, parent);
      setMoveNote(`${card.name} now sits ${card.path && card.path.length > 1 ? `inside ${card.path.slice(0, -1).join(" › ")}` : "at the top"}.`);
      onChanged();
    } catch (e) {
      setMoveNote(`Couldn't move it: ${say(e)}`);
    }
  }
  /** A new module above this one: made where this one sits, then this one moves into it
   *  ("create Avilo and have Deals and Advisory in it": make it above one, move the other in). */
  async function makeParent() {
    const name = newName.trim();
    if (!name) return;
    try {
      const made = await client.createModule(name, null, detail?.parent ?? null);
      await client.moveModule(moduleId, made.id);
      setMoveNote(`${detail?.name ?? "It"} now sits inside ${made.name}.`);
      setNaming(false);
      setNewName("");
      onChanged();
    } catch (e) {
      setMoveNote(`Couldn't make it: ${say(e)}`);
    }
  }
  async function moveIn(id: string) {
    try {
      const card = await client.moveModule(id, moduleId);
      setMoveNote(`${card.name} now sits inside ${detail?.name ?? "this module"}.`);
      onChanged();
    } catch (e) {
      setMoveNote(`Couldn't move it in: ${say(e)}`);
    }
  }
  if (!detail) {
    return <div className="page">{error ? <p className="notice">{error}</p> : <p className="muted">Loading…</p>}</div>;
  }
  const subtitle = [detail.goal, `${detail.tables.length} ${detail.tables.length === 1 ? "table" : "tables"}`].filter(Boolean).join(" · ");
  return (
    <div className={`page page--wide${section === "app" && (table || showFiles) ? " page--fill" : ""}${dragging ? " page--drop" : ""}`} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={(e) => void dropped(e)}>
      {dragging ? <div className="dropnote">Drop files to add them to {detail.name}; Alpha reads them into its tables.</div> : null}
      {dropNote ? <p className={`notice${dropNote.startsWith("Couldn") ? "" : " notice--ok"}`} role="status">{dropNote}</p> : null}
      <div className="modhead">
        <div className="modhead__title">
          <div className="modhead__ico" aria-hidden="true">
            <ModuleGlyph client={client} id={detail.id} name={detail.name} size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            {detail.path && detail.path.length > 1 ? (
              <div className="crumbs" aria-label="Inside">
                {detail.path.slice(0, -1).map((name, i) => (
                  <span key={`${name}-${i}`}>
                    <button type="button" className="linkbtn" onClick={() => onGo({ kind: "module", id: pathIds[i] })}>
                      {name}
                    </button>
                    <span className="faint"> › </span>
                  </span>
                ))}
              </div>
            ) : null}
            <h1>{detail.name}</h1>
            <div className="faint">{subtitle}</div>
          </div>
        </div>
        <input ref={picker} type="file" multiple style={{ display: "none" }} aria-hidden="true" tabIndex={-1} onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ""; void added(files); }} />
        <Button size="sm" title="Add files to this module from your Mac; Alpha reads them into its tables" onClick={() => picker.current?.click()}>
          Add files
        </Button>
        <Tabs className="toggle" label="Section" value={section} onChange={setSection} items={[{ id: "app", label: "App" }, { id: "activity", label: "Activity" }, { id: "settings", label: "Settings" }]} />
      </div>

      {section === "app" ? (
        <>
          <Tabs
            label="Tables"
            value={table || showFiles || tab === "notes" || tab === "know" || pageShown ? tab : "summary"}
            onChange={setTab}
            items={[
              { id: "summary", label: "Overview" },
              ...tabPages.map((p) => ({ id: `page:${p.name}`, label: p.title })),
              { id: "notes", label: "Notes" },
              { id: "know", label: "Skills & agents" },
              ...detail.tables.map((t) => ({
                id: t.name,
                label: (
                  <>
                    {t.title} <span className="faint num">{t.records}</span>
                  </>
                ),
              })),
              ...(files.length
                ? [{ id: "files", label: (
                    <>
                      Files <span className="faint num">{files.length}</span>
                    </>
                  ) }]
                : []),
            ]}
          />
          {pageShown ? (
            <PageFrame key={pageShown.name} client={client} moduleId={moduleId} page={pageShown} version={version} onChanged={onChanged} />
          ) : tab === "notes" ? (
            <ModuleNotes client={client} moduleId={moduleId} version={version} onChanged={onChanged} />
          ) : tab === "know" ? (
            <ModuleKnowHow client={client} moduleId={moduleId} agents={detail.agents} version={version} onChanged={onChanged} onGo={onGo} />
          ) : showFiles ? (
            <div className="stack stack--fill">
              <FilesView client={client} files={files} tableKey={`files_${detail.id}`} onChanged={onChanged} />
            </div>
          ) : table ? (
            <DataPage key={table.name} client={client} table={table} version={version} onChanged={onChanged} onSay={onSay} onOpenRecord={(t, id) => onGo({ kind: "record", table: t, id })} />
          ) : (
            <>
              {frontPage ? <PageFrame key={frontPage.name} client={client} moduleId={moduleId} page={frontPage} version={version} onChanged={onChanged} /> : null}
              <KitExport client={client} moduleId={moduleId} />
              {detail.inside?.length ? (
                <div className="section" style={{ marginTop: 0 }}>
                  <div className="section__head">
                    <h2>Inside {detail.name}</h2>
                    <span className="faint">{detail.inside.length} {detail.inside.length === 1 ? "module" : "modules"}; what you ask here reaches them all</span>
                  </div>
                  <div className="card list">
                    {detail.inside.map((m) => (
                      <div key={m.id} className="item">
                        <div className="item__ico" aria-hidden="true">
                          <ModuleGlyph client={client} id={m.id} name={m.name} size={16} />
                        </div>
                        <div className="item__body">
                          <b>{m.name}</b>
                          <div className="item__sub">
                            {m.goal ?? m.last_text ?? "Nothing in it yet."} · {m.tables.length} {m.tables.length === 1 ? "table" : "tables"}
                            {m.children?.length ? ` · holds ${m.children.length}` : ""}
                          </div>
                        </div>
                        <Button size="sm" onClick={() => onGo({ kind: "module", id: m.id })}>
                          Open
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <ModulePageCard client={client} moduleRef={detail.id} version={version} onChanged={onChanged} />
              <Summary client={client} moduleId={detail.id} version={version} onOpen={setTab} />
            </>
          )}
        </>
      ) : null}

      {section === "activity" ? <ModuleActivity detail={detail} /> : null}

      {section === "settings" ? (
        <>
          <div className="section" style={{ marginTop: 0 }}>
            <div className="section__head">
              <h2>Its name</h2>
              <span className="faint">The same in the sidebar, on Home and here</span>
            </div>
            <div className="card list">
              <div className="item">
                <div className="item__body">
                  {renaming ? (
                    <input className="textfield" aria-label={`New name for ${detail.name}`} defaultValue={detail.name} autoFocus onFocus={(e) => e.currentTarget.select()} onKeyDown={(e) => { if (e.key === "Enter") void rename(e.currentTarget.value); if (e.key === "Escape") setRenaming(false); }} onBlur={(e) => void rename(e.currentTarget.value)} />
                  ) : (
                    <b>{detail.name}</b>
                  )}
                  {nameNote ? <div className="item__sub item__sub--warn" role="alert">{nameNote}</div> : null}
                </div>
                {!renaming ? (
                  <Button size="sm" onClick={() => setRenaming(true)}>
                    Rename
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="section">
            <div className="section__head">
              <h2>Where it sits</h2>
              <span className="faint">A module can live inside another; everything in it moves with it</span>
            </div>
            <div className="card list">
              <div className="item">
                <div className="item__ico" aria-hidden="true">
                  <ModuleGlyph client={client} id={detail.id} name={detail.name} size={16} />
                </div>
                <div className="item__body">
                  <b>{detail.name}</b>
                  <div className="item__sub">{detail.path && detail.path.length > 1 ? `Inside ${detail.path.slice(0, -1).join(" › ")}` : "At the top level"}</div>
                </div>
                <Menu
                  trigger={
                    <Button size="sm" aria-label={`Move ${detail.name}`}>
                      Move…
                    </Button>
                  }
                >
                  <MenuItem onSelect={() => setNaming(true)}>A new module above it…</MenuItem>
                  {detail.parent ? <MenuItem onSelect={() => void moveUnder(null)}>To the top level</MenuItem> : null}
                  {canHoldMe.length ? <MenuHeading>Inside</MenuHeading> : null}
                  {canHoldMe.map((m) => (
                    <MenuItem key={m.id} onSelect={() => void moveUnder(m.id)}>
                      {moduleWords(m)}
                    </MenuItem>
                  ))}
                </Menu>
              </div>
              {naming ? (
                <div className="item">
                  <div className="item__ico" aria-hidden="true">
                    <ModuleIcon size={16} />
                  </div>
                  <div className="item__body">
                    <b>A new module above {detail.name}</b>
                    <div className="item__sub">Made where {detail.name} sits now; {detail.name} moves into it. Move others in from here afterwards.</div>
                  </div>
                  <input className="textfield" aria-label="The new module's name" placeholder="Its name, e.g. Avilo" value={newName} autoFocus onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void makeParent(); if (e.key === "Escape") setNaming(false); }} />
                  <Button size="sm" variant="primary" disabled={!newName.trim()} onClick={() => void makeParent()}>
                    Make it
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>
                    Cancel
                  </Button>
                </div>
              ) : null}
              <div className="item">
                <div className="item__ico" aria-hidden="true">
                  <ModuleIcon size={16} />
                </div>
                <div className="item__body">
                  <b>Inside it</b>
                  <div className="item__sub">{detail.inside?.length ? detail.inside.map((m) => m.name).join(", ") : "Nothing yet. Other modules can move in here."}</div>
                </div>
                {canMoveIn.length ? (
                  <Menu
                    trigger={
                      <Button size="sm" aria-label={`Move a module into ${detail.name}`}>
                        Move a module in…
                      </Button>
                    }
                  >
                    {canMoveIn.map((m) => (
                      <MenuItem key={m.id} onSelect={() => void moveIn(m.id)}>
                        {moduleWords(m)}
                      </MenuItem>
                    ))}
                  </Menu>
                ) : null}
              </div>
              {moveNote ? (
                <div className="item">
                  <span className={`notice${moveNote.startsWith("Couldn") ? "" : " notice--ok"}`} role="status">
                    {moveNote}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <div className="section">
            <div className="section__head">
              <h2>What it keeps</h2>
            </div>
            <div className="card list">
              {detail.tables.map((t) => (
                <div key={t.name} className="item item--top">
                  <div className="item__ico" aria-hidden="true">
                    ▤
                  </div>
                  <div className="item__body">
                    <b>{t.title}</b>
                    <div className="item__sub">
                      {t.fields.map((f) => `${fieldLabel(f)}${f.unit ? ` (${f.unit})` : ""}`).join(" · ")}
                    </div>
                  </div>
                  <span className="faint num">{t.records} rows</span>
                </div>
              ))}
            </div>
          </div>
          {detail.sources.length ? (
            <div className="section">
              <div className="section__head">
                <h2>Where it reads from</h2>
                <span className="faint">{sourceSummary(detail.sources)}</span>
              </div>
              <div className="card list">
                {detail.sources.map((src) => (
                  <div key={src.id} className="item">
                    <div className="item__body">
                      <b>
                        <a href={src.url} target="_blank" rel="noreferrer">
                          {src.title}
                        </a>
                      </b>
                      <div className="item__sub">
                        {src.detail ?? (src.status === "working" ? `${src.last_rows ?? 0} rows${src.last_checked ? ` · read ${when(src.last_checked)}` : ""}` : src.site)}
                      </div>
                    </div>
                    <span className={`pill ${SOURCE_STATUS[src.status].pill}`}>{SOURCE_STATUS[src.status].words}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="section">
            <div className="section__head">
              <h2>Agents</h2>
              <span className="faint">Switch any off; Alpha says so if something needs it</span>
            </div>
            <AgentList client={client} items={detail.agents} onChanged={onChanged} empty="No agents here yet. Ask Alpha to keep something here current and it shows up with a switch and a verdict per run." />
          </div>
          {detail.decisions?.length ? (
            <div className="section">
              <div className="section__head">
                <h2>Decisions</h2>
                <span className="faint">reached in its conversations and on its page; yours bind</span>
              </div>
              <div className="card list">
                {detail.decisions.map((d) => (
                  <div key={d.id} className="item">
                    <div className="item__body">
                      {d.what}
                      <div className="item__sub">
                        {d.by === "person" ? "You" : d.by === "alpha" ? "Alpha" : d.by} · {when(d.at)}
                        {d.why ? ` · ${d.why}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="section">
            <div className="section__head">
              <h2>Take it away</h2>
              <span className="faint">Hide it, remove it with its data kept, or delete it for good; it asks which</span>
            </div>
            <div className="card list">
              <div className="item">
                <div className="item__body">
                  <b>Remove {detail.name}</b>
                  <div className="item__sub">Whatever you choose, Activity keeps what happened here.</div>
                </div>
                <Button size="sm" variant="danger" onClick={() => setRemoving(true)}>
                  Remove…
                </Button>
              </div>
            </div>
          </div>
          <RemoveModuleDialog client={client} module={detail} open={removing} onClose={() => setRemoving(false)} onDone={(how) => { setRemoving(false); onChanged(); if (how !== "hide") onGo({ kind: "home" }); }} />
        </>
      ) : null}
    </div>
  );
}

const SOURCE_STATUS: Record<Source["status"], { pill: string; words: string }> = {
  working: { pill: "pill--good", words: "Working" },
  needs_signin: { pill: "pill--warn", words: "Needs your sign-in" },
  blocked: { pill: "pill--bad", words: "Blocked" },
  broken: { pill: "pill--bad", words: "Being repaired" },
  not_built: { pill: "pill--gray", words: "Not read yet" },
  unavailable: { pill: "pill--gray", words: "Nothing to read" },
  skipped: { pill: "pill--gray", words: "Skipped by you" },
};

function sourceSummary(sources: Source[]): string {
  const working = sources.filter((s) => s.status === "working").length;
  return `${working} of ${sources.length} working`;
}

const PAGE = 50;

/** Everything that happened in this module, newest first: what you did, what Alpha did, what
 *  it read, what you asked and what it answered. */
function ModuleActivity({ detail }: { detail: ModuleDetail }) {
  const [shown, setShown] = useState(PAGE);
  const rows = detail.activity;
  if (!rows.length) return <p className="empty">Nothing has happened here yet.</p>;
  const label = (e: ModuleDetail["activity"][number]) =>
    e.kind === "failed" ? { cls: "badge--failed", words: "Failed" }
    : e.kind === "said" ? { cls: "", words: "You said" }
    : e.kind === "replied" ? { cls: "badge--running", words: "Alpha said" }
    : e.kind === "asked" || e.kind === "proposed" ? { cls: "badge--waiting", words: "Asked" }
    : e.actor === "person" ? { cls: "", words: "You" }
    : e.kind === "saw" ? { cls: "badge--running", words: "Read" }
    : { cls: "badge--succeeded", words: "Alpha" };
  return (
    <div className="stack">
      <div className="card list" aria-label="Everything that happened here">
        {rows.slice(0, shown).map((e) => {
          const b = label(e);
          return (
            <div key={e.id} className="item item--top">
              <span className="item__when">{when(e.at)}</span>
              <span className={`badge ${b.cls}`}>{b.words}</span>
              <div className="item__body activity__text">{e.text}</div>
            </div>
          );
        })}
      </div>
      {rows.length > shown ? (
        <Button size="sm" style={{ alignSelf: "flex-start" }} onClick={() => setShown((n) => n + PAGE)}>
          Show more ({rows.length - shown} earlier)
        </Button>
      ) : null}
    </div>
  );
}

/** The module's page of Alpha's wiki, on the module itself: what it is for, what it holds,
 *  what was tried, what is open; Alpha writes it and the person may edit it. */
function ModulePageCard({ client, moduleRef, version, onChanged }: { client: Client; moduleRef: string; version: number; onChanged: () => void }) {
  const [page, setPage] = useState<{ name: string; scope: string; page: Note | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  useEffect(() => {
    let live = true;
    client
      .modulePage(moduleRef)
      .then((p) => {
        if (!live) return;
        setPage(p);
        if (!editing) setBody(p.page?.body ?? "");
      })
      .catch(() => live && setPage(null));
    return () => {
      live = false;
    };
  }, [client, moduleRef, version, editing]);
  if (!page) return null;
  const save = () =>
    void client.writeNote(page.scope, page.name, body, page.page?.summary ?? undefined).then(() => {
      setEditing(false);
      onChanged();
    });
  return (
    <div className="card card--pad" style={{ marginBottom: 14 }}>
      <div className="section__head" style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: "var(--text-lg)" }}>Alpha's page</h2>
        <span className="faint">what this is for, what it holds, what is open</span>
        <span className="section__right">
          {editing ? (
            <>
              <Button size="sm" variant="primary" onClick={save}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setBody(page.page?.body ?? ""); }}>
                Cancel
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setEditing(true)}>
              {page.page ? "Edit" : "Write"}
            </Button>
          )}
        </span>
      </div>
      {editing ? (
        <textarea className="note__edit" rows={10} value={body} onChange={(e) => setBody(e.target.value)} aria-label={`Edit the page about ${page.name}`} />
      ) : page.page ? (
        <div className="people__page">{page.page.body}</div>
      ) : (
        <p className="muted" style={{ fontSize: "var(--text-md)" }}>No page yet. Alpha writes one as it builds and learns here; you can start it.</p>
      )}
    </div>
  );
}

/** The Summary tab: numbers worked out from the module's own tables. */
function Summary({ client, moduleId, version, onOpen }: { client: Client; moduleId: string; version: number; onOpen: (table: string) => void }) {
  const [data, setData] = useState<ModuleSummary | null>(null);
  useEffect(() => {
    client.moduleSummary(moduleId).then(setData).catch(() => setData(null));
  }, [client, moduleId, version]);
  if (!data) return <p className="muted">Loading…</p>;
  const amount = (v: number | null, unit?: string | null) => (v === null ? "—" : formatNumber(v, unit));
  return (
    <div className="blocks">
      {data.goals.length ? (
        <div className="card card--pad">
          <div className="metric__lab">{data.goals.length === 1 ? "Goal" : "Goals"}</div>
          {data.goals.map((g) => (
            <div key={g.id} style={{ marginTop: 6 }}>
              {g.text}
            </div>
          ))}
        </div>
      ) : null}
      {data.tables.map((t) => (
        <div key={t.name} className="stack">
          <div className="section__head" style={{ marginBottom: 0 }}>
            <h2>{t.title}</h2>
            <span className="faint">
              {t.rows} {t.rows === 1 ? "row" : "rows"}
              {t.added_this_week ? ` · ${t.added_this_week} added this week` : ""}
            </span>
            <span className="section__right">
              <Button size="sm" onClick={() => onOpen(t.name)}>
                Open
              </Button>
            </span>
          </div>
          {t.amounts?.length ? (
            <div className="metrics">
              {t.amounts.map((a) => (
                <div key={a.field} className="card metric">
                  <div className="metric__lab">
                    {a.label}
                    {a.how === "average" ? " · average" : ""}
                  </div>
                  <div className="metric__big num">{amount(a.today, a.unit)}</div>
                  <div className="metric__sub">Today · {amount(a.this_week, a.unit)} this week</div>
                </div>
              ))}
            </div>
          ) : null}
          {t.split && Object.keys(t.split.counts).length ? (
            <div className="card card--pad">
              <div className="metric__lab">{t.split.label}</div>
              <div className="row" style={{ marginTop: 8 }}>
                {Object.entries(t.split.counts).map(([choice, n]) => (
                  <span key={choice} className={`pill ${t.split?.done.includes(choice) ? "pill--good" : "pill--gray"}`}>
                    {humanize(choice)} <b className="num">{n}</b>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {t.rows === 0 ? <p className="empty">Nothing here yet.</p> : null}
        </div>
      ))}
      {data.agents ? (
        <p className="faint">
          {data.agents === 1 ? "One agent works on its own here" : `${data.agents} agents work on their own here`}{data.next_run ? `; next at ${when(data.next_run)}` : ""}. See Settings.
        </p>
      ) : null}
    </div>
  );
}

/** The module's page as text (NOTES.md; harness slice 5/6): what it is for, what was decided,
 *  what is open; yours and Alpha's, the same file either way. */
function ModuleNotes({ client, moduleId, version, onChanged }: { client: Client; moduleId: string; version: number; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (editing) return;
    let live = true;
    client.moduleNotes(moduleId).then((n) => live && setText(n.text)).catch((e: unknown) => live && setProblem(say(e)));
    return () => {
      live = false;
    };
  }, [client, moduleId, version, editing]);
  const save = () =>
    void client
      .editModuleNotes(moduleId, text)
      .then(() => {
        setEditing(false);
        onChanged();
      })
      .catch((e: unknown) => setProblem(say(e)));
  return (
    <div className="section" style={{ marginTop: 0 }}>
      <div className="section__head">
        <h2>Notes</h2>
        <span className="faint">What this module is for, what was decided, what is open; Alpha reads them on every turn here</span>
        <div className="section__right">
          {editing ? (
            <>
              <Button size="sm" variant="primary" onClick={save}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
          )}
        </div>
      </div>
      <div className="card card--pad">
        {editing ? (
          <textarea className="note__edit" rows={14} value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit the module's notes" />
        ) : text ? (
          <p className="muted" style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-md)" }}>{text}</p>
        ) : (
          <p className="empty">No notes yet. Alpha writes them as the module takes shape; you can start them.</p>
        )}
        {problem ? <p className="notice" role="alert">{problem}</p> : null}
      </div>
    </div>
  );
}

/** The module's skills and agents, each a text page of its own (harness §10). */
function ModuleKnowHow({ client, moduleId, agents, version, onChanged, onGo }: { client: Client; moduleId: string; agents: Agent[]; version: number; onChanged: () => void; onGo: (s: Surface) => void }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  useEffect(() => {
    let live = true;
    client
      .intelligence()
      .then((i) => live && setSkills(i.skills.filter((s) => s.module === moduleId)))
      .catch(() => live && setSkills([]));
    return () => {
      live = false;
    };
  }, [client, moduleId, version]);
  const KIND: Record<string, string> = { read: "reader", act: "procedure", run: "pipeline" };
  return (
    <>
      <div className="section" style={{ marginTop: 0 }}>
        <div className="section__head">
          <h2>Skills</h2>
          <span className="faint">Alpha's own know-how for this module: readers of sites, procedures, pipelines; each a file you can read and edit</span>
        </div>
        {skills.length ? (
          <div className="card list">
            {skills.map((s) => (
              <button key={s.name} type="button" className="item item--link" onClick={() => onGo({ kind: "skill", name: s.name })}>
                <span className="badge">{KIND[s.kind] ?? s.kind}</span>
                <div className="item__body">
                  <b>{s.name}</b>
                  <div className="item__sub">{s.description}{s.site ? ` · ${s.site}` : ""}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty">No skills here yet.</p>
        )}
      </div>
      <div className="section">
        <div className="section__head">
          <h2>Agents</h2>
          <span className="faint">What works on its own here; each a file of its own</span>
        </div>
        <AgentList client={client} items={agents} onChanged={onChanged} empty="No agents here yet. Ask Alpha to keep something here current and it shows up with a switch and a verdict per run." onOpen={(id) => onGo({ kind: "agent", id })} />
      </div>
    </>
  );
}

/** The module as a kit (harness §15): its shape, notes, skills and agents, no data; the
 *  folder's path, and what crosses out of the module if anything. */
function KitExport({ client, moduleId }: { client: Client; moduleId: string }) {
  const [out, setOut] = useState<{ kit: string; version: number; files: number; crosses: string[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="row" style={{ marginBottom: 12, alignItems: "center", gap: 10 }}>
      <Button size="sm" disabled={busy} onClick={() => { setBusy(true); setProblem(null); void client.exportKit(moduleId).then(setOut).catch((e: unknown) => setProblem(say(e))).finally(() => setBusy(false)); }}>
        Export as kit…
      </Button>
      {out ? (
        <span className="faint">
          v{out.version}, {out.files} files at <code>{out.kit}</code>
          {out.crosses.length ? ` · reaches outside this module: ${out.crosses.join("; ")}` : " · standalone"}
        </span>
      ) : null}
      {problem ? <span className="notice">{problem}</span> : null}
    </div>
  );
}
