/**
 * A module: its summary, a page per table, what Alpha did here, and what it is made of. The
 * App · Activity · Settings toggle and the subtabs are the current shell's own structure.
 */
import { type DragEvent, useEffect, useMemo, useState, useRef } from "react";
import { moduleWords } from "../core/client";
import type { Client, ModuleDetail, ModuleSummary, Note, Source, ModuleCard } from "../core/client";
import { DataPage } from "./DataPage";
import { formatNumber, humanize, when } from "./format";
import type { Surface } from "../shell/Rail";
import { AutomationList } from "../shell/Automations";
import { Button, Tabs, Menu, MenuHeading, MenuItem } from "../ui";
import { ModuleIcon } from "../ui/icons";

type Section = "app" | "activity" | "settings";

export function ModulePage({ client, moduleId, version, onChanged, onGo, onSay, modules = [] }: { client: Client; moduleId: string; version: number; onChanged: () => void; onGo: (s: Surface) => void; onSay?: (sentence: string) => void; modules?: ModuleCard[] }) {
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
      setDropNote(`Couldn't add ${files.map((f) => f.name).join(", ")}: ${err instanceof Error ? err.message : String(err)}`);
    }
    window.setTimeout(() => setDropNote(null), 6000);
  }
  async function dropped(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    await added(Array.from(e.dataTransfer.files ?? []));
  }
  const [tab, setTab] = useState<string>(() => {
    try {
      return localStorage.getItem(`alpha.module.${moduleId}.tab`) ?? "summary";
    } catch {
      return "summary";
    }
  });
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
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, moduleId, version]);

  const table = useMemo(() => detail?.tables.find((t) => t.name === tab) ?? null, [detail, tab]);
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
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");
  async function moveUnder(parent: string | null) {
    try {
      const card = await client.moveModule(moduleId, parent);
      setMoveNote(`${card.name} now sits ${card.path && card.path.length > 1 ? `inside ${card.path.slice(0, -1).join(" › ")}` : "at the top"}.`);
      onChanged();
    } catch (e) {
      setMoveNote(`Couldn't move it: ${e instanceof Error ? e.message : String(e)}`);
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
      setMoveNote(`Couldn't make it: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  async function moveIn(id: string) {
    try {
      const card = await client.moveModule(id, moduleId);
      setMoveNote(`${card.name} now sits inside ${detail?.name ?? "this module"}.`);
      onChanged();
    } catch (e) {
      setMoveNote(`Couldn't move it in: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!detail) {
    return <div className="page">{error ? <p className="notice">{error}</p> : <p className="muted">Loading…</p>}</div>;
  }
  const subtitle = [detail.goal, `${detail.tables.length} ${detail.tables.length === 1 ? "table" : "tables"}`].filter(Boolean).join(" · ");
  return (
    <div className={`page page--wide${section === "app" && table ? " page--fill" : ""}${dragging ? " page--drop" : ""}`} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={(e) => void dropped(e)}>
      {dragging ? <div className="dropnote">Drop files to add them to {detail.name}; Alpha reads them into its tables.</div> : null}
      {dropNote ? <p className={`notice${dropNote.startsWith("Couldn") ? "" : " notice--ok"}`} role="status">{dropNote}</p> : null}
      <div className="modhead">
        <div className="modhead__title">
          <div className="modhead__ico" aria-hidden="true">
            <ModuleIcon size={20} />
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
            value={table ? tab : "summary"}
            onChange={setTab}
            items={[
              { id: "summary", label: "Summary" },
              ...detail.tables.map((t) => ({
                id: t.name,
                label: (
                  <>
                    {t.title} <span className="faint num">{t.records}</span>
                  </>
                ),
              })),
            ]}
          />
          {table ? (
            <DataPage key={table.name} client={client} table={table} version={version} onChanged={onChanged} onSay={onSay} />
          ) : (
            <>
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
                          <ModuleIcon size={16} />
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
              <h2>Where it sits</h2>
              <span className="faint">A module can live inside another; everything in it moves with it</span>
            </div>
            <div className="card list">
              <div className="item">
                <div className="item__ico" aria-hidden="true">
                  <ModuleIcon size={16} />
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
                      {t.fields.map((f) => `${f.label ?? humanize(f.name)}${f.unit ? ` (${f.unit})` : ""}`).join(" · ")}
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
            <AutomationList client={client} items={detail.automations} onChanged={onChanged} empty="No agents here yet. Ask Alpha to keep something here current and it shows up with a switch and a verdict per run." />
          </div>
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
      {data.automations ? (
        <p className="faint">
          {data.automations === 1 ? "One thing runs" : `${data.automations} things run`} on its own here{data.next_run ? `; next at ${when(data.next_run)}` : ""}. See Settings.
        </p>
      ) : null}
    </div>
  );
}
