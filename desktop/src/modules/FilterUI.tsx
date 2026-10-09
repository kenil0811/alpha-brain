/**
 * Notion's filter and sort editors for the data view (9 Oct, the owner's parity pass): a rule is
 * property · operator · value, with the operators the property's kind offers; an advanced filter
 * is rules joined by And or Or with one level of groups; sorts are several rules, dragged into
 * priority. Under the toolbar, each simple rule is a chip that opens its own editor, then the
 * advanced filter's chip, the sort chip, and the temporary narrowings (Hide done, Showing gone,
 * the dashboard's picked records), left-aligned, with Clear all.
 */
import { useState } from "react";
import type { FieldInfo } from "./fields";
import { humanize } from "./format";
import { Badge, Button, Dropdown, IconButton, Popover } from "../ui";
import { ArrowDown, ArrowUp, DeleteIcon, GripIcon, ICON_SM, PlusIcon, X } from "../ui/icons";
import { isGroup, needsValue, opsFor, OP_LABEL, RELATIVE_DAYS, WITHIN, type FilterGroup, type FilterOp, type FilterRule, type Sort } from "./views/engine";

export const fieldLabel = (f: FieldInfo | undefined, name = "") => f?.label ?? humanize(f?.name ?? name);

/** A new rule on a field, starting with its kind's first operator. */
export const ruleFor = (f: FieldInfo): FilterRule => ({ field: f.name, op: opsFor(f.kind)[0], value: "" });

/** A rule in words, for its chip: "Status: Sold", "Price > 100", "Due: Is empty". */
export function ruleText(rule: FilterRule, f: FieldInfo | undefined): string {
  const name = fieldLabel(f, rule.field);
  if (!needsValue(rule.op)) return `${name}: ${OP_LABEL[rule.op]}`;
  const raw = rule.value ?? "";
  const value = !raw ? "…" : RELATIVE_DAYS[raw] ?? WITHIN[raw] ?? (f?.choices ? humanize(raw) : raw);
  if (rule.op === "is") return `${name}: ${value}`;
  return `${name} ${OP_LABEL[rule.op].toLowerCase()} ${value}`;
}

function ValueEditor({ field, rule, onChange }: { field: FieldInfo | undefined; rule: FilterRule; onChange: (value: string) => void }) {
  if (!needsValue(rule.op)) return null;
  const kind = field?.kind ?? "text";
  const value = rule.value ?? "";
  const label = `Value for ${fieldLabel(field, rule.field)}`;
  if (field?.choices?.length) return <Dropdown size="sm" label={label} value={value} onChange={onChange} placeholder="Choose…" options={field.choices.map((c) => ({ value: c, label: humanize(c) }))} />;
  if (kind === "date" || kind === "datetime") {
    if (rule.op === "within") return <Dropdown size="sm" label={label} value={value} onChange={onChange} options={Object.entries(WITHIN).map(([v, l]) => ({ value: v, label: l }))} />;
    const exact = !(value in RELATIVE_DAYS);
    return (
      <>
        <Dropdown size="sm" label={`${label}: when`} value={exact ? "exact" : value} onChange={(v) => onChange(v === "exact" ? "" : v)} options={[...Object.entries(RELATIVE_DAYS).map(([v, l]) => ({ value: v, label: l })), { value: "exact", label: "Exact date" }]} />
        {exact ? <input className="frule__input" type="date" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} /> : null}
      </>
    );
  }
  return <input className="frule__input" type={kind === "number" ? "number" : "text"} aria-label={label} placeholder="Value" value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** One rule: [property] · operator · value · delete. */
export function RuleEditor({ fields, rule, onChange, onRemove, showField }: { fields: FieldInfo[]; rule: FilterRule; onChange: (r: FilterRule) => void; onRemove: () => void; showField?: boolean }) {
  const field = fields.find((f) => f.name === rule.field);
  const ops = opsFor(field?.kind ?? "text");
  return (
    <div className="frule">
      {!showField ? <span className="frule__name">{fieldLabel(field, rule.field)}</span> : null}
      {showField ? <Dropdown size="sm" label="Property" value={rule.field} onChange={(name) => onChange(ruleFor(fields.find((f) => f.name === name)!))} options={fields.map((f) => ({ value: f.name, label: fieldLabel(f) }))} /> : null}
      <Dropdown size="sm" label="Condition" value={rule.op} onChange={(op: FilterOp) => onChange({ ...rule, op, value: needsValue(op) ? (op === "within" ? "past_week" : rule.op === "within" ? "" : rule.value) : undefined })} options={ops.map((op) => ({ value: op, label: OP_LABEL[op] }))} />
      <ValueEditor field={field} rule={rule} onChange={(value) => onChange({ ...rule, value })} />
      <IconButton size="sm" label="Delete filter" icon={<DeleteIcon size={ICON_SM} />} onClick={onRemove} />
    </div>
  );
}

/** An advanced filter: Where · And/Or · …, each line a rule or a group (one level). */
export function GroupEditor({ fields, group, onChange, nested }: { fields: FieldInfo[]; group: FilterGroup; onChange: (g: FilterGroup | null) => void; nested?: boolean }) {
  const set = (i: number, r: FilterRule | FilterGroup | null) => {
    const rules = r ? group.rules.map((x, j) => (j === i ? r : x)) : group.rules.filter((_, j) => j !== i);
    onChange(rules.length || !nested ? { ...group, rules } : null);
  };
  const first = fields[0];
  return (
    <div className={nested ? "fgroup fgroup--nested" : "fgroup"}>
      {group.rules.map((r, i) => (
        <div key={i} className="fgroup__line">
          <span className="fgroup__join">
            {i === 0 ? "Where" : i === 1 ? <Dropdown size="sm" label="And or Or" value={group.join} onChange={(join: "and" | "or") => onChange({ ...group, join })} options={[{ value: "and", label: "And" }, { value: "or", label: "Or" }]} /> : group.join === "and" ? "And" : "Or"}
          </span>
          {isGroup(r) ? <GroupEditor fields={fields} group={r} nested onChange={(g) => set(i, g)} /> : <RuleEditor showField fields={fields} rule={r} onChange={(x) => set(i, x)} onRemove={() => set(i, null)} />}
        </div>
      ))}
      <div className="fgroup__add">
        <Button size="sm" variant="ghost" icon={<PlusIcon size={ICON_SM} />} disabled={!first} onClick={() => onChange({ ...group, rules: [...group.rules, ruleFor(first)] })}>
          Add rule
        </Button>
        {!nested ? (
          <Button size="sm" variant="ghost" icon={<PlusIcon size={ICON_SM} />} disabled={!first} onClick={() => onChange({ ...group, rules: [...group.rules, { join: "and", rules: [ruleFor(first)] }] })}>
            Add group
          </Button>
        ) : null}
        {!nested ? (
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            Delete filter
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Several sorts: property · direction · remove, dragged (or moved) into priority. */
export function SortEditor({ fields, sorts, onChange }: { fields: FieldInfo[]; sorts: Sort[]; onChange: (s: Sort[]) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= sorts.length || from === to) return;
    const next = [...sorts];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    onChange(next);
  };
  const unused = fields.filter((f) => !sorts.some((s) => s.field === f.name));
  return (
    <div className="fsort">
      {sorts.map((s, i) => (
        <div key={s.field} className="fsort__line" draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}>
          <GripIcon size={ICON_SM} className="fsort__grip" aria-hidden="true" />
          <Dropdown size="sm" label="Sort by" value={s.field} onChange={(field) => onChange(sorts.map((x, j) => (j === i ? { ...x, field } : x)))} options={fields.filter((f) => f.name === s.field || unused.includes(f)).map((f) => ({ value: f.name, label: fieldLabel(f) }))} />
          <Dropdown size="sm" label="Direction" value={s.direction} onChange={(direction: "asc" | "desc") => onChange(sorts.map((x, j) => (j === i ? { ...x, direction } : x)))} options={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]} />
          <IconButton size="sm" label={`Move ${fieldLabel(fields.find((f) => f.name === s.field), s.field)} up`} icon={<ArrowUp size={ICON_SM} />} disabled={i === 0} onClick={() => move(i, i - 1)} />
          <IconButton size="sm" label={`Move ${fieldLabel(fields.find((f) => f.name === s.field), s.field)} down`} icon={<ArrowDown size={ICON_SM} />} disabled={i === sorts.length - 1} onClick={() => move(i, i + 1)} />
          <IconButton size="sm" label="Remove sort" icon={<X size={ICON_SM} />} onClick={() => onChange(sorts.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="fgroup__add">
        <Button size="sm" variant="ghost" icon={<PlusIcon size={ICON_SM} />} disabled={!unused.length} onClick={() => onChange([...sorts, { field: unused[0].name, direction: "asc" }])}>
          Add sort
        </Button>
        {sorts.length ? (
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            Delete sort
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** What narrows or orders the view, under the toolbar: one chip per simple rule (click to edit),
 *  the advanced filter, the sorts, and the temporary ones, each removable, with Clear all. */
export function FilterBar({ fields, rules, onRules, advanced, onAdvanced, sorts, onSorts, openChip, onOpenChip, extra, onClearAll }: {
  fields: FieldInfo[];
  rules: FilterRule[];
  onRules: (r: FilterRule[]) => void;
  advanced: FilterGroup | null;
  onAdvanced: (g: FilterGroup | null) => void;
  sorts: Sort[];
  onSorts: (s: Sort[]) => void;
  /** Which chip's editor is open: a rule's index, "advanced" or "sort". */
  openChip: number | "advanced" | "sort" | null;
  onOpenChip: (c: number | "advanced" | "sort" | null) => void;
  extra: { key: string; text: string; onRemove: () => void }[];
  onClearAll: () => void;
}) {
  if (!rules.length && !advanced && !sorts.length && !extra.length) return null;
  const byName = new Map(fields.map((f) => [f.name, f]));
  const opener = (c: number | "advanced" | "sort") => (o: boolean) => onOpenChip(o ? c : null);
  const count = advanced ? advanced.rules.reduce((n, r) => n + (isGroup(r) ? r.rules.length : 1), 0) : 0;
  const chip = (text: string, remove: () => void, open?: () => void) => (
    <Badge tone="info" className="fpill">
      {open ? (
        <button type="button" className="fpill__open" onClick={open}>
          {text}
        </button>
      ) : (
        text
      )}
      <button type="button" className="fpill__x" aria-label={`Remove filter: ${text}`} onClick={(e) => { e.stopPropagation(); onOpenChip(null); remove(); }}>
        <X size={12} aria-hidden="true" />
      </button>
    </Badge>
  );
  return (
    <div className="fpills" aria-label="Active filters">
      {sorts.length ? (
        <Popover label="Sort" align="start" open={openChip === "sort"} onOpenChange={opener("sort")} trigger={<span>{chip(sorts.map((s) => `${s.direction === "asc" ? "↑" : "↓"} ${fieldLabel(byName.get(s.field), s.field)}`).join(", "), () => onSorts([]), () => onOpenChip("sort"))}</span>}>
          <SortEditor fields={fields} sorts={sorts} onChange={onSorts} />
        </Popover>
      ) : null}
      {rules.map((r, i) => {
        const text = ruleText(r, byName.get(r.field));
        return (
          <Popover key={`${r.field}-${i}`} label={`Filter: ${text}`} align="start" open={openChip === i} onOpenChange={opener(i)} trigger={<span>{chip(text, () => onRules(rules.filter((_, j) => j !== i)), () => onOpenChip(i))}</span>}>
            <RuleEditor fields={fields} rule={r} onChange={(x) => onRules(rules.map((y, j) => (j === i ? x : y)))} onRemove={() => { onOpenChip(null); onRules(rules.filter((_, j) => j !== i)); }} />
          </Popover>
        );
      })}
      {advanced ? (
        <Popover label="Advanced filter" align="start" open={openChip === "advanced"} onOpenChange={opener("advanced")} trigger={<span>{chip(`${count} ${count === 1 ? "rule" : "rules"}`, () => onAdvanced(null), () => onOpenChip("advanced"))}</span>}>
          <GroupEditor fields={fields} group={advanced} onChange={onAdvanced} />
        </Popover>
      ) : null}
      {extra.map((p) => (
        <span key={p.key}>{chip(p.text, p.onRemove)}</span>
      ))}
      <Button size="sm" variant="ghost" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}
