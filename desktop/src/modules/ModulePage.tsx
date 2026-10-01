/**
 * A module: its summary, a page per table, what Alpha did here, and what it is made of. The
 * App · Activity · Settings toggle and the subtabs are the current shell's own structure.
 */
import { useEffect, useMemo, useState } from "react";
import type { Client, ModuleDetail, ModuleSummary } from "../core/client";
import { DataPage } from "./DataPage";
import { formatDay, formatNumber, humanize, when } from "./format";
import type { Surface } from "../shell/Rail";
import { AutomationList } from "../shell/Automations";

type Section = "app" | "activity" | "settings";

export function ModulePage({ client, moduleId, version, onChanged }: { client: Client; moduleId: string; version: number; onChanged: () => void; onGo: (s: Surface) => void }) {
  const [detail, setDetail] = useState<ModuleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("app");
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
  if (!detail) {
    return <div className="page">{error ? <p className="notice">{error}</p> : <p className="muted">Loading…</p>}</div>;
  }
  const subtitle = [detail.goal, `${detail.tables.length} ${detail.tables.length === 1 ? "table" : "tables"}`].filter(Boolean).join(" · ");
  return (
    <div className="page page--wide">
      <div className="modhead">
        <div className="modhead__title">
          <div className="modhead__ico" aria-hidden="true">
            ▦
          </div>
          <div style={{ minWidth: 0 }}>
            <h1>{detail.name}</h1>
            <div className="faint">{subtitle}</div>
          </div>
        </div>
        <div className="toggle" role="tablist" aria-label="Section">
          {(["app", "activity", "settings"] as Section[]).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={section === s} onClick={() => setSection(s)}>
              {s === "app" ? "App" : s === "activity" ? "Activity" : "Settings"}
            </button>
          ))}
        </div>
      </div>

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
            <DataPage key={table.name} client={client} table={table} version={version} onChanged={onChanged} />
          ) : (
            <Summary client={client} moduleId={detail.id} version={version} onOpen={setTab} />
          )}
        </>
      ) : null}

      {section === "activity" ? <ModuleActivity detail={detail} /> : null}

      {section === "settings" ? (
        <>
          <div className="section" style={{ marginTop: 0 }}>
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
          <div className="section">
            <div className="section__head">
              <h2>What runs on its own</h2>
              <span className="faint">Switch any off; Alpha says so if something needs it</span>
            </div>
            <AutomationList client={client} items={detail.automations} onChanged={onChanged} empty="Nothing runs on its own here. Ask Alpha to keep something here current and it shows up with a switch." />
          </div>
        </>
      ) : null}
    </div>
  );
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
        <button type="button" className="btn btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setShown((n) => n + PAGE)}>
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
              <div className="row" style={{ marginTop: 8 }}>
                {Object.entries(t.split.counts).map(([choice, n]) => (
                  <span key={choice} className={`pill ${t.split?.done.includes(choice) ? "pill--good" : "pill--gray"}`}>
                    {humanize(choice)} <b className="num">{n}</b>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {t.latest.length ? (
            <div className="card list">
              {t.latest.map((r) => (
                <div key={r.id} className="item">
                  <div className="item__body">{r.title}</div>
                  {r.when ? <span className="faint">{formatDay(r.when)}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">Nothing here yet.</p>
          )}
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
