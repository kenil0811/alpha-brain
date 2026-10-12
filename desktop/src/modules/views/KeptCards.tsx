/**
 * A table's dashboard cards (12 Oct, the owner): no standard dashboard and no Dashboard view; Alpha
 * proposes the cards that help, the person's yes keeps them (`world/cards.py`), and each card is
 * kept as what it measures, so its number is worked out here from the rows every time and stays
 * current. When a table changes in a way that matters, Alpha proposes more (Needs you). Every
 * visual is actionable: one call to action opens exactly those records (`onShowRecords`) or one
 * record (`onOpenRecord`); a card with nothing to act on says so and keeps its button, disabled,
 * with the reason. Charts are plain SVG in the `--chart` colours with a legend always, drawn at
 * the card's real width (`useWidth`). The numbers first (ChatGPT's dashboards, 12 Oct): "As of"
 * says how fresh they are, a period applies to every card, "What changed?" asks Alpha to explain,
 * "Tell me when…" asks for an alert. Edit cards removes one, after asking.
 */
import { useMemo, useState } from "react";
import { toCsv, downloadText } from "../csv";
import { timeText } from "../format";
import type { KeyboardEvent, ReactNode } from "react";
import type { DashboardCard, RecordRow, TableDesc } from "../../core/client";
import { Button, Confirm, IconButton, InfoTip, MetricTile, SectionCard, Toggle, useContextMenu, useWidth } from "../../ui";
import { MoreVertical, X } from "../../ui/icons";
import { computeTile, inPeriod, type Cta, type Period, type Segment, type TileData } from "../dashboard";
import type { FieldInfo } from "../fields";


const PALETTE = ["var(--chart)", "var(--chart-2)", "var(--chart-3)"];
/** Past the third colour the same three come back paler; the label is what tells segments apart. */
const fillOf = (s: Segment) => (s.muted ? { fill: "var(--text-3)", opacity: 0.45 } : { fill: PALETTE[s.index % 3], opacity: s.index < 3 ? 1 : s.index < 6 ? 0.6 : 0.35 });
const pressed = (act: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    act();
  }
};

export function KeptCards({ table, cards, fields, rows, onRemove, onShowRecords, onOpenRecord, onAsk }: { table: Pick<TableDesc, "title" | "title_field">; cards: DashboardCard[]; fields: FieldInfo[]; rows: RecordRow[]; onRemove: (card: DashboardCard) => Promise<string | null>; onShowRecords: (ids: string[], label: string) => void; onOpenRecord: (id: string) => void; onAsk: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<DashboardCard | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  // as fresh as the rows it was worked out from
  const asOf = useMemo(() => new Date(), [rows]);
  const inScope = useMemo(() => inPeriod(rows, fields, period, asOf), [rows, fields, period, asOf]);
  // a card whose field has gone shows nothing until Alpha proposes again
  const shown = useMemo(() => {
    const ctx = { fields, rows: inScope, allRows: rows, titleField: table.title_field, now: asOf };
    return cards.flatMap((card) => {
      const data = computeTile({ id: card.id, type: card.type, field: card.field ?? undefined, measure: card.measure ?? undefined }, ctx);
      // the card's own title, also on what its button shows ("Pipeline value · 3")
      if (!data) return [];
      const label = data.cta.label ? `${card.title} · ${data.cta.label.split(" · ").pop()}` : data.cta.label;
      return [{ card, data: { ...data, title: card.title, cta: { ...data.cta, label } } as TileData }];
    });
  }, [cards, fields, inScope, rows, table.title_field, asOf]);
  const scope = period === "all" ? "" : ` over the last ${period} days`;
  const numbers = shown.map(({ data }) => (data.type === "metric" ? `${data.title}: ${data.value}${data.change ? ` (${data.change})` : ""}` : data.type === "attention" ? `${data.title}: ${data.total}` : `${data.title}: ${data.basis}`)).join("; ");
  const menu = useContextMenu([
    { label: "Edit cards", onSelect: () => setEditing(true), disabled: editing ? "You are editing them; Done ends it." : undefined },
    { label: "Tell me when…", onSelect: () => onAsk(`On the ${table.title} dashboard, tell me when `) },
    { label: "Download as CSV", onSelect: () => downloadText(`${table.title} dashboard.csv`, toCsv([["Card", "Value", "Basis"], ...shown.map(({ data }) => [data.title, data.type === "metric" ? data.value : data.type === "overtime" ? String(data.buckets.reduce((a, b) => a + b.ids.length, 0)) : String(data.total), data.basis])])) },
  ]);
  if (!shown.length) return null;

  const show = (cta: Cta) => onShowRecords(cta.ids, cta.label);
  // the card's title is in the button's name: several cards say "Show these 3"
  const button = (c: Cta, title: string) => (
    <Button size="sm" aria-label={`${c.text} (${title})`} disabledReason={c.disabledReason} onClick={() => show(c)}>
      {c.text}
    </Button>
  );

  function body(d: TileData) {
    if (d.type === "metric") return <MetricTile label={d.title} value={d.value} basis={d.basis} change={d.change} cta={button(d.cta, d.title)} />;
    // a chart card: its total with the label and basis beside it, the chart under them
    if (d.type === "breakdown" || d.type === "overtime") {
      const total = d.type === "breakdown" ? d.total : d.buckets.reduce((a, b) => a + b.ids.length, 0);
      return <MetricTile label={d.title} value={total.toLocaleString()} basis={d.basis} chart={d.type === "breakdown" ? <Breakdown d={d} onShow={onShowRecords} /> : <OverTime d={d} onShow={onShowRecords} />} cta={button(d.cta, d.title)} />;
    }
    return (
      <SectionCard title={d.title} info={d.basis}>
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
        <div className="dash__cta">
          {button(d.cta, d.title)}
          {d.total > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => onAsk(`What should I do about the ${d.total} ${table.title} in "${d.title}"?`)}>
              Ask Alpha what to do
            </Button>
          ) : null}
        </div>
      </SectionCard>
    );
  }

  return (
    <section className="dash" aria-label={`${table.title} dashboard`}>
      <div className="dash__top">
        <div className="dash__tools">
          <span className="dash__asof">As of {timeText(asOf)}</span>
          <Toggle<Period> inBody label="Period" value={period} onChange={setPeriod} items={[{ id: "all", label: "All time" }, { id: "30", label: "30 days" }, { id: "7", label: "7 days" }]} />
          <InfoTip text="The period, and the list, search and filters below, apply to every card. Alpha proposes new cards when this table changes in a way that matters." />
        </div>
        <div className="dash__tools">
          {editing ? (
            <Button size="sm" variant="primary" onClick={() => setEditing(false)}>
              Done
            </Button>
          ) : null}
          <IconButton size="sm" label="Dashboard options" icon={<MoreVertical />} aria-haspopup="menu" onClick={(e) => menu.openFrom(undefined, e.currentTarget)} />
          {menu.menu}
        </div>
      </div>
      {problem ? (
        <p className="dash__problem" role="alert">
          Could not remove the card: {problem}
        </p>
      ) : null}
      <div className="dash__grid">
        {shown.map(({ card, data }) => (
          <div key={card.id} className={`dash__cell dash__cell--${data.type}`}>
            {body(data)}
            {editing ? (
              <div className="dash__edit" role="group" aria-label={`Edit ${data.title}`}>
                <IconButton size="sm" label={`Remove ${data.title}`} icon={<X />} onClick={() => setRemoving(card)} />
              </div>
            ) : null}
          </div>
        ))}
        <div className="dash__cell dash__cell--read">
          <SectionCard title="What changed?" info={`Alpha explains what changed and why, from these numbers: ${numbers}${scope}.`}>
            <p className="dash__none dash__clamp">{numbers}{scope}.</p>
            <div className="dash__cta">
              <Button size="sm" onClick={() => onAsk(`On the ${table.title} dashboard${scope}: ${numbers}. What changed, and why?`)}>
                Ask what changed
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
      <Confirm open={removing !== null} title={`Remove the card ${removing?.title ?? ""}?`} action="Remove" onCancel={() => setRemoving(null)} onConfirm={() => {
        const card = removing;
        setRemoving(null);
        if (card) void onRemove(card).then(setProblem);
      }}>
        Its records stay. Alpha may propose it again when the table changes.
      </Confirm>
    </section>
  );
}

function Legend({ children }: { children: ReactNode }) {
  return <ul className="dash__legend">{children}</ul>;
}

/** One stacked bar and a legend of buttons: each choice with its count, and a click shows its records. */
function Breakdown({ d, onShow }: { d: Extract<TileData, { type: "breakdown" }>; onShow: (ids: string[], label: string) => void }) {
  const sum = d.segments.reduce((s, x) => s + x.count, 0);
  const [box, W] = useWidth<HTMLDivElement>(300);
  let at = 0;
  return (
    <>
      {d.empty ? <p className="dash__none">{d.empty}</p> : null}
      <div className="dchart__box" ref={box}>
      {sum ? (
        <svg className="dchart dchart--stack" width={W} height={20} viewBox={`0 0 ${W} 20`} role="group" aria-label={d.title}>
          {d.segments.map((s) => {
            const w = (s.count / sum) * W;
            const x = at;
            at += w;
            return w ? <rect key={s.key} x={x} width={w} height={20} {...fillOf(s)} stroke="var(--surface)" strokeWidth={2} aria-hidden="true" className="dchart__seg" onClick={() => onShow(s.ids, s.showLabel)} /> : null;
          })}
        </svg>
      ) : null}
      </div>
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
  const [box, W] = useWidth<HTMLDivElement>(300);
  const top = 16;
  const base = 120;
  const n = d.buckets.length;
  const max = Math.max(1, ...d.buckets.map((b) => b.value));
  const slot = W / Math.max(n, 1);
  // text is drawn at its real size, so what would collide is left out: the value above a bar
  // when the slot is narrower than the widest value, an axis label when the labels would touch
  // (every bar still says its value in its name and on hover)
  const GLYPH = 6.5;
  const showValues = slot >= Math.max(...d.buckets.map((b) => b.valueText.length), 1) * GLYPH + 4;
  const step = Math.max(1, Math.ceil((n * (Math.max(...d.buckets.map((b) => b.short.length), 1) * GLYPH + 12)) / W));
  return (
    <>
      {d.empty ? <p className="dash__none">{d.empty}</p> : null}
      <div className="dchart__box" ref={box}>
      {n ? (
        <svg className="dchart" width={W} height={140} viewBox={`0 0 ${W} 140`} role="group" aria-label={d.title}>
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
                {live ? <title>{`${b.label}: ${b.valueText}`}</title> : null}
                {live && showValues ? (
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
      </div>
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
