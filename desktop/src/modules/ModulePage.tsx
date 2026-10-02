/**
 * A project (a module in the core): its name and goal, its summary with Alpha's notes, a page
 * per table, what Alpha did here and what went wrong, and what it is made of. The App ·
 * Activity · Settings toggle and the subtabs are the shell's own structure; the section lives
 * in the address (`#/m/<id>/<section>`).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Folder, Plus } from "lucide-react";
import type { Client, ModuleDetail, ModuleSummary, Source } from "../core/client";
import { Button, InfoTip } from "../ui";
import { projectIcon } from "../shell/projectIcons";
import { DataPage } from "./DataPage";
import { formatNumber, humanize, when } from "./format";
import type { Surface } from "../shell/Rail";
import { AutomationList } from "../shell/Automations";
import { MicButton, useSpeech } from "../shell/voice";

type Section = "app" | "activity" | "settings";

export function ModulePage({
  client,
  moduleId,
  version,
  onChanged,
  onGo,
  section: shownSection,
  onSection,
  onQuickEntry,
}: {
  client: Client;
  moduleId: string;
  version: number;
  onChanged: () => void;
  onGo: (s: Surface) => void;
  section?: string;
  onSection?: (section: Section) => void;
  /** A table's one-line quick entry, sent to Zazoo in this project's chat. */
  onQuickEntry?: (text: string) => void;
}) {
  const [detail, setDetail] = useState<ModuleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const section: Section = shownSection === "activity" || shownSection === "settings" ? shownSection : "app";
  const setSection = (s: Section) => onSection?.(s);
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
  return (
    <div className={`page page--wide${section === "app" && table ? " page--fill" : ""}`}>
      <div className="modhead">
        <div className="modhead__title">
          <div className="modhead__ico" aria-hidden="true">
            <Icon size={18} />
          </div>
          <h1 className="modhead__name">{detail.name}</h1>
          <span className="faint num">
            {detail.tables.length} {detail.tables.length === 1 ? "table" : "tables"}
          </span>
        </div>
        <div className="toggle" role="tablist" aria-label="Section">
          {(["app", "activity", "settings"] as Section[]).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={section === s} onClick={() => setSection(s)}>
              {s === "app" ? "App" : s === "activity" ? "Activity" : "Settings"}
            </button>
          ))}
        </div>
      </div>
      {detail.goal ? <div className="modhead__desc">{detail.goal}</div> : null}
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}

      {section === "app" ? (
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
              <Summary client={client} moduleId={detail.id} version={version} onOpen={setTab} />
            </>
          )}
        </>
      ) : null}

      {section === "activity" ? (
        <>
          <WentWrong detail={detail} />
          <div className="section">
            <div className="section__head">
              <h2>Everything that happened here</h2>
            </div>
            <ModuleActivity detail={detail} />
          </div>
        </>
      ) : null}

      {section === "settings" ? (
        <>
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

/** Alpha's quick entry above a table: type or say one line and Zazoo adds it. */
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
      {sent ? <span className="faint quick__status">Sent to Zazoo</span> : null}
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
