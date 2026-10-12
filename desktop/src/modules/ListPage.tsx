/**
 * A list's page (the owner, 11 Oct: "Add list opens a page, not a pop-up"): in place of the data
 * view's toolbar, the list's name, its filters, sorts, the columns it shows, its grouping and view
 * type, and whether the collection opens on it, with Cancel and Save list. The records below are
 * the live preview: the data view draws them with this draft while it is open. Nothing is saved
 * until Save list; Cancel (or Escape) drops the draft and goes back. Adding and duplicating a
 * list use this page; a list is renamed from ⋮ and changed from the toolbar.
 */
import { useRef, useState } from "react";
import { Button, Dropdown, MultiDropdown } from "../ui";
import { PlusIcon, ICON_SM } from "../ui/icons";
import type { FieldInfo } from "./fields";
import { fieldLabel, GroupEditor, RuleEditor, ruleFor, SortEditor } from "./FilterUI";
import type { PageView, ViewChoice } from "./DataToolbar";
import type { ViewState } from "./viewState";

export interface ListDraft {
  title: string;
  isDefault: boolean;
  state: ViewState;
}

export function ListPage({ draft, onDraft, fields, order, viewReasons, views, hasDone, saveReason, problem, onSave, onCancel }: {
  draft: ListDraft;
  onDraft: (d: ListDraft) => void;
  fields: FieldInfo[];
  /** Every column in the table's order. */
  order: string[];
  viewReasons: Partial<Record<PageView, string>>;
  views: ViewChoice[];
  /** The collection has a status with done choices: Hide done applies. */
  hasDone: boolean;
  /** Why lists can't be saved here, if they can't. */
  saveReason?: string;
  /** What went wrong saving, beside Save. */
  problem?: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [lastColumn, setLastColumn] = useState(false); // the last column was unticked: refused, and said
  const s = draft.state;
  const set = (p: Partial<ViewState>) => onDraft({ ...draft, state: { ...s, ...p } });
  const label = (name: string) => fieldLabel(fields.find((f) => f.name === name), name);
  const shown = order.filter((c) => !s.hidden.includes(c));
  const groupable = fields.filter((f) => f.kind !== "long_text" && f.kind !== "file");
  const name = draft.title.trim();
  return (
    <form
      ref={form}
      className="listpage"
      aria-label="Add list"
      onSubmit={(e) => {
        e.preventDefault();
        if (name && !saveReason) onSave();
      }}
      onKeyDown={(e) => {
        // Escape steps back, unless a dropdown on the page (drawn elsewhere) took it
        if (e.key === "Escape" && form.current?.contains(e.target as Node)) {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="listpage__row">
        <label className="listpage__lab" htmlFor="listpage-name">
          Name
        </label>
        <input id="listpage-name" className="textfield listpage__name" autoFocus aria-label="List name" value={draft.title} onChange={(e) => onDraft({ ...draft, title: e.target.value })} />
      </div>
      <div className="listpage__row listpage__row--top">
        <span className="listpage__lab">Filters</span>
        <div className="listpage__stack">
          {s.rules.map((r, i) => (
            <RuleEditor key={i} showField fields={fields} rule={r} onChange={(x) => set({ rules: s.rules.map((y, j) => (j === i ? x : y)) })} onRemove={() => set({ rules: s.rules.filter((_, j) => j !== i) })} />
          ))}
          {s.advanced ? <GroupEditor fields={fields} group={s.advanced} onChange={(g) => set({ advanced: g })} /> : null}
          <span className="listpage__line">
            <Button size="sm" variant="ghost" icon={<PlusIcon size={ICON_SM} />} disabled={!fields.length} onClick={() => set({ rules: [...s.rules, ruleFor(fields[0])] })}>
              Add filter
            </Button>
            {hasDone ? (
              <label className="check">
                <input type="checkbox" checked={s.hideDone} onChange={(e) => set({ hideDone: e.target.checked })} /> Hide done
              </label>
            ) : null}
          </span>
        </div>
      </div>
      <div className="listpage__row listpage__row--top">
        <span className="listpage__lab">Sort</span>
        <SortEditor fields={fields} sorts={s.sorts} onChange={(sorts) => set({ sorts })} />
      </div>
      <div className="listpage__row">
        <span className="listpage__lab">Columns shown</span>
        <MultiDropdown size="sm" label="Columns shown" placeholder="None" values={shown} onChange={(next) => { setLastColumn(!next.length); if (next.length) set({ hidden: order.filter((c) => !next.includes(c)) }); }} options={order.map((c) => ({ value: c, label: label(c) }))} />
        {lastColumn ? (
          <span className="notice" role="alert">
            Keep at least one column.
          </span>
        ) : null}
      </div>
      <div className="listpage__row">
        <span className="listpage__lab">Group by</span>
        <Dropdown size="sm" label="Group by" value={s.groupBy ?? ""} onChange={(v) => set({ groupBy: v || null, collapsed: [] })} options={[{ value: "", label: "None" }, ...groupable.map((f) => ({ value: f.name, label: fieldLabel(f) }))]} />
      </div>
      <div className="listpage__row">
        <span className="listpage__lab">View</span>
        <Dropdown size="sm" label="Default view" value={s.view} onChange={(view: PageView) => set({ view })} options={views.map((v) => ({ value: v.id, label: v.label, icon: v.icon, disabled: viewReasons[v.id] }))} />
      </div>
      <label className="check listpage__default">
        <input type="checkbox" checked={draft.isDefault} onChange={(e) => onDraft({ ...draft, isDefault: e.target.checked })} /> Make this the default list
      </label>
      <div className="listpage__actions">
        {problem ? (
          <span className="notice" role="alert">
            {problem}
          </span>
        ) : null}
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabledReason={saveReason ?? (name ? undefined : "Give the list a name first.")}>
          Save list
        </Button>
      </div>
    </form>
  );
}
