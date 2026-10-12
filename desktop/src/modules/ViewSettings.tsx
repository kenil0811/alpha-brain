/**
 * The view's settings, each opened from the toolbar's ⋮ menu into the same dropdown (9 Oct, the
 * owner's Notion parity pass, then his decisions; the menu itself is the kit's, 11 Oct): Sort,
 * Layout (the view type and its options: lines, wrap, row height, frozen columns, load limit),
 * Properties (show, hide, drag into order; a hidden one stays in place, its eye
 * shut), Group and Sub-group, Conditional colour (saying what it coloured), the record page's
 * sections. Records always open as their page (no peek, R12). Explanations live in (i) tooltips.
 */
import { useState } from "react";
import type { FieldInfo } from "./fields";
import { Button, Dropdown, IconButton, InfoTip } from "../ui";
import { MultiDropdown } from "../ui/Dropdown";
import { Eye, GripIcon, HideIcon, ICON_SM, PlusIcon } from "../ui/icons";
import { PropertyPicker, type PageView, type ViewChoice } from "./DataToolbar";
import { fieldLabel, RuleEditor, ruleFor, SortEditor } from "./FilterUI";
import { needsValue, type ColorRule, type ColorTone, type Sort } from "./views/engine";
import type { ViewState } from "./viewState";

export type SettingsPage = "sort" | "layout" | "properties" | "group" | "subgroup" | "color" | "sections";
export const SETTINGS_TITLE: Record<SettingsPage, string> = { sort: "Sort", layout: "Layout", properties: "Properties", group: "Group", subgroup: "Sub-group", color: "Conditional colour", sections: "Record page sections" };

/** What the colour rules do, in words: "Rows coloured by Stage", or "" when no rule is finished. */
export function colourNote(colors: ColorRule[], byName: Map<string, FieldInfo>): string {
  const live = colors.filter((c) => !needsValue(c.op) || c.value);
  if (!live.length) return "";
  const names = (target: "row" | "cell") => [...new Set(live.filter((c) => c.target === target).map((c) => fieldLabel(byName.get(c.field), c.field)))].join(", ");
  return [names("row") ? `Rows coloured by ${names("row")}` : "", names("cell") ? `Cells coloured by ${names("cell")}` : ""].filter(Boolean).join(" · ");
}

/** A new colour rule that colours something at once: the status or a choice field, on its first
 *  choice; else any field, where it has a value. (An empty "is" coloured nothing, which is why
 *  choosing Conditional colour seemed to do nothing.) */
export function firstColour(fields: FieldInfo[]): ColorRule {
  const choice = fields.find((f) => f.kind === "status" && f.choices?.length) ?? fields.find((f) => f.kind === "choice" && f.choices?.length);
  if (choice) return { field: choice.name, op: "is", value: choice.choices![0], tone: "info", target: "row" };
  return { field: fields[0].name, op: "not_empty", tone: "info", target: "row" };
}

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
  state: ViewState;
  patch: (p: Partial<ViewState>) => void;
  fields: FieldInfo[];
  viewReasons: Partial<Record<PageView, string>>;
  /** The view types this page offers. */
  views: ViewChoice[];
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
  sections: string[];
  onSections: (next: string[]) => void;
  sorts: Sort[];
  onSorts: (s: Sort[]) => void;
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
  const fieldOptions = p.fields.filter((f) => f.kind !== "long_text" && f.kind !== "file").map((f) => ({ value: f.name, label: fieldLabel(f) }));
  const groupName = s.groupBy ?? (s.view === "board" ? p.boardField : undefined);

  if (p.page === "layout") {
    const tableish = s.view === "table";
    const loads = s.view === "table" || s.view === "gallery" || s.view === "board";
    return (
      <div className="vset">
        <Row label="Layout">
          <Dropdown size="sm" label="Layout" value={s.view} onChange={(view: PageView) => p.patch({ view })} options={p.views.map((v) => ({ value: v.id, label: v.label, icon: v.icon, disabled: p.viewReasons[v.id] }))} />
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
        {loads ? (
          <Row label="Load limit" tip="How many records load before “Load more”.">
            <Dropdown size="sm" label="Load limit" value={String(s.loadLimit ?? "pages")} onChange={(v) => p.patch({ loadLimit: v === "pages" ? null : Number(v) })} options={[{ value: "pages", label: "Pages" }, ...LIMITS.map((n) => ({ value: String(n), label: `${n} records` }))]} />
          </Row>
        ) : null}
      </div>
    );
  }

  if (p.page === "sort") {
    return (
      <div className="vset vset--wide">
        {s.sorts.length ? <SortEditor fields={p.fields} sorts={s.sorts} onChange={p.onSorts} /> : <PropertyPicker label="Sort by" fields={p.fields} onPick={(x) => p.onSorts([{ field: x.name, direction: "asc" }])} />}
      </div>
    );
  }

  if (p.page === "properties") return <Properties {...p} byName={byName} />;

  if (p.page === "group" || p.page === "subgroup") {
    const sub = p.page === "subgroup";
    const value = sub ? s.subGroupBy : groupName;
    return (
      <div className="vset">
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
    const note = colourNote(s.colors, byName);
    return (
      <div className="vset vset--wide">
        {s.colors.map((c, i) => (
          <div key={i} className="vset__color">
            <RuleEditor showField fields={p.fields} rule={c} onChange={(r) => set(i, { ...c, ...r })} onRemove={() => set(i, null)} />
            <span className="vset__row">
              <Dropdown size="sm" label="Colour" value={c.tone} onChange={(tone: ColorTone) => set(i, { ...c, tone })} options={TONES} />
              <Dropdown size="sm" label="Colour what" value={c.target} onChange={(target: "row" | "cell") => set(i, { ...c, target })} options={[{ value: "row", label: "Row" }, { value: "cell", label: "Cell" }]} />
            </span>
          </div>
        ))}
        <Button size="sm" variant="ghost" icon={<PlusIcon size={ICON_SM} />} disabled={!p.fields.length} onClick={() => p.patch({ colors: [...s.colors, s.colors.length ? { ...ruleFor(p.fields[0]), tone: "info", target: "row" } : firstColour(p.fields)] })}>
          Add rule
        </Button>
        <p className="faint vset__note" role="status">
          {note ? `${note}.` : s.colors.length ? "Choose a value to colour by." : "Nothing is coloured yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="vset">
      <MultiDropdown size="sm" label="Record page sections" placeholder="None" values={p.sections} onChange={(next) => p.onSections(SECTIONS.map((y) => y.id).filter((id) => next.includes(id)))} options={SECTIONS.map((x) => ({ value: x.id, label: x.label }))} />
    </div>
  );
}

function Properties(p: SettingsProps & { byName: Map<string, FieldInfo> }) {
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const list = p.order.filter((n) => fieldLabel(p.byName.get(n), n).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="vset">
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
            <span className="vset__name">{label}</span>
            <IconButton size="sm" label={on ? `Hide ${label}` : `Show ${label}`} icon={on ? <Eye size={ICON_SM} /> : <HideIcon size={ICON_SM} />} disabled={on && p.shown.length <= 1} onClick={() => p.onShow(name, !on)} />
          </div>
        );
      })}
    </div>
  );
}
