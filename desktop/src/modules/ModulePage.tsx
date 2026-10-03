/**
 * A project (a module in the core): its name and goal (click to edit), the project being made
 * (CreationOnPage) and its Plan, its summary with Alpha's notes and the project's facts, a page
 * per table, what Alpha did here with the chats and what went wrong, and what it is made of
 * with its sub projects. The App · Activity · Settings toggle and the subtabs are the shell's
 * own structure; the section lives in the address (`#/m/<id>/<section>`).
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { Archive, Folder, MoreHorizontal, Plus, X } from "lucide-react";
import type { Client, ModuleCard, ModuleDetail, ModuleSummary, Source } from "../core/client";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, IconButton, InfoTip, Tooltip, useToast } from "../ui";
import { exportProject, importProject, ProjectEditDialog, ProjectMenuItems, type ProjectEdit } from "../shell/ProjectMenu";
import { projectIcon } from "../shell/projectIcons";
import { CreationOnPage, PlanSection } from "./CreationOnPage";
import { DataPage } from "./DataPage";
import { formatNumber, humanize, when } from "./format";
import type { Surface } from "../shell/Rail";
import { AutomationList } from "../shell/Automations";
import { MicButton, useSpeech } from "../shell/voice";

type Section = "app" | "activity" | "settings";
/** While it is still being worked out and holds nothing, only the creation shows. */
const EARLY = new Set(["new", "asking", "researching", "proposing"]);

export function ModulePage({
  client,
  moduleId,
  version,
  onChanged,
  onGo,
  section: shownSection,
  onSection,
  modules = [],
  onDescribe,
  onOpenSession,
  onQuickEntry,
}: {
  client: Client;
  moduleId: string;
  version: number;
  onChanged: () => void;
  onGo: (s: Surface) => void;
  section?: string;
  onSection?: (section: Section) => void;
  /** Every project, for "Add sub project". */
  modules?: ModuleCard[];
  /** The blank project's first message, sent through the chat panel. */
  onDescribe?: (text: string) => void;
  /** Open one of the project's chats in the panel. */
  onOpenSession?: (threadId: string) => void;
  /** A table's one-line quick entry, sent to Chief of Staff in this project's chat. */
  onQuickEntry?: (text: string) => void;
}) {
  const [detail, setDetail] = useState<ModuleDetail | null>(null);
  const [editing, setEditing] = useState<ProjectEdit | null>(null);
  const [inline, setInline] = useState<"name" | "goal" | null>(null);
  const [draft, setDraft] = useState("");
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const section: Section = shownSection === "activity" || shownSection === "settings" ? shownSection : "app";
  const setSection = (s: Section) => onSection?.(s);
  const [dragging, setDragging] = useState(false);
  const [dropNote, setDropNote] = useState<string | null>(null);
  async function dropped(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
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
      .catch((e: unknown) => {
        const words = e instanceof Error ? e.message : String(e);
        // A project that no longer exists (deleted elsewhere, another data folder): go Home.
        if (/there is no project/i.test(words)) onGo({ kind: "home" });
        else setError(words);
      });
  }, [client, moduleId, version, onGo]);

  const table = useMemo(() => detail?.tables.find((t) => t.name === tab) ?? null, [detail, tab]);
  if (!detail) {
    return <div className="page">{error ? <p className="notice" role="alert">{error}</p> : <p className="muted">Loading…</p>}</div>;
  }
  const Icon = projectIcon(detail);
  const stage = detail.creation?.stage ?? null;
  const early = stage !== null && EARLY.has(stage) && detail.tables.length === 0;
  const making = stage !== null && stage !== "done";
  const startEdit = (what: "name" | "goal") => {
    setDraft((what === "name" ? detail.name : detail.goal) ?? "");
    setInline(what);
  };
  const saveEdit = async () => {
    const what = inline;
    setInline(null);
    const value = draft.trim();
    if (!what || (what === "name" && !value) || value === ((what === "name" ? detail.name : detail.goal) ?? "")) return;
    try {
      await client.updateModule(detail.id, { [what]: value });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const onEnterBlur = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") setInline(null);
  };
  return (
    <div className={`page page--wide${section === "app" && table && !early ? " page--fill" : ""}${dragging ? " page--drop" : ""}`} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }} onDragLeave={() => setDragging(false)} onDrop={(e) => void dropped(e)}>
      {dragging ? <div className="dropnote">Drop files to add them to {detail.name}; Alpha reads them into its tables.</div> : null}
      {dropNote ? <p className={`notice${dropNote.startsWith("Couldn") ? "" : " notice--ok"}`} role="status">{dropNote}</p> : null}
      <div className="modhead">
        <div className="modhead__title">
          <div className="modhead__ico" aria-hidden="true">
            <Icon size={18} />
          </div>
          {inline === "name" ? (
            <input autoFocus className="modhead__nameinput" aria-label="Project name" value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} onBlur={() => void saveEdit()} onKeyDown={onEnterBlur} />
          ) : (
            <h1 className="modhead__name editable" onClick={() => startEdit("name")}>
              {detail.name}
            </h1>
          )}
          <span className="faint num">
            {detail.tables.length} {detail.tables.length === 1 ? "table" : "tables"}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Project options" title="Project options" size="sm">
                <MoreHorizontal size={16} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <ProjectMenuItems
                onPick={(edit) => (edit === "rename" ? startEdit("name") : setEditing(edit))}
                onExport={(rows) =>
                  void exportProject(client, detail, rows)
                    .then((words) => toast.show(words))
                    .catch(() => toast.show(`Couldn't export ${detail.name}`))
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {early ? null : (
          <div className="toggle" role="tablist" aria-label="Section">
            {(["app", "activity", "settings"] as Section[]).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={section === s} onClick={() => setSection(s)}>
                {s === "app" ? "App" : s === "activity" ? "Activity" : "Settings"}
              </button>
            ))}
          </div>
        )}
      </div>
      {inline === "goal" ? (
        <input autoFocus aria-label="Project goal" className="modhead__desc projpage__goalinput" value={draft} placeholder="What this project is for" onChange={(e) => setDraft(e.target.value)} onBlur={() => void saveEdit()} onKeyDown={onEnterBlur} />
      ) : detail.goal ? (
        <div className="modhead__desc editable" onClick={() => startEdit("goal")}>
          {detail.goal}
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="projpage__addgoal" onClick={() => startEdit("goal")}>
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" /> Add goal
        </Button>
      )}
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}

      <CreationOnPage
        client={client}
        detail={detail}
        onChanged={onChanged}
        onDescribe={(text) => onDescribe?.(text)}
        onImport={(file) =>
          void importProject(client, file)
            .then(async (made) => {
              await client.removeModule(detail.id).catch(() => undefined);
              onChanged();
              toast.show(`Added ${made.name}`);
              onGo({ kind: "module", id: made.id });
            })
            .catch((e: unknown) => toast.show(e instanceof Error ? e.message : "Couldn't add that project."))
        }
      />
      {making && detail.plan?.body.trim() ? <PlanSection body={detail.plan.body} /> : null}
      {stage === "done" ? <Ready detail={detail} /> : null}

      {early ? null : section === "app" ? (
        <>
          <div className="subtabs" role="tablist">
            <button type="button" role="tab" aria-selected={!table} onClick={() => setTab("summary")}>
              Summary
            </button>
            {detail.tables.map((t) => (
              <button key={t.name} type="button" role="tab" aria-selected={tab === t.name} onClick={() => setTab(t.name)}>
                {t.title} <span className="faint num">{t.records}</span>
              </button>
            ))}
          </div>
          {table ? (
            <>
              {onQuickEntry ? <QuickEntry key={`quick-${table.name}`} title={table.title} onSend={onQuickEntry} /> : null}
              <DataPage key={table.name} client={client} table={table} version={version} onChanged={onChanged} />
            </>
          ) : (
            <>
              <ProjectNotes client={client} detail={detail} onChanged={onChanged} />
              <ProjectFacts client={client} detail={detail} onChanged={onChanged} />
              <Summary client={client} moduleId={detail.id} version={version} onOpen={setTab} />
            </>
          )}
        </>
      ) : null}

      {!early && section === "activity" ? (
        <>
          <Sessions client={client} detail={detail} onChanged={onChanged} onOpen={onOpenSession} />
          <WentWrong detail={detail} />
          <div className="section">
            <div className="section__head">
              <h2>Everything that happened here</h2>
            </div>
            <ModuleActivity detail={detail} />
          </div>
        </>
      ) : null}

      {!early && section === "settings" ? (
        <>
          {!making && detail.plan?.body.trim() ? <PlanSection body={detail.plan.body} /> : null}
          <div className="section section--first">
            <div className="section__head">
              <h2>What it keeps</h2>
            </div>
            <div className="card list">
              {detail.tables.map((t) => (
                <div key={t.name} className="item item--top">
                  <div className="item__ico" aria-hidden="true">
                    <Folder size={16} />
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
              <h2>What runs on its own</h2>
              <InfoTip content="Switch any off; Alpha says so if something needs it. Ask Alpha to keep something here current and it shows up with a switch." label="About automations" />
            </div>
            <AutomationList client={client} items={detail.automations} onChanged={onChanged} empty="Nothing runs on its own here." />
          </div>
          <SubProjects client={client} detail={detail} modules={modules} onChanged={onChanged} onGo={onGo} />
        </>
      ) : null}
      <ProjectEditDialog
        client={client}
        project={editing ? detail : null}
        subProjects={detail.sub_projects?.length ?? 0}
        edit={editing}
        onClose={() => setEditing(null)}
        onChanged={onChanged}
        onDeleted={() => {
          onChanged();
          onGo({ kind: "home" });
        }}
      />
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
        <button type="button" className="btn btn--sm btn--start" onClick={() => setShown((n) => n + PAGE)}>
          Show more ({rows.length - shown} earlier)
        </button>
      ) : null}
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
            <div key={g.id} className="goal__text">
              {g.text}
            </div>
          ))}
        </div>
      ) : null}
      {data.tables.map((t) => (
        <div key={t.name} className="stack">
          <div className="section__head section__head--tight">
            <h2>{t.title}</h2>
            <span className="faint">
              {t.rows} {t.rows === 1 ? "row" : "rows"}
              {t.added_this_week ? ` · ${t.added_this_week} added this week` : ""}
            </span>
            <span className="section__right">
              <button type="button" className="btn btn--sm" onClick={() => onOpen(t.name)}>
                Open
              </button>
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
              <div className="row">
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
          {data.automations === 1 ? "One thing runs" : `${data.automations} things run`} on its own here{data.next_run ? `; next at ${when(data.next_run)}` : ""}.
        </p>
      ) : null}
    </div>
  );
}

/** "<name> is ready.", once, the first time the page shows it made. */
function Ready({ detail }: { detail: ModuleDetail }) {
  const key = `alpha.module.${detail.id}.ready`;
  const [show] = useState(() => {
    try {
      if (localStorage.getItem(key)) return false;
      localStorage.setItem(key, "1");
    } catch {
      /* shown again next time */
    }
    return true;
  });
  if (!show) return null;
  return (
    <p className="row creation__ready">
      <span className="truncate">{detail.name} is ready.</span>
      <InfoTip content="It's in the sidebar. To change it later, open it and describe the change here." label="How to change it later" />
    </p>
  );
}

/** Alpha's notes on this project (the project's note): click to edit, yours to clear. */
function ProjectNotes({ client, detail, onChanged }: { client: Client; detail: ModuleDetail; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const body = detail.note?.body.trim() ?? "";
  const save = async () => {
    setEditing(false);
    if (draft.trim() === body) return;
    try {
      await client.writeNote(`module:${detail.name}`, detail.name, draft.trim());
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const start = () => {
    setDraft(body);
    setEditing(true);
  };
  return (
    <div className="section section--first">
      <div className="section__head">
        <h2>
          Alpha's notes
          <InfoTip content="What Alpha keeps in mind about this project, from your sessions. Yours to edit or clear." label="About Alpha's notes" />
        </h2>
      </div>
      {editing ? (
        <textarea autoFocus aria-label="Alpha's notes" className="projpage__notesinput" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} />
      ) : body ? (
        <div className="card card--pad">
          <p className="editable projpage__notes" onClick={start}>
            {body}
          </p>
        </div>
      ) : (
        <p className="projempty editable" onClick={start}>
          Nothing yet
        </p>
      )}
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Facts that hold only inside this project: those waiting for a yes, and the accepted ones. */
function ProjectFacts({ client, detail, onChanged }: { client: Client; detail: ModuleDetail; onChanged: () => void }) {
  const facts = detail.facts ?? [];
  const waiting = facts.filter((f) => f.state === "suggested");
  const known = facts.filter((f) => f.state === "accepted");
  const decide = (id: string, accept: boolean) => void client.decideFact(id, accept).then(onChanged, () => undefined);
  return (
    <>
      {waiting.length ? (
        <div className="section">
          <div className="section__head">
            <h2>
              Waiting for your yes
              <InfoTip content="Things Alpha thinks hold for this project; nothing uses them until you accept." label="About suggested project facts" />
            </h2>
          </div>
          <div className="card list" aria-label="Suggested project facts">
            {waiting.map((f) => (
              <div className="item" key={f.id}>
                <div className="item__body">
                  <b>
                    {humanize(f.predicate)}: {f.value}
                  </b>
                  {f.why ? <div className="item__sub">{f.why}</div> : null}
                </div>
                <span className="row projpage__pair">
                  <button type="button" className="btn btn--sm btn--primary" onClick={() => decide(f.id, true)}>
                    Yes, that's right
                  </button>
                  <button type="button" className="btn btn--sm" onClick={() => decide(f.id, false)}>
                    No
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {known.length ? (
        <div className="section">
          <div className="section__head">
            <h2>
              Facts for this project
              <InfoTip content="Hold here only; About you keeps what holds everywhere." label="About project facts" />
            </h2>
          </div>
          <div className="card list" aria-label="Project facts">
            {known.map((f) => (
              <div className="item" key={f.id}>
                <div className="item__body">
                  <b>
                    {humanize(f.predicate)}: {f.value}
                  </b>
                </div>
                <IconButton size="sm" aria-label={`Forget ${humanize(f.predicate)}`} onClick={() => void client.forgetProjectFact(f.id).then(onChanged, () => undefined)}>
                  <X size={14} strokeWidth={1.75} />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** The project's chats: title, how many times you spoke, when, and whether Alpha is working. */
function Sessions({ client, detail, onChanged, onOpen }: { client: Client; detail: ModuleDetail; onChanged: () => void; onOpen?: (id: string) => void }) {
  const sessions = detail.sessions ?? [];
  return (
    <div className="section section--first">
      <div className="section__head">
        <h2>Sessions</h2>
        {sessions.length ? <span className="faint">{sessions.length}</span> : null}
      </div>
      {sessions.length ? (
        <div className="card list" aria-label="Sessions in this project">
          {sessions.map((s) => {
            const title = s.title || "Untitled session";
            return (
              <div className="item" key={s.id}>
                <div className="item__body projrow__body">
                  <button type="button" className="linkbtn projrow__title" onClick={() => onOpen?.(s.id)}>
                    <b>{title}</b>
                  </button>
                  <div className="item__sub projrow__sub">
                    {s.turns} turn{s.turns === 1 ? "" : "s"} · {new Date(s.updated_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {s.state === "working" ? " · working" : ""}
                  </div>
                </div>
                <Tooltip content="Archive session">
                  <IconButton size="sm" className="projrow__action" aria-label={`Archive ${title}`} onClick={() => void client.updateSession(s.id, { state: "done" }).then(onChanged, () => undefined)}>
                    <Archive size={14} strokeWidth={1.75} />
                  </IconButton>
                </Tooltip>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="projempty">None yet</p>
      )}
    </div>
  );
}

/** Recent failures here, in plain words. */
function WentWrong({ detail }: { detail: ModuleDetail }) {
  const failed = detail.activity.filter((e) => e.kind === "failed").slice(0, 8);
  if (!failed.length) return null;
  return (
    <div className="section">
      <div className="section__head">
        <h2>
          What went wrong
          <InfoTip content="Recent failures in plain words, and what Alpha did about them." label="About what went wrong" />
        </h2>
      </div>
      <div className="card list" aria-label="What went wrong">
        {failed.map((e) => (
          <div key={e.id} className="item item--top">
            <span className="item__when">{when(e.at)}</span>
            <div className="item__body activity__text">{e.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Projects filed under this one: add one from elsewhere, or take one out. */
function SubProjects({ client, detail, modules, onChanged, onGo }: { client: Client; detail: ModuleDetail; modules: ModuleCard[]; onChanged: () => void; onGo: (s: Surface) => void }) {
  const mine = detail.sub_projects ?? [];
  // One level deep: a sub project has no sub projects, and one with its own stays on top.
  const elsewhere = detail.project ? [] : modules.filter((m) => m.id !== detail.id && !m.project && !modules.some((c) => c.project === m.id) && !mine.some((c) => c.id === m.id));
  const file = (id: string, project: string | null) => void client.updateModule(id, { project }).then(onChanged, () => undefined);
  return (
    <div className="section">
      <div className="section__head">
        <h2>Sub projects</h2>
        {mine.length ? <span className="faint">{mine.length}</span> : null}
        {elsewhere.length ? (
          <span className="section__right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus size={14} strokeWidth={1.75} aria-hidden="true" /> Add sub project
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {elsewhere.map((m) => (
                  <DropdownMenuItem key={m.id} onSelect={() => file(m.id, detail.id)}>
                    {m.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        ) : null}
      </div>
      {mine.length ? (
        <div className="card list" aria-label="Sub projects">
          {mine.map((m) => {
            const Icon = projectIcon(m);
            return (
              <div className="item" key={m.id}>
                <div className="item__ico" aria-hidden="true">
                  <Icon size={16} />
                </div>
                <div className="item__body projrow__body">
                  <button type="button" className="linkbtn projrow__title" onClick={() => onGo({ kind: "module", id: m.id })}>
                    <b>{m.name}</b>
                  </button>
                  {m.goal ? <InfoTip content={m.goal} label={`About ${m.name}`} /> : null}
                </div>
                <Button variant="ghost" size="sm" className="projrow__action" onClick={() => file(m.id, null)} aria-label={`Take ${m.name} out of this project`}>
                  Take out
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="projempty">None yet</p>
      )}
    </div>
  );
}

/** Alpha's quick entry above a table: type or say one line and Chief of Staff adds it. */
function QuickEntry({ title, onSend }: { title: string; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const typedBefore = useRef("");
  const speech = useSpeech((final, interim) => setText(`${typedBefore.current} ${final} ${interim}`.replace(/\s+/g, " ").trim()));
  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend(`Add to ${title}: ${value}`);
    setText("");
    setSent(true);
  }
  return (
    <form className="card quick quick--table" onSubmit={submit} aria-label={`Quick entry for ${title}`}>
      <Plus size={16} strokeWidth={1.75} aria-hidden="true" className="quick__plus" />
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSent(false);
        }}
        placeholder={`Add to ${title}…`}
        aria-label={`Add to ${title}`}
      />
      {sent ? <span className="faint quick__status">Sent to Chief of Staff</span> : null}
      <MicButton
        listening={speech.listening}
        supported={speech.supported}
        onToggle={() => {
          if (!speech.listening) typedBefore.current = text;
          speech.toggle();
        }}
        small
      />
      <Button type="submit" size="sm" disabled={!text.trim()}>
        Add
      </Button>
    </form>
  );
}
