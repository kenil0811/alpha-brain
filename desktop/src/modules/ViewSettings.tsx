/**
 * The view's settings, behind the toolbar's ⋯ (9 Oct, the owner's Notion parity pass): a short
 * list that opens pages, as Notion's does. Layout (the view type and its options: lines, wrap,
 * row height, frozen columns, where records open, load limit, the chart's axes), Properties
 * (show, hide, drag into order), Group and Sub-group, Conditional colour, the record page's
 * sections; then Download, Upload and Reset view. Explanations live in (i) tooltips.
 */
import { useState } from "react";
import type { FieldInfo } from "./fields";
import { Button, Dropdown, IconButton, InfoTip } from "../ui";
import { ArrowLeft, ChevronRight, DownloadIcon, Eye, GripIcon, HideIcon, ICON_SM, PlusIcon, UploadIcon } from "../ui/icons";
import { VIEWS, type PageView } from "./DataToolbar";
import { fieldLabel, RuleEditor, ruleFor } from "./FilterUI";
import type { ColorTone } from "./views/engine";
import type { ViewState } from "./viewState";

export type SettingsPage = "root" | "layout" | "properties" | "group" | "subgroup" | "color" | "sections";

const TONES: { value: ColorTone; label: string }[] = [
  { value: "gray", label: "Grey" },
  { value: "info", label: "Blue" },
  { value: "good", label: "Green" },
  { value: "warn", label: "Yellow" },
  { value: "bad", label: "Red" },
];
const SECTIONS = [
  { id: "notes", label: "Notes" },
  { id: "intelligence", label: "Intelligence" },
  { id: "governance", label: "Governance" },
];
const LIMITS = [10, 25, 50, 100];

export interface SettingsProps {
  page: SettingsPage;
  onPage: (p: SettingsPage) => void;
  state: ViewState;
  patch: (p: Partial<ViewState>) => void;
  fields: FieldInfo[];
  viewReasons: Partial<Record<PageView, string>>;
  /** Every field in the view's order, and which are shown. */
  order: string[];
  shown: string[];
  onShow: (name: string, on: boolean) => void;
  onShowAll: (on: boolean) => void;
  onReorder: (from: string, to: string) => void;
  frozen: number;
  onFrozen: (n: number) => void;
  widthsSet: boolean;
  onResetWidths: () => void;
  dateFields: FieldInfo[];
  /** The field a board groups by when none is chosen. */
  boardField?: string;
  /** Why records can't open in a peek here, if they can't. */
  peekReason?: string;
  sections: string[];
  onSections: (next: string[]) => void;
  onDownload?: (format: "csv" | "xlsx") => void;
  downloadReason?: string;
  uploadHere: boolean;
  onUpload?: () => void;
  uploadReason?: string;
  onReset: () => void;
}

function Toggle({ label, on, set, tip }: { label: string; on: boolean; set: (on: boolean) => void; tip?: string }) {
  return (
    <span className="vset__row">
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {label}
      </label>
      {tip ? <InfoTip text={tip} /> : null}
    </span>
  );
}

function Row({ label, children, tip }: { label: string; children: React.ReactNode; tip?: string }) {
  return (
    <div className="vset__row">
      <span className="vset__lab">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </span>
      {children}
    </div>
  );
}

export function ViewSettings(p: SettingsProps) {
  const s = p.state;
  const byName = new Map(p.fields.map((f) => [f.name, f]));
  const go = (page: SettingsPage, label: string, value?: string) => (
    <button type="button" className="menu__item vset__nav" onClick={() => p.onPage(page)}>
      <span>{label}</span>
      <span className="vset__val">{value}</span>
      <ChevronRight size={ICON_SM} aria-hidden="true" />
    </button>
  );
  const head = (title: string) => (
    <div className="vset__head">
      <IconButton size="sm" label="Back" icon={<ArrowLeft size={ICON_SM} />} onClick={() => p.onPage("root")} />
      <b>{title}</b>
    </div>
  );
  const fieldOptions = p.fields.filter((f) => f.kind !== "long_text" && f.kind !== "file").map((f) => ({ value: f.name, label: fieldLabel(f) }));
  const groupName = s.groupBy ?? (s.view === "board" ? p.boardField : undefined);
  const viewLabel = VIEWS.find((v) => v.id === s.view)?.label ?? "Table";

  if (p.page === "layout") {
    const tableish = s.view === "table";
    const loads = s.view === "table" || s.view === "list" || s.view === "gallery" || s.view === "board";
    const numbers = p.fields.filter((f) => f.kind === "number");
    return (
      <div className="vset">
        {head("Layout")}
        <Row label="Layout">
          <Dropdown size="sm" label="Layout" value={s.view} onChange={(view: PageView) => p.patch({ view })} options={VIEWS.map((v) => ({ value: v.id, label: v.label, icon: v.icon, disabled: p.viewReasons[v.id] }))} />
        </Row>
        {tableish ? (
          <>
            <Toggle label="Show vertical lines" on={s.lines} set={(lines) => p.patch({ lines })} />
            <Toggle label="Wrap all columns" on={s.wrapAll} set={(wrapAll) => p.patch({ wrapAll })} />
            <Row label="Row height">
              <Dropdown size="sm" label="Row height" value={s.rowHeight} onChange={(rowHeight: ViewState["rowHeight"]) => p.patch({ rowHeight })} options={[{ value: "compact", label: "Compact" }, { value: "medium", label: "Medium" }, { value: "tall", label: "Tall" }]} />
            </Row>
            <Row label="Frozen columns">
              <Dropdown size="sm" label="Frozen columns" value={String(p.frozen)} onChange={(v) => p.onFrozen(Number(v))} options={[...new Set([0, 1, 2, 3, p.frozen])].filter((n) => n <= p.shown.length).map((n) => ({ value: String(n), label: n === 0 ? "None" : String(n) }))} />
            </Row>
            {p.widthsSet ? (
              <Button size="sm" variant="ghost" onClick={p.onResetWidths}>
                Reset column widths
              </Button>
            ) : null}
          </>
        ) : null}
        {(s.view === "calendar" || s.view === "timeline") && p.dateFields.length > 1 ? (
          <Row label="Show by">
            <Dropdown size="sm" label="Date field" value={s.dateBy ?? p.dateFields[0].name} onChange={(dateBy) => p.patch({ dateBy })} options={p.dateFields.map((f) => ({ value: f.name, label: fieldLabel(f) }))} />
          </Row>
        ) : null}
        {s.view === "chart" ? (
          <>
            <Row label="Chart type">
              <Dropdown size="sm" label="Chart type" value={s.chart.type} onChange={(type: ViewState["chart"]["type"]) => p.patch({ chart: { ...s.chart, type } })} options={[{ value: "bar", label: "Bar" }, { value: "line", label: "Line" }, { value: "donut", label: "Donut" }]} />
            </Row>
            <Row label="X axis">
              <Dropdown size="sm" label="X axis" value={s.chart.x ?? s.dateBy ?? p.dateFields[0]?.name ?? ""} onChange={(x) => p.patch({ chart: { ...s.chart, x } })} options={fieldOptions} />
            </Row>
            <Row label="Y axis">
              <Dropdown
                size="sm"
                label="Y axis"
                value={s.chart.agg === "count" ? "count" : `${s.chart.agg}:${s.chart.of}`}
                onChange={(v) => {
                  const [agg, of] = v.split(":");
                  p.patch({ chart: { ...s.chart, agg: agg as ViewState["chart"]["agg"], of } });
                }}
                options={[{ value: "count", label: "Count" }, ...numbers.flatMap((f) => [{ value: `sum:${f.name}`, label: `Sum of ${fieldLabel(f)}` }, { value: `average:${f.name}`, label: `Average of ${fieldLabel(f)}` }])]}
              />
            </Row>
          </>
        ) : null}
        <Row label="Open records in">
          <Dropdown size="sm" label="Open records in" value={s.openIn} onChange={(openIn: ViewState["openIn"]) => p.patch({ openIn })} options={[{ value: "side", label: "Side peek", disabled: p.peekReason }, { value: "center", label: "Center peek", disabled: p.peekReason }, { value: "page", label: "Full page" }]} />
        </Row>
        {loads ? (
          <Row label="Load limit" tip="How many records load before “Load more”.">
            <Dropdown size="sm" label="Load limit" value={String(s.loadLimit ?? "pages")} onChange={(v) => p.patch({ loadLimit: v === "pages" ? null : Number(v) })} options={[{ value: "pages", label: "Pages" }, ...LIMITS.map((n) => ({ value: String(n), label: `${n} records` }))]} />
          </Row>
        ) : null}
      </div>
    );
  }

  if (p.page === "properties") return <Properties {...p} head={head("Properties")} byName={byName} />;

  if (p.page === "group" || p.page === "subgroup") {
    const sub = p.page === "subgroup";
    const value = sub ? s.subGroupBy : groupName;
    return (
      <div className="vset">
        {head(sub ? "Sub-group" : "Group")}
        <Row label={sub ? "Sub-group by" : "Group by"}>
          <Dropdown size="sm" label={sub ? "Sub-group by" : "Group by"} value={value ?? ""} onChange={(v) => p.patch(sub ? { subGroupBy: v || null } : { groupBy: v || null, collapsed: [] })} options={[...(s.view === "board" && !sub ? [] : [{ value: "", label: "None" }]), ...fieldOptions]} />
        </Row>
        {!sub && value ? (
          <>
            <Row label="Sort groups">
              <Dropdown size="sm" label="Sort groups" value={s.groupOrder} onChange={(groupOrder: ViewState["groupOrder"]) => p.patch({ groupOrder })} options={[{ value: "manual", label: "Manual" }, { value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]} />
            </Row>
            <Toggle label="Hide empty groups" on={s.hideEmptyGroups} set={(hideEmptyGroups) => p.patch({ hideEmptyGroups })} />
            {s.view !== "board" ? (
              <Button size="sm" variant="ghost" onClick={() => p.patch({ groupBy: null, collapsed: [] })}>
                Remove grouping
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  if (p.page === "color") {
    const set = (i: number, r: ViewState["colors"][number] | null) => p.patch({ colors: r ? s.colors.map((x, j) => (j === i ? r : x)) : s.colors.filter((_, j) => j !== i) });
    return (
      <div className="vset vset--wide">
        {head("Conditional colour")}
        {s.colors.map((c, i) => (
          <div key={i} className="vset__color">
            <RuleEditor showField fields={p.fields} rule={c} onChange={(r) => set(i, { ...c, ...r })} onRemove={() => set(i, null)} />
            <span className="vset__row">
              <Dropdown size="sm" label="Colour" value={c.tone} onChange={(tone: ColorTone) => set(i, { ...c, tone })} options={TONES} />
              <Dropdown size="sm" label="Colour what" value={c.target} onChange={(target: "row" | "cell") => set(i, { ...c, target })} options={[{ value: "row", label: "Row" }, { value: "cell", label: "Cell" }]} />
            </span>
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={<PlusIcon size={ICON_SM} />} disabled={!p.fields.length} onClick={() => p.patch({ colors: [...s.colors, { ...ruleFor(p.fields[0]), tone: "info", target: "row" }] })}>
          Add rule
        </Button>
      </div>
    );
  }

  if (p.page === "sections") {
    return (
      <div className="vset">
        {head("Record page sections")}
        {SECTIONS.map((x) => (
          <Toggle key={x.id} label={x.label} on={p.sections.includes(x.id)} set={(on) => p.onSections(on ? SECTIONS.map((y) => y.id).filter((id) => id === x.id || p.sections.includes(id)) : p.sections.filter((id) => id !== x.id))} />
        ))}
      </div>
    );
  }

  return (
    <div className="vset">
      {go("layout", "Layout", viewLabel)}
      {go("properties", "Properties", `${p.shown.length} shown`)}
      {go("group", "Group", groupName ? fieldLabel(byName.get(groupName), groupName) : "None")}
      {s.view === "board" ? go("subgroup", "Sub-group", s.subGroupBy ? fieldLabel(byName.get(s.subGroupBy), s.subGroupBy) : "None") : null}
      {go("color", "Conditional colour", s.colors.length ? String(s.colors.length) : "")}
      {go("sections", "Record page sections")}
      <div className="menu__sep" />
      <div className="more__stack">
        <Button size="sm" variant="ghost" icon={<DownloadIcon size={ICON_SM} />} disabledReason={p.onDownload ? undefined : p.downloadReason} onClick={() => p.onDownload?.("csv")}>
          Download as CSV
        </Button>
        <Button size="sm" variant="ghost" icon={<DownloadIcon size={ICON_SM} />} disabledReason={p.onDownload ? undefined : p.downloadReason} onClick={() => p.onDownload?.("xlsx")}>
          Download as Excel
        </Button>
        {p.uploadHere ? (
          <Button size="sm" variant="ghost" icon={<UploadIcon size={ICON_SM} />} disabledReason={p.onUpload ? undefined : p.uploadReason} onClick={p.onUpload}>
            Upload
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={p.onReset}>
          Reset view
        </Button>
      </div>
    </div>
  );
}

function Properties(p: SettingsProps & { head: React.ReactNode; byName: Map<string, FieldInfo> }) {
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const list = p.order.filter((n) => fieldLabel(p.byName.get(n), n).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="vset">
      {p.head}
      {p.order.length > 7 ? <input className="ppick__q" placeholder="Search properties" aria-label="Search properties" value={q} onChange={(e) => setQ(e.target.value)} /> : null}
      <div className="vset__row">
        <Button size="sm" variant="ghost" onClick={() => p.onShowAll(true)}>
          Show all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => p.onShowAll(false)}>
          Hide all
        </Button>
      </div>
      {list.map((name) => {
        const on = p.shown.includes(name);
        const label = fieldLabel(p.byName.get(name), name);
        return (
          <div key={name} className="vset__prop" draggable onDragStart={() => setDrag(name)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag && drag !== name) p.onReorder(drag, name); setDrag(null); }}>
            <GripIcon size={ICON_SM} className="fsort__grip" aria-hidden="true" />
            <span className={on ? "vset__name" : "vset__name faint"}>{label}</span>
            <IconButton size="sm" label={on ? `Hide ${label}` : `Show ${label}`} icon={on ? <Eye size={ICON_SM} /> : <HideIcon size={ICON_SM} />} disabled={on && p.shown.length <= 1} onClick={() => p.onShow(name, !on)} />
          </div>
        );
      })}
    </div>
  );
}
