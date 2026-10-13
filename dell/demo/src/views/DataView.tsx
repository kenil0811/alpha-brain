import {
  ArrowDown, ArrowUp, BarChart3, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, Download,
  Eye, EyeOff, Filter, GalleryHorizontal, GanttChart, GripVertical, LayoutDashboard, List as ListIcon, ListFilter,
  NotebookTabs, Pencil, Plus, RotateCcw, Search, SquareKanban, Table2, Trash2, X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button, Card, Confirm, Disabled, Dropdown, Flash, IconButton, MetricTile, More, Pill, Tip, useFlash, type MenuEntry } from "../kit";
import { fmtDate, money, plural } from "../data/format";
import { go, href } from "../data/route";
import { TODAY, useWorld } from "../data/store";
import type { Collection, Field, Project, Rec, ViewType } from "../data/types";
import { CellValue, isDone, toneOf } from "./cells";

const VIEWS: { id: ViewType; label: string; icon: typeof Table2 }[] = [
  { id: "table", label: "Table", icon: Table2 },
  { id: "board", label: "Board", icon: SquareKanban },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "list", label: "List", icon: ListIcon },
  { id: "timeline", label: "Timeline", icon: GanttChart },
  { id: "gallery", label: "Gallery", icon: GalleryHorizontal },
  { id: "chart", label: "Chart", icon: BarChart3 },
  { id: "form", label: "Form", icon: NotebookTabs },
];

const BUILT: ViewType[] = ["table", "board", "calendar", "dashboard"];

function whyNot(v: ViewType, c: Collection): string | undefined {
  if (v === "board" && !c.boardBy) return "Board needs a status field";
  if (v === "calendar" && !c.dateKey) return "Calendar needs a date field";
  if (!BUILT.includes(v)) return "Not part of this demo";
  return undefined;
}

interface Pill { field: string; value: string }

/** The one standard data view (rulebook §6): toolbar, metrics strip, the view, footer, page bar. */
export function DataView({ project, coll }: { project: Project; coll: Collection }) {
  const w = useWorld();
  const all = w.rows(project.id, coll.id);
  const [listId, setListId] = useState("all");
  const [star, setStar] = useState(coll.lists?.find((l) => l.star)?.id ?? "all");
  const [view, setView] = useState<ViewType>(coll.view ?? "table");
  const [q, setQ] = useState("");
  const [pills, setPills] = useState<Pill[]>([]);
  const [hideDone, setHideDone] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [hidden, setHidden] = useState<string[]>(coll.fields.filter((f) => f.hidden).map((f) => f.key));
  const [showMetrics, setShowMetrics] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDel, setConfirmDel] = useState(false);
  const [flash, setFlash] = useFlash();
  const [temp, setTemp] = useState<{ name: string; filter: (r: Rec) => boolean } | null>(null);

  const lists = [{ id: "all", name: "All", filter: () => true }, ...(coll.lists ?? [])];
  const list = lists.find((l) => l.id === listId) ?? lists[0];
  const statusField = coll.fields.find((f) => f.key === coll.boardBy);

  const rows = useMemo(() => {
    let r = all.filter(list.filter);
    if (temp) r = r.filter(temp.filter);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      r = r.filter((x) => coll.fields.some((f) => String(x[f.key] ?? "").toLowerCase().includes(s)));
    }
    for (const p of pills) r = r.filter((x) => String(x[p.field]) === p.value || (Array.isArray(x[p.field]) && (x[p.field] as string[]).includes(p.value)));
    if (hideDone && statusField) r = r.filter((x) => !isDone(statusField, x[statusField.key]));
    if (sort) {
      r = [...r].sort((a, b) => {
        const av = a[sort.key] as never, bv = b[sort.key] as never;
        if (av === bv) return 0;
        if (av === undefined || av === null) return 1;
        if (bv === undefined || bv === null) return -1;
        return (av > bv ? 1 : -1) * sort.dir;
      });
    }
    return r;
  }, [all, list, temp, q, pills, hideDone, sort, coll.fields, statusField]);

  const visible = coll.fields.filter((f) => !hidden.includes(f.key));
  const filterable = coll.fields.filter((f) => f.type === "status" || f.type === "choice" || f.type === "person");

  const addNew = () => {
    const seed: Partial<Rec> = {};
    if (statusField?.options?.[0]) seed[statusField.key] = statusField.options[0].value;
    if (coll.dateKey) seed[coll.dateKey] = TODAY;
    const id = w.addRecord(project.id, coll.id, seed);
    go(href.record(project.id, coll.id, id) + "?new");
  };

  const download = () => {
    const head = visible.map((f) => f.label);
    const body = rows.map((r) => visible.map((f) => JSON.stringify(String(r[f.key] ?? ""))).join(","));
    const blob = new Blob([[head.join(","), ...body].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name} - ${coll.label}.csv`;
    a.click();
    setFlash(`Downloaded ${plural(rows.length, coll.word.toLowerCase())} as CSV`);
  };

  const moreItems: MenuEntry[] = [
    { label: "Sort", icon: ArrowDown, sub: coll.fields.filter((f) => f.type !== "longtext").map((f) => ({ label: f.label, onSelect: () => { setSort({ key: f.key, dir: 1 }); setFlash(`Sorted by ${f.label}`); } })) },
    { label: "Add column", icon: Plus, disabled: "Fields are fixed in this demo" },
    { label: "Columns", icon: Columns3, sub: coll.fields.map((f) => ({ label: f.label, icon: hidden.includes(f.key) ? EyeOff : Eye, onSelect: () => setHidden((h) => (h.includes(f.key) ? h.filter((x) => x !== f.key) : [...h, f.key])) })) },
    { label: "Download", icon: Download, sub: [{ label: "CSV", onSelect: download }, { label: "Excel", disabled: "CSV only in this demo" }] },
    { label: "Reset view", icon: RotateCcw, onSelect: () => { setPills([]); setSort(null); setQ(""); setHideDone(false); setTemp(null); setHidden(coll.fields.filter((f) => f.hidden).map((f) => f.key)); setFlash("View reset"); } },
  ];

  const openFiltered = (name: string, filter: (r: Rec) => boolean) => {
    setTemp({ name, filter });
    setView("table");
  };

  const viewDef = VIEWS.find((v) => v.id === view)!;

  return (
    <div className="dv">
      <div className="toolbar" role="toolbar" aria-label={`${coll.label} toolbar`}>
        <div className="toolbar__left">
          <Dropdown
            value={listId}
            options={lists.map((l) => ({ value: l.id, label: l.name }))}
            onChange={(v) => { setListId(v); setTemp(null); }}
            star={star}
            onStar={(v) => { setStar(v); setFlash("Default list set"); }}
            addLabel="Add list…"
            onAdd={() => setFlash("Lists are fixed in this demo")}
            trigger={<button className="tb"><ListFilter aria-hidden /><span className="tb__label">{list.name}</span><ChevronDown className="tb__chev" aria-hidden /></button>}
          />
          <Dropdown
            value={view}
            options={VIEWS.map((v) => ({ value: v.id, label: v.label, icon: v.icon, disabled: whyNot(v.id, coll) }))}
            onChange={(v) => { setView(v as ViewType); setFlash(`Showing ${VIEWS.find((x) => x.id === v)!.label.toLowerCase()} view`); }}
            addLabel="Add view…"
            trigger={<button className="tb"><viewDef.icon aria-hidden /><span className="tb__label">{viewDef.label}</span><ChevronDown className="tb__chev" aria-hidden /></button>}
          />
          <label className="searchbox">
            <Search aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${coll.label.toLowerCase()}`} aria-label={`Search ${coll.label}`} />
            {q ? <button className="searchbox__clear" aria-label="Clear search" onClick={() => setQ("")}><X aria-hidden /></button> : null}
          </label>
        </div>
        <div className="toolbar__right">
          <Flash msg={flash} />
          <Dropdown
            value={pills.map((p) => `${p.field}=${p.value}`)}
            align="end"
            width={320}
            options={[
              ...(statusField ? [{ value: "__hide_done", label: hideDone ? "Show done" : "Hide done" }] : []),
              ...filterable.flatMap((f) => [...new Set(all.flatMap((r) => (Array.isArray(r[f.key]) ? (r[f.key] as string[]) : r[f.key] ? [String(r[f.key])] : [])))].map((v) => ({ value: `${f.key}=${v}`, label: `${f.label}: ${v}` }))),
            ]}
            onChange={(v) => {
              if (v === "__hide_done") { setHideDone((h) => !h); return; }
              const [field, ...rest] = v.split("=");
              const value = rest.join("=");
              setPills((ps) => (ps.some((p) => p.field === field && p.value === value) ? ps.filter((p) => !(p.field === field && p.value === value)) : [...ps, { field, value }]));
            }}
            addLabel="Add filter…"
            trigger={<button className="tb"><Filter aria-hidden /><span className="tb__label">Filter</span></button>}
          />
          {coll.metrics?.length && !showMetrics ? <IconButton icon={ChevronDown} label="Show numbers" onClick={() => setShowMetrics(true)} /> : null}
          <More items={moreItems} />
        </div>
      </div>

      {pills.length || hideDone || temp ? (
        <div className="filters">
          {temp ? <span className="fpill">{temp.name}<button aria-label="Remove" onClick={() => setTemp(null)}><X aria-hidden /></button></span> : null}
          {hideDone ? <span className="fpill">Hide done<button aria-label="Remove" onClick={() => setHideDone(false)}><X aria-hidden /></button></span> : null}
          {pills.map((p) => (
            <span key={`${p.field}${p.value}`} className="fpill">
              {coll.fields.find((f) => f.key === p.field)?.label}: {p.value}
              <button aria-label="Remove" onClick={() => setPills((ps) => ps.filter((x) => x !== p))}><X aria-hidden /></button>
            </span>
          ))}
          <button className="linkbtn" onClick={() => { setPills([]); setHideDone(false); setTemp(null); }}>Clear all</button>
        </div>
      ) : null}

      {coll.notice ? <div className="notice">{coll.notice}</div> : null}

      {showMetrics && coll.metrics?.length ? (
        <div className="metrics">
          <div className="metrics__row">
            {coll.metrics.map((m) => (
              <MetricTile
                key={m.label}
                icon={m.icon}
                label={m.label}
                value={m.value(rows)}
                basis={m.basis(rows)}
                attention={m.attention?.(rows)}
                onOpen={m.filter ? () => openFiltered(m.label, m.filter!) : undefined}
              />
            ))}
          </div>
          <IconButton className="metrics__hide" icon={ChevronUp} label="Hide numbers" onClick={() => setShowMetrics(false)} />
        </div>
      ) : null}

      {selected.length ? (
        <div className="selbar">
          <span>{plural(selected.length, "selected", "selected")}</span>
          <Button icon={Trash2} onClick={() => setConfirmDel(true)}>Delete</Button>
          <Button variant="ghost" onClick={() => setSelected([])}>Cancel</Button>
        </div>
      ) : null}

      {view === "table" ? (
        <Table project={project} coll={coll} rows={rows} fields={visible} sort={sort} setSort={setSort} selected={selected} setSelected={setSelected} onAdd={addNew} total={all.length} />
      ) : view === "board" && statusField ? (
        <Board project={project} coll={coll} rows={rows} field={statusField} onAdd={addNew} />
      ) : view === "calendar" && coll.dateKey ? (
        <Calendar project={project} coll={coll} rows={rows} />
      ) : view === "dashboard" ? (
        <Dashboard project={project} coll={coll} rows={rows} openFiltered={openFiltered} />
      ) : null}

      <Confirm
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title={`Delete ${plural(selected.length, coll.word.toLowerCase())}?`}
        body={`This removes ${selected.length === 1 ? "it" : "them"} from ${coll.label} and from every list. In this demo, reloading the page brings ${selected.length === 1 ? "it" : "them"} back.`}
        action="Delete"
        onConfirm={() => { w.removeRecords(project.id, coll.id, selected); setFlash(`Deleted ${plural(selected.length, coll.word.toLowerCase())}`); setSelected([]); }}
      />
    </div>
  );
}

function Table({
  project, coll, rows, fields, sort, setSort, selected, setSelected, onAdd, total,
}: {
  project: Project; coll: Collection; rows: Rec[]; fields: Field[]; sort: { key: string; dir: 1 | -1 } | null;
  setSort: (s: { key: string; dir: 1 | -1 } | null) => void; selected: string[]; setSelected: (s: string[] | ((x: string[]) => string[])) => void;
  onAdd: () => void; total: number;
}) {
  const w = useWorld();
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [del, setDel] = useState<Rec | null>(null);
  const sums = fields.map((f) => (f.type === "money" ? rows.reduce((n, r) => n + Number(r[f.key] ?? 0), 0) : null));
  const open = (r: Rec) => go(href.record(project.id, coll.id, r.id));
  const editable = (f: Field) => !f.computed && ["text", "number", "money", "date"].includes(f.type);

  return (
    <div className={["tablewrap", selected.length && "tablewrap--selecting"].filter(Boolean).join(" ")}>
      <div className="tablescroll">
        <table className="tbl">
          <colgroup>
            {fields.map((f) => <col key={f.key} style={{ width: f.width ?? (f.type === "longtext" ? 320 : f.key === coll.titleKey ? 260 : 170) }} />)}
            <col style={{ width: 52 }} />
          </colgroup>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.key} className={f.type === "money" || f.type === "number" || f.type === "percent" ? "th--num" : undefined} aria-sort={sort?.key === f.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
                  <button className="th__btn" onClick={() => setSort(sort?.key === f.key ? (sort.dir === 1 ? { key: f.key, dir: -1 } : null) : { key: f.key, dir: 1 })}>
                    {f.label}
                    {sort?.key === f.key ? (sort.dir === 1 ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />) : null}
                  </button>
                </th>
              ))}
              <th aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={selected.includes(r.id) ? "tr--sel" : undefined} onClick={() => open(r)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(r); }}>
                {fields.map((f, i) => (
                  <td key={f.key} className={[f.type === "money" || f.type === "number" || f.type === "percent" ? "td--num" : "", i === 0 ? "td--first" : "", editable(f) ? "td--edit" : ""].join(" ")}>
                    {i === 0 ? (
                      <span className="rowhandle" onClick={(e) => e.stopPropagation()}>
                        <GripVertical aria-hidden className="rowhandle__grip" />
                        <input
                          type="checkbox"
                          aria-label={`Select ${String(r[coll.titleKey] ?? "")}`}
                          checked={selected.includes(r.id)}
                          onChange={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                        />
                      </span>
                    ) : null}
                    {editing?.id === r.id && editing.key === f.key ? (
                      <input
                        className="cellinput"
                        autoFocus
                        type={f.type === "date" ? "date" : f.type === "text" ? "text" : "number"}
                        defaultValue={String(r[f.key] ?? "")}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Escape") setEditing(null);
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        onBlur={(e) => {
                          const raw = e.target.value;
                          w.setField(project.id, coll.id, r.id, f.key, f.type === "number" || f.type === "money" ? (raw === "" ? null : Number(raw)) : raw);
                          setEditing(null);
                        }}
                      />
                    ) : (
                      <span className="cell"><CellValue field={f} rec={r} rowsOf={w.rows} /></span>
                    )}
                    {editable(f) && !(editing?.id === r.id && editing.key === f.key) ? (
                      <button className="cellpen" aria-label={`Edit ${f.label}`} onClick={(e) => { e.stopPropagation(); setEditing({ id: r.id, key: f.key }); }}>
                        <Pencil aria-hidden />
                      </button>
                    ) : null}
                  </td>
                ))}
                <td className="td--act" onClick={(e) => e.stopPropagation()}>
                  <More
                    label={`Actions for ${String(r[coll.titleKey] ?? "")}`}
                    items={[
                      { label: "Open", onSelect: () => open(r) },
                      { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDel(r) },
                    ]}
                  />
                </td>
              </tr>
            ))}
            <tr className="addrow">
              <td colSpan={fields.length + 1}>
                {coll.noAdd ? (
                  <Disabled reason={coll.noAdd}><span className="addrow__btn addrow__btn--off"><Plus aria-hidden /> New {coll.word.toLowerCase()}</span></Disabled>
                ) : (
                  <button className="addrow__btn" onClick={onAdd}><Plus aria-hidden /> New {coll.word.toLowerCase()}</button>
                )}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              {fields.map((f, i) => (
                <td key={f.key} className={sums[i] !== null ? "td--num" : undefined}>
                  {i === 0 ? <span className="foot">{plural(rows.length, coll.word.toLowerCase())}</span> : sums[i] !== null ? <span className="foot">Sum {money(sums[i]!)}</span> : null}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="pagebar">
        <span>Showing {rows.length ? 1 : 0} to {rows.length} of {rows.length}{rows.length !== total ? ` (of ${total} in ${coll.label})` : ""}</span>
        <span className="pagebar__nav">
          <Disabled reason="This is the first page"><button className="iconbtn" disabled aria-label="Previous page"><ChevronLeft aria-hidden /></button></Disabled>
          <Disabled reason="This is the last page"><button className="iconbtn" disabled aria-label="Next page"><ChevronRight aria-hidden /></button></Disabled>
        </span>
      </div>
      <Confirm
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete ${String(del?.[coll.titleKey] ?? "")}?`}
        body={`This removes the ${coll.word.toLowerCase()} from ${coll.label}. In this demo, reloading the page brings it back.`}
        action="Delete"
        onConfirm={() => del && w.removeRecords(project.id, coll.id, [del.id])}
      />
    </div>
  );
}

function Board({ project, coll, rows, field, onAdd }: { project: Project; coll: Collection; rows: Rec[]; field: Field; onAdd: () => void }) {
  const w = useWorld();
  const [over, setOver] = useState<string | null>(null);
  const meta = coll.fields.filter((f) => f.key !== coll.titleKey && f.key !== field.key && !f.hidden).slice(0, 2);
  return (
    <div className="board">
      {(field.options ?? []).map((o) => {
        const col = rows.filter((r) => r[field.key] === o.value);
        return (
          <div
            key={o.value}
            className={["board__col", over === o.value && "board__col--over"].filter(Boolean).join(" ")}
            onDragOver={(e) => { e.preventDefault(); setOver(o.value); }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); w.setField(project.id, coll.id, e.dataTransfer.getData("text/plain"), field.key, o.value); setOver(null); }}
          >
            <div className="board__head"><Pill tone={o.tone}>{o.value}</Pill><span className="board__n">{col.length}</span></div>
            {col.map((r) => (
              <a key={r.id} className="board__card" href={href.record(project.id, coll.id, r.id)} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}>
                <span className="board__title">{String(r[coll.titleKey] ?? "Untitled")}</span>
                {meta.map((f) => <span key={f.key} className="board__meta"><CellValue field={f} rec={r} rowsOf={w.rows} plain /></span>)}
              </a>
            ))}
          </div>
        );
      })}
      <button className="board__add" onClick={onAdd}><Plus aria-hidden /> New {coll.word.toLowerCase()}</button>
    </div>
  );
}

function Calendar({ project, coll, rows }: { project: Project; coll: Collection; rows: Rec[] }) {
  const [month, setMonth] = useState(() => TODAY.slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const pad = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const statusField = coll.fields.find((f) => f.key === coll.boardBy);
  return (
    <div className="cal">
      <div className="cal__head">
        <IconButton icon={ChevronLeft} label="Previous month" onClick={() => shift(-1)} />
        <span className="cal__title">{first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
        <IconButton icon={ChevronRight} label="Next month" onClick={() => shift(1)} />
        <span className="cal__by">By {coll.fields.find((f) => f.key === coll.dateKey)?.label}</span>
      </div>
      <div className="cal__grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal__dow">{d}</div>)}
        {Array.from({ length: pad }, (_, i) => <div key={`p${i}`} className="cal__day cal__day--pad" />)}
        {Array.from({ length: days }, (_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, "0")}`;
          const items = rows.filter((r) => String(r[coll.dateKey!] ?? "").startsWith(iso));
          return (
            <div key={iso} className={["cal__day", iso === TODAY && "cal__day--today"].filter(Boolean).join(" ")}>
              <span className="cal__num">{i + 1}</span>
              {items.slice(0, 3).map((r) => (
                <a key={r.id} className={`cal__chip cal__chip--${statusField ? toneOf(statusField, r[statusField.key]) : "blue"}`} href={href.record(project.id, coll.id, r.id)}>
                  {String(r[coll.titleKey])}
                </a>
              ))}
              {items.length > 3 ? <span className="cal__more">{items.length - 3} more</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard({ project, coll, rows, openFiltered }: { project: Project; coll: Collection; rows: Rec[]; openFiltered: (n: string, f: (r: Rec) => boolean) => void }) {
  const w = useWorld();
  const status = coll.fields.find((f) => f.key === coll.boardBy);
  const attention = status ? rows.filter((r) => toneOf(status, r[status.key]) === "red") : [];
  const suggestions = w.proposals.filter((p) => p.project === project.id && p.state === "open");
  const total = rows.length || 1;
  return (
    <div className="dboard">
      {(coll.metrics ?? []).slice(0, 3).map((m) => (
        <Card key={m.label} title={m.label} className="dboard__tile">
          <div className="dboard__big">{m.value(rows) ?? "—"}</div>
          <div className="dboard__basis">{m.basis(rows)}</div>
          {m.filter ? <Button onClick={() => openFiltered(m.label, m.filter!)}>Show these →</Button> : <Disabled reason="Nothing to open from this number"><Button disabled>Show these →</Button></Disabled>}
        </Card>
      ))}
      {status ? (
        <Card title={`By ${status.label.toLowerCase()}`} className="dboard__tile dboard__tile--wide">
          <div className="split" role="list">
            {(status.options ?? []).map((o, i) => {
              const n = rows.filter((r) => r[status.key] === o.value).length;
              return n ? (
                <Tip key={o.value} text={`${o.value}: ${n} (${Math.round((n / total) * 100)}%)`}>
                  <button role="listitem" className={`split__part split__part--${i % 5}`} style={{ flexGrow: n }} onClick={() => openFiltered(o.value, (r) => r[status.key] === o.value)} aria-label={`${o.value}: ${n}`} />
                </Tip>
              ) : null;
            })}
          </div>
          <div className="legend">
            {(status.options ?? []).map((o, i) => {
              const n = rows.filter((r) => r[status.key] === o.value).length;
              return n ? <span key={o.value} className="legend__item"><span className={`legend__dot split__part--${i % 5}`} />{o.value} {n}</span> : null;
            })}
          </div>
        </Card>
      ) : null}
      <Card title="Needs attention" className="dboard__tile dboard__tile--wide">
        {attention.length ? (
          <ul className="att">
            {attention.slice(0, 6).map((r) => (
              <li key={r.id}>
                <a href={href.record(project.id, coll.id, r.id)}>{String(r[coll.titleKey])}</a>
                <Pill tone="red">{String(r[status!.key])}</Pill>
                {coll.dateKey && r[coll.dateKey] ? <span className="meta">{fmtDate(String(r[coll.dateKey]))}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Nothing needs attention.</p>
        )}
      </Card>
      <Card title="Alpha's suggestions" className="dboard__tile dboard__tile--wide">
        {suggestions.length ? suggestions.map((p) => <ProposalCard key={p.id} id={p.id} />) : <p className="empty">No suggestions for {coll.label.toLowerCase()} yet.</p>}
      </Card>
    </div>
  );
}

/** Every assistant action is a proposal with Approve and Decline (fixed rule 14). */
export function ProposalCard({ id, compact }: { id: string; compact?: boolean }) {
  const w = useWorld();
  const p = w.proposals.find((x) => x.id === id);
  if (!p) return null;
  const settled = p.state !== "open";
  return (
    <div className={["proposal", settled && "proposal--settled", compact && "proposal--compact"].filter(Boolean).join(" ")}>
      <div className="proposal__task">{p.recordLink ? <a href={p.recordLink}>{p.task}</a> : p.task}</div>
      {!compact ? (
        <dl className="proposal__kv">
          <dt>Outcome</dt><dd>{p.outcome}</dd>
          <dt>Judged by</dt><dd>{p.judged}</dd>
          {p.reaches ? <><dt>Reaches</dt><dd>{p.reaches}</dd></> : null}
          {p.undo ? <><dt>Undo</dt><dd>{p.undo}</dd></> : null}
        </dl>
      ) : null}
      {p.payload && !compact ? <pre className="proposal__payload">{p.payload}</pre> : null}
      <div className="proposal__actions">
        {settled ? (
          <span className={p.state === "approved" ? "proposal__done" : "proposal__no"}>{p.state === "approved" ? "Approved" : "Declined"}</span>
        ) : (
          <>
            <Button variant="primary" onClick={() => w.decide(p.id, true)}>Approve</Button>
            <Button onClick={() => w.decide(p.id, false)}>Decline</Button>
          </>
        )}
      </div>
    </div>
  );
}

export function Section({ title, info, children, actions }: { title: string; info?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return <Card title={title} info={info} actions={actions}>{children}</Card>;
}
