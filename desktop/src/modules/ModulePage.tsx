/**
 * A module: its summary, a page per table, what Alpha did here, and what it is made of. The
 * App · Activity · Settings toggle and the subtabs are the current shell's own structure.
 */
import { useEffect, useMemo, useState } from "react";
import type { Client, ModuleDetail } from "../core/client";
import { DataPage } from "./DataPage";
import { formatNumber, humanize, when } from "./format";
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
            <div className="blocks">
              <div className="metrics">
                {detail.tables.map((t) => (
                  <button key={t.name} type="button" className="card metric linkbtn" onClick={() => setTab(t.name)}>
                    <div className="metric__lab">{t.title}</div>
                    <div className="metric__big num">
                      {formatNumber(t.records)} <small>{t.records === 1 ? "row" : "rows"}</small>
                    </div>
                    <div className="metric__sub">{t.fields.slice(0, 4).map((f) => f.label ?? humanize(f.name)).join(" · ")}</div>
                  </button>
                ))}
                {detail.goals.map((g) => (
                  <div key={g.id} className="card metric">
                    <div className="metric__lab">Goal</div>
                    <div style={{ marginTop: 6 }}>{g.text}</div>
                    <div className="metric__sub">Since {when(g.since)}</div>
                  </div>
                ))}
              </div>
              {detail.automations.length ? <AutomationList client={client} items={detail.automations} onChanged={onChanged} empty="" /> : null}
              {detail.note ? (
                <div className="card textblock">
                  <h3>Alpha's note</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{detail.note.body}</p>
                </div>
              ) : null}
              {detail.threads.length ? (
                <div className="card list">
                  {detail.threads.map((t) => (
                    <div key={t.id} className="item">
                      <span className="badge badge--running">{t.state === "open" ? "Open" : t.state}</span>
                      <div className="item__body">
                        <b>{t.title}</b>
                        <div className="item__sub">A thread Alpha is working in · started {when(t.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <RecentChanges detail={detail} limit={6} />
            </div>
          )}
        </>
      ) : null}

      {section === "activity" ? (
        <>
          <div className="section" style={{ marginTop: 0 }}>
            <div className="section__head">
              <h2>What runs on its own</h2>
            </div>
            <AutomationList client={client} items={detail.automations} onChanged={onChanged} empty="Nothing runs on its own here yet. Ask Alpha to keep something here current and it shows up with a switch." />
          </div>
          <div className="section">
            <div className="section__head">
              <h2>What happened here</h2>
            </div>
            <RecentChanges detail={detail} limit={100} />
          </div>
        </>
      ) : null}

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
              <h2>Made</h2>
            </div>
            <p className="muted">{when(detail.created_at)}. To change what it keeps, tell Alpha ("add a fibre column", "track protein too").</p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RecentChanges({ detail, limit }: { detail: ModuleDetail; limit: number }) {
  const rows = detail.activity.filter((e) => ["did", "changed", "made", "saw", "failed"].includes(e.kind)).slice(0, limit);
  if (!rows.length) return null;
  return (
    <div className="card list" aria-label="Recent changes">
      {rows.map((e) => (
        <div key={e.id} className="item">
          <span className="item__when">{when(e.at)}</span>
          <span className={`badge ${e.kind === "failed" ? "badge--failed" : e.actor === "person" ? "" : "badge--succeeded"}`}>{e.actor === "person" ? "You" : e.kind === "failed" ? "Failed" : "Alpha"}</span>
          <div className="item__body">{e.text}</div>
        </div>
      ))}
    </div>
  );
}
