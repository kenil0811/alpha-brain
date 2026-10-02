/**
 * The shell's controls: the filter builder (many conditions, all or any), the sort editor
 * (several levels), the pagination bar, the bar for many selected rows, and the one small
 * naming dialog they share. Ported from Bridge's FilterBuilder, SortEditor, PaginationBar and
 * TableSelectionBar.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog, DialogContent } from "../ui/Dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../ui/DropdownMenu";
import { IconButton } from "../ui/IconButton";
import { Input } from "../ui/Input";
import type { FieldInfo } from "../modules/fields";
import { humanize } from "../modules/format";
import { FILTER_OP_LABELS, VALUELESS_FILTER_OPS, filterOpsForKind, type FilterOp, type RowFilter, type SortSpec } from "./engine";
import { CellEditor, fieldLabel, type Relations } from "./cells";

export const KIND_LABELS: Record<string, string> = {
  text: "Text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  datetime: "Date and time",
  bool: "Yes or no",
  choice: "Choice",
  multichoice: "Several choices",
  status: "Status",
  url: "Link",
  relation: "Link to a record",
};

// ---------- a name ----------

export function NameDialog({ title, initial = "", action, onSave, onCancel, children }: { title: string; initial?: string; action: string; onSave: (name: string) => Promise<boolean> | boolean; onCancel: () => void; children?: React.ReactNode }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  // The dialog focuses its close button on open; the name is what the person came to type.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => input.current?.select(), 0);
    return () => clearTimeout(t);
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    await onSave(name.trim());
    setBusy(false);
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent title={title}>
        <form className="dv-dialog" onSubmit={submit}>
          <Input ref={input} value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" placeholder="Name" />
          {children}
          <div className="dv-dialog__actions">
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {action}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- filters ----------

const MULTI: readonly FilterOp[] = ["is_any_of", "is_none_of"];

export function FilterBuilder({ fields, filters, match, onChange }: { fields: FieldInfo[]; filters: RowFilter[]; match: "all" | "any"; onChange: (filters: RowFilter[], match: "all" | "any") => void }) {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const replace = (i: number, next: RowFilter) => onChange(filters.map((f, j) => (j === i ? next : f)), match);
  const add = () => {
    const f = fields[0];
    if (f) onChange([...filters, { field: f.name, op: filterOpsForKind(f.kind)[0]!, value: "" }], match);
  };
  return (
    <div className="dv-filters">
      {filters.length === 0 ? <p className="dv-faint">No filters</p> : null}
      {filters.map((filter, i) => {
        const field = byName.get(filter.field);
        const ops = filterOpsForKind(field?.kind ?? "text");
        return (
          <div key={i} className="dv-filter">
            {i === 0 ? (
              <span className="dv-filter__join">Where</span>
            ) : i === 1 ? (
              <select className="dv-select dv-filter__join" value={match} aria-label="Match" onChange={(e) => onChange(filters, e.target.value as "all" | "any")}>
                <option value="all">and</option>
                <option value="any">or</option>
              </select>
            ) : (
              <span className="dv-filter__join">{match === "all" ? "and" : "or"}</span>
            )}
            <select
              className="dv-select"
              value={filter.field}
              aria-label="Field"
              onChange={(e) => {
                const next = byName.get(e.target.value);
                const nextOps = filterOpsForKind(next?.kind ?? "text");
                replace(i, { field: e.target.value, op: nextOps.includes(filter.op) ? filter.op : nextOps[0]!, value: "" });
              }}
            >
              {fields.map((f) => (
                <option key={f.name} value={f.name}>
                  {fieldLabel(f)}
                </option>
              ))}
            </select>
            <select className="dv-select" value={filter.op} aria-label="Condition" onChange={(e) => replace(i, { ...filter, op: e.target.value as FilterOp })}>
              {ops.map((op) => (
                <option key={op} value={op}>
                  {FILTER_OP_LABELS[op]}
                </option>
              ))}
            </select>
            {VALUELESS_FILTER_OPS.includes(filter.op) ? <span /> : <FilterValue field={field} filter={filter} onChange={(value) => replace(i, { ...filter, value })} />}
            <IconButton size="sm" aria-label="Remove filter" onClick={() => onChange(filters.filter((_, j) => j !== i), match)}>
              <X size={14} />
            </IconButton>
          </div>
        );
      })}
      <div className="dv-filters__foot">
        <Button size="sm" variant="ghost" onClick={add}>
          <Plus size={14} /> Add filter
        </Button>
        {filters.length ? (
          <Button size="sm" variant="ghost" onClick={() => onChange([], "all")}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterValue({ field, filter, onChange }: { field: FieldInfo | undefined; filter: RowFilter; onChange: (value: string) => void }) {
  const kind = field?.kind ?? "text";
  const choices = field?.choices ?? [];
  if (choices.length && MULTI.includes(filter.op)) {
    const picked = filter.value.split(",").map((s) => s.trim()).filter(Boolean);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="dv-select dv-ellipsis" aria-label="Values">
            {picked.map(humanize).join(", ") || "Choose…"}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {choices.map((c) => (
            <DropdownMenuItem
              key={c}
              onSelect={(e) => {
                e.preventDefault();
                onChange((picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c]).join(", "));
              }}
            >
              {picked.includes(c) ? "✓ " : ""}
              {humanize(c)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  if (choices.length)
    return (
      <select className="dv-select" value={filter.value} aria-label="Value" onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {choices.map((c) => (
          <option key={c} value={c}>
            {humanize(c)}
          </option>
        ))}
      </select>
    );
  const type = kind === "number" ? "number" : kind === "date" || kind === "datetime" ? "date" : "text";
  return <input className="dv-select dv-input" type={type} value={filter.value} aria-label="Value" placeholder="Value" onChange={(e) => onChange(e.target.value)} />;
}

// ---------- sorts ----------

export function SortEditor({ fields, sorts, onChange }: { fields: FieldInfo[]; sorts: SortSpec[]; onChange: (sorts: SortSpec[]) => void }) {
  const unused = fields.filter((f) => !sorts.some((s) => s.id === f.name));
  return (
    <div className="dv-filters">
      {sorts.length === 0 ? <p className="dv-faint">Not sorted</p> : null}
      {sorts.map((s, i) => (
        <div key={s.id} className="dv-sort">
          <span className="dv-filter__join">{i === 0 ? "Sort by" : "then by"}</span>
          <select className="dv-select" value={s.id} aria-label="Field" onChange={(e) => onChange(sorts.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))}>
            {fields
              .filter((f) => f.name === s.id || !sorts.some((x) => x.id === f.name))
              .map((f) => (
                <option key={f.name} value={f.name}>
                  {fieldLabel(f)}
                </option>
              ))}
          </select>
          <select className="dv-select" value={s.dir} aria-label="Direction" onChange={(e) => onChange(sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value as "asc" | "desc" } : x)))}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          <IconButton size="sm" aria-label="Remove sort" onClick={() => onChange(sorts.filter((_, j) => j !== i))}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
      <div className="dv-filters__foot">
        <Button size="sm" variant="ghost" disabled={!unused.length} onClick={() => unused[0] && onChange([...sorts, { id: unused[0].name, dir: "asc" }])}>
          <Plus size={14} /> Add sort
        </Button>
      </div>
    </div>
  );
}

// ---------- pages ----------

export type PageSize = "fit" | number;
export const PAGE_SIZES = [25, 50, 100, 250];

export function PaginationBar({ total, all, offset, size, pageSize, fit, onOffset, onPageSize, status }: { total: number; all: number; offset: number; size: number; pageSize?: PageSize; fit: number; onOffset: (n: number) => void; onPageSize: (s: PageSize) => void; status?: React.ReactNode }) {
  const n = (x: number) => x.toLocaleString();
  const rows = (x: number) => `${n(x)} ${x === 1 ? "row" : "rows"}`;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.floor(offset / size);
  const counted = total > size ? `${n(offset + 1)}–${n(Math.min(total, offset + size))} of ${total === all ? rows(total) : `${n(total)} matching`}` : total === all ? rows(total) : `${n(total)} of ${rows(all)}`;
  return (
    <div className="dv-pager">
      <span className="dv-num dv-ellipsis">{counted}</span>
      {status}
      <span className="dv-spacer" />
      {pageSize === undefined ? null : (
      <label className="dv-pager__size">
        <span>Rows per page</span>
        <select className="dv-select" value={String(pageSize)} onChange={(e) => onPageSize(e.target.value === "fit" ? "fit" : Number(e.target.value))}>
          <option value="fit">Fit{pageSize === "fit" ? ` (${fit})` : ""}</option>
          {PAGE_SIZES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
      )}
      {pages > 1 ? (
        <span className="dv-pager__pages">
          <IconButton size="sm" aria-label="Previous page" disabled={page === 0} onClick={() => onOffset((page - 1) * size)}>
            <ChevronLeft size={14} />
          </IconButton>
          <span className="dv-num">
            {n(page + 1)} of {n(pages)}
          </span>
          <IconButton size="sm" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onOffset((page + 1) * size)}>
            <ChevronRight size={14} />
          </IconButton>
        </span>
      ) : null}
    </div>
  );
}

// ---------- many rows ----------

/** Shown only while rows are selected: set one field on all of them, or remove them. */
export function SelectionBar({ count, matching, fields, relations, onSelectAll, onClear, onSet, onDelete }: { count: number; matching: number; fields: FieldInfo[]; relations: Relations; onSelectAll: () => void; onClear: () => void; onSet: (field: FieldInfo, value: unknown) => void; onDelete: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [setting, setSetting] = useState<FieldInfo | null>(null);
  if (count === 0) return null;
  const rows = `${count.toLocaleString()} ${count === 1 ? "row" : "rows"}`;
  return (
    <div className="dv-selbar" role="status" aria-live="polite">
      <b className="dv-num">{rows} selected</b>
      {count < matching ? (
        <Button size="sm" variant="link" onClick={onSelectAll}>
          Select all {matching.toLocaleString()}
        </Button>
      ) : null}
      <span className="dv-spacer" />
      {setting ? (
        <span className="dv-selbar__set">
          <span>{fieldLabel(setting)}</span>
          <CellEditor
            field={setting}
            value={null}
            relations={relations}
            onDone={(v) => {
              setSetting(null);
              if (v !== undefined) onSet(setting, v);
            }}
          />
        </span>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              Set field
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {fields.map((f) =>
              (f.kind === "choice" || f.kind === "status" || f.kind === "bool") ? (
                <DropdownMenuSub key={f.name}>
                  <DropdownMenuSubTrigger>{fieldLabel(f)}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {(f.kind === "bool" ? ["true", "false"] : (f.choices ?? [])).map((c) => (
                      <DropdownMenuItem key={c} onSelect={() => onSet(f, f.kind === "bool" ? c === "true" : c)}>
                        {f.kind === "bool" ? (c === "true" ? "Yes" : "No") : humanize(c)}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onSelect={() => onSet(f, null)}>Clear</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ) : (
                <DropdownMenuItem key={f.name} onSelect={() => setSetting(f)}>
                  {fieldLabel(f)}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {confirming ? (
        <>
          <Button size="sm" variant="destructive" onClick={() => void onDelete().then(() => setConfirming(false))}>
            Remove {rows}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
          <Trash2 size={14} /> Remove
        </Button>
      )}
      <IconButton size="sm" aria-label="Clear selection" onClick={onClear}>
        <X size={14} />
      </IconButton>
    </div>
  );
}
