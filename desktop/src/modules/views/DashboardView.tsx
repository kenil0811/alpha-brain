/**
 * The Dashboard view (9 Oct, the UI rulebook §6): a page of visuals where every visual is
 * actionable. Each tile pairs a number, a bar or a list with one call to action that opens exactly
 * those records (`onShowRecords`) or one record (`onOpenRecord`); a tile with nothing to act on says
 * so in a line and keeps its button, disabled, with the reason on hover. What each tile shows is
 * worked out in `modules/dashboard.ts` from the rows the toolbar's list, search and filters leave.
 * Charts are plain SVG in the `--chart` colours with a legend always; every bar and segment is a
 * button with a label, and its count is written beside it so colour never stands alone. "Edit
 * dashboard" adds, removes, moves and resizes tiles; the layout is kept per list in
 * `PREF.dashboards`.
 */
import { useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Client, RecordRow, TableDesc } from "../../core/client";
import { PREF, usePreference } from "../../core/preferences";
import { Button, Dropdown, IconButton, InfoTip, MetricTile, SectionCard } from "../../ui";
import { ArrowDown, ArrowUp, AverageIcon, CountIcon, Flag, Maximize2, Minimize2, Pencil, TotalIcon, X } from "../../ui/icons";
import { availableTiles, computeTile, defaultTiles, type Cta, type Segment, type Tile, type TileData } from "../dashboard";
import type { FieldInfo } from "../fields";

export { dashboardAvailable } from "../dashboard";

const METRIC_ICON = { count: <CountIcon />, sum: <TotalIcon />, avg: <AverageIcon />, flag: <Flag /> };
const PALETTE = ["var(--chart)", "var(--chart-2)", "var(--chart-3)"];
/** Past the third colour the same three come back paler; the label is what tells segments apart. */
const fillOf = (s: Segment) => (s.muted ? { fill: "var(--text-3)", opacity: 0.45 } : { fill: PALETTE[s.index % 3], opacity: s.index < 3 ? 1 : s.index < 6 ? 0.6 : 0.35 });
const pressed = (act: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    act();
  }
};

export function DashboardView({ client, table, fields, rows, listKey, onShowRecords, onOpenRecord, onAsk }: { client: Client; table: TableDesc; fields: FieldInfo[]; rows: RecordRow[]; listKey: string; onShowRecords: (ids: string[], label: string) => void; onOpenRecord: (id: string) => void; onAsk: (text: string) => void }) {
  const [saved, setSaved] = usePreference<Record<string, Tile[]>>(client, PREF.dashboards, {});
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const layout = saved?.[listKey];
  // a saved tile whose field has gone is dropped the next time the layout is saved
  const shown = useMemo(() => {
    const ctx = { fields, rows, titleField: table.title_field };
    return (layout ?? defaultTiles(fields)).flatMap((t) => {
      const data = computeTile(t, ctx);
      return data ? [{ tile: t, data }] : [];
    });
  }, [layout, fields, rows, table.title_field]);

  async function save(next: Tile[] | null) {
    const all = { ...(saved ?? {}) };
    if (next) all[listKey] = next;
    else delete all[listKey];
    setProblem(await setSaved(all));
  }
  const tiles = shown.map((s) => s.tile);
  const change = (i: number, patch: Partial<Tile>) => save(tiles.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i: number, by: number) => {
    const next = [...tiles];
    next.splice(i + by, 0, ...next.splice(i, 1));
    return save(next);
  };
  const addable = availableTiles(fields).filter((a) => !tiles.some((t) => t.id === a.tile.id));

  const show = (cta: Cta) => onShowRecords(cta.ids, cta.label);
  // the tile's title is in the button's name: several tiles say "Show these 3"
  const button = (c: Cta, title: string) => (
    <Button size="sm" aria-label={`${c.text} (${title})`} disabledReason={c.disabledReason} onClick={() => show(c)}>
      {c.text}
    </Button>
  );
  const cta = (c: Cta, title: string) => <div className="dash__cta">{button(c, title)}</div>;

  function body(d: TileData) {
    if (d.type === "metric") return <MetricTile icon={METRIC_ICON[d.icon]} label={d.title} value={d.value} basis={d.basis} cta={button(d.cta, d.title)} />;
    return (
      <SectionCard title={d.title}>
        {d.type === "breakdown" ? <Breakdown d={d} onShow={onShowRecords} /> : null}
        {d.type === "overtime" ? <OverTime d={d} onShow={onShowRecords} /> : null}
        {d.type === "attention" ? (
          <>
            {d.empty ? <p className="dash__none">{d.empty}</p> : null}
            <ul className="dash__att">
              {d.items.map((item) => (
                <li key={item.id} className="dash__att-row">
                  <span className="dash__att-text">
                    <b>{item.title}</b>
                    <span className="dash__why">{item.reasons.join(" · ")}</span>
                  </span>
                  <Button size="sm" variant="ghost" aria-label={`Open ${item.title}`} onClick={() => onOpenRecord(item.id)}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="dash__basis">{d.basis}</p>
        {cta(d.cta, d.title)}
        {d.type === "attention" && d.total > 0 ? (
          <div className="dash__cta">
            <Button size="sm" variant="ghost" onClick={() => onAsk(`What should I do about the ${d.total} ${table.title} that need attention?`)}>
              Ask Alpha what to do
            </Button>
          </div>
        ) : null}
      </SectionCard>
    );
  }

  return (
    <section className="dash" aria-label="Dashboard">
      <div className="dash__top">
        <span className="dash__lead">
          Every tile shows what it is based on
          <InfoTip text="The list, search and filters above apply to every tile." />
        </span>
        <div className="dash__tools">
          {editing ? (
            <>
              {addable.length ? (
                <Dropdown size="sm" label="Add a tile" value="" placeholder="Add a tile…" options={addable.map((a) => ({ value: a.tile.id, label: a.label }))} onChange={(id) => save([...tiles, addable.find((a) => a.tile.id === id)!.tile])} />
              ) : (
                <Button size="sm" disabledReason="Every kind of tile for these fields is already here.">
                  Add a tile…
                </Button>
              )}
              <Button size="sm" variant="ghost" disabledReason={layout ? undefined : "This is already the default layout."} onClick={() => save(null)}>
                Reset to default
              </Button>
            </>
          ) : null}
          <Button size="sm" icon={editing ? undefined : <Pencil />} onClick={() => setEditing(!editing)}>
            {editing ? "Done" : "Edit dashboard"}
          </Button>
        </div>
      </div>
      {problem ? (
        <p className="dash__problem" role="alert">
          Could not save the layout: {problem}
        </p>
      ) : null}
      {shown.length ? (
        <div className="dash__grid">
          {shown.map(({ tile, data }, i) => (
            <div key={tile.id} className={`dash__cell${tile.size === "wide" ? " dash__cell--wide" : ""}`}>
              {body(data)}
              {editing ? (
                <div className="dash__edit" role="group" aria-label={`Edit ${data.title}`}>
                  <IconButton size="sm" label={`Move ${data.title} earlier`} icon={<ArrowUp />} disabledReason={i === 0 ? "It is already first." : undefined} onClick={() => move(i, -1)} />
                  <IconButton size="sm" label={`Move ${data.title} later`} icon={<ArrowDown />} disabledReason={i === shown.length - 1 ? "It is already last." : undefined} onClick={() => move(i, 1)} />
                  <IconButton size="sm" label={tile.size === "wide" ? `Make ${data.title} normal width` : `Make ${data.title} wide`} icon={tile.size === "wide" ? <Minimize2 /> : <Maximize2 />} onClick={() => change(i, { size: tile.size === "wide" ? "normal" : "wide" })} />
                  <IconButton size="sm" label={`Remove ${data.title}`} icon={<X />} onClick={() => save(tiles.filter((_, j) => j !== i))} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">No tiles on this dashboard. Choose Edit dashboard to add one.</p>
      )}
    </section>
  );
}

function Legend({ children }: { children: ReactNode }) {
  return <ul className="dash__legend">{children}</ul>;
}

/** One stacked bar and a legend of buttons: each choice with its count, and a click shows its records. */
function Breakdown({ d, onShow }: { d: Extract<TileData, { type: "breakdown" }>; onShow: (ids: string[], label: string) => void }) {
  const sum = d.segments.reduce((s, x) => s + x.count, 0);
  let at = 0;
  return (
    <>
      {d.empty ? <p className="dash__none">{d.empty}</p> : null}
      {sum ? (
        <svg className="dchart dchart--stack" viewBox="0 0 300 20" role="group" aria-label={d.title}>
          {d.segments.map((s) => {
            const w = (s.count / sum) * 300;
            const x = at;
            at += w;
            return w ? <rect key={s.key} x={x} width={w} height={20} {...fillOf(s)} stroke="var(--surface)" strokeWidth={2} aria-hidden="true" className="dchart__seg" onClick={() => onShow(s.ids, s.showLabel)} /> : null;
          })}
        </svg>
      ) : null}
      <Legend>
        {d.segments.map((s) => (
          <li key={s.key}>
            {s.count ? (
              <button type="button" className="dash__seg" onClick={() => onShow(s.ids, s.showLabel)}>
                <svg className="dash__swatch" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" {...fillOf(s)} /></svg>
                {s.label} <span className="num dash__count">{s.count}</span>
              </button>
            ) : (
              <span className="dash__seg dash__seg--plain">
                <svg className="dash__swatch" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" {...fillOf(s)} /></svg>
                {s.label} <span className="num dash__count">0</span>
              </span>
            )}
          </li>
        ))}
      </Legend>
    </>
  );
}

/** Bars per week or month: faint grid, the value above each bar, a label every few bars, and each
 *  bar with records a button. */
function OverTime({ d, onShow }: { d: Extract<TileData, { type: "overtime" }>; onShow: (ids: string[], label: string) => void }) {
  const W = 300;
  const top = 16;
  const base = 120;
  const n = d.buckets.length;
  const max = Math.max(1, ...d.buckets.map((b) => b.value));
  const slot = W / Math.max(n, 1);
  const step = Math.ceil(n / 5);
  return (
    <>
      {d.empty ? <p className="dash__none">{d.empty}</p> : null}
      {n ? (
        <svg className="dchart" viewBox={`0 0 ${W} 140`} role="group" aria-label={d.title}>
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1={0} x2={W} y1={base - f * (base - top)} y2={base - f * (base - top)} className="dchart__grid" />
          ))}
          {d.buckets.map((b, i) => {
            const h = (b.value / max) * (base - top);
            const act = () => onShow(b.ids, `${b.label} · ${b.ids.length}`);
            const live = b.ids.length > 0;
            return (
              <g key={b.key} className={live ? "dchart__bar" : undefined} role={live ? "button" : undefined} tabIndex={live ? 0 : undefined} aria-label={live ? `${b.label}: ${b.valueText}. Show these ${b.ids.length}` : undefined} onClick={live ? act : undefined} onKeyDown={live ? pressed(act) : undefined}>
                <rect x={i * slot} y={0} width={slot} height={base} fill="transparent" />
                <rect x={i * slot + slot * 0.15} y={base - h} width={slot * 0.7} height={h} rx={2} fill="var(--chart)" />
                {live ? (
                  <text x={i * slot + slot / 2} y={base - h - 4} textAnchor="middle">
                    {b.valueText}
                  </text>
                ) : null}
                {i % step === 0 ? (
                  <text x={i * slot + slot / 2} y={134} textAnchor="middle">
                    {b.short}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      <Legend>
        <li>
          <span className="dash__seg dash__seg--plain">
            <svg className="dash__swatch" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2" fill="var(--chart)" /></svg>
            {d.legend}
          </span>
        </li>
      </Legend>
    </>
  );
}
