/**
 * Views drawn from links. The graph puts each row beside what its link field points at (another
 * table's record, a person, a company) and draws the link; the tree nests rows under the row a
 * link to the table itself names as their parent.
 */
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import { IconButton } from "../../ui/IconButton";
import type { DataRow, ViewConfig } from "../engine";
import { CellValue, fieldLabel, type Link } from "../cells";
import { isParentRelation } from "../eligibility";
import { titleOf } from "./CardViews";
import type { ViewProps } from "../types";

const W = 1000;
const H = 620;
const MAX_NODES = 400;

interface Node {
  key: string;
  label: string;
  own: boolean;
  rowId?: string;
  link?: Link;
  x: number;
  y: number;
  /** A target's label sits under its ring, clear of the rows around it. */
  labelY?: number;
}

const GAP = 14;

/** Rings around what is linked to: each target sits in its own cell of a grid with the rows
 * that point at it on rings around it; rows that point nowhere share a last cell. Deterministic
 * and readable, where a force layout of a few hundred nodes is a hairball.
 * ponytail: one link per row is laid out; a row with several targets sits beside the first. */
function layout(nodes: Node[], edges: [number, number][]): void {
  const hubOf = new Map<number, number>();
  for (const [a, b] of edges) if (!hubOf.has(a) && a !== b) hubOf.set(a, b);
  const hubs = [...new Set(hubOf.values())];
  const children = new Map<number, number[]>(hubs.map((h) => [h, []]));
  const loose: number[] = [];
  nodes.forEach((_, i) => {
    if (children.has(i)) return;
    const h = hubOf.get(i);
    if (h === undefined) loose.push(i);
    else children.get(h)!.push(i);
  });
  // Ring r holds about 2πr / GAP nodes.
  const rings = (count: number) => {
    const out: number[] = [];
    for (let r = 22, left = count; left > 0; r += GAP) {
      const fit = Math.max(6, Math.floor((2 * Math.PI * r) / GAP));
      out.push(Math.min(fit, left));
      left -= fit;
    }
    return out;
  };
  const radius = (count: number) => 22 + Math.max(0, rings(count).length - 1) * GAP;
  const clusters: { hub?: number; members: number[] }[] = hubs.map((h) => ({ hub: h, members: children.get(h)! }));
  if (loose.length) clusters.push({ members: loose });
  const cell = 2 * Math.max(40, ...clusters.map((c) => radius(c.members.length))) + 48;
  const cols = Math.max(1, Math.round(Math.sqrt((clusters.length * W) / H)));
  const rows = Math.ceil(clusters.length / cols);
  const scale = Math.min(1, W / (cols * cell), H / (rows * cell));
  const ox = (W - cols * cell * scale) / 2;
  const oy = (H - rows * cell * scale) / 2;
  clusters.forEach((c, k) => {
    const cx = ox + ((k % cols) + 0.5) * cell * scale;
    const cy = oy + (Math.floor(k / cols) + 0.5) * cell * scale;
    if (c.hub !== undefined) Object.assign(nodes[c.hub]!, { x: cx, y: cy, labelY: cy + radius(c.members.length) * scale + 16 });
    let i = 0;
    rings(c.members.length).forEach((count, ring) => {
      const r = (22 + ring * GAP) * scale;
      for (let j = 0; j < count; j += 1, i += 1) {
        const t = (j / count) * Math.PI * 2 - Math.PI / 2;
        Object.assign(nodes[c.members[i]!]!, { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
      }
    });
  });
}

export function GraphView(p: ViewProps) {
  const links = p.allFields.filter((f) => f.kind === "relation" && !isParentRelation(p.table, f));
  const field = links.find((f) => f.name === p.view.relationBy) ?? links[0];
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const graph = useMemo(() => {
    const nodes: Node[] = [];
    const edges: [number, number][] = [];
    const at = new Map<string, number>();
    const add = (node: Omit<Node, "x" | "y">) => {
      if (!at.has(node.key)) {
        at.set(node.key, nodes.length);
        nodes.push({ ...node, x: 0, y: 0 });
      }
      return at.get(node.key)!;
    };
    for (const row of p.rows.slice(0, MAX_NODES)) {
      const self = add({ key: `row:${row.id}`, label: titleOf(row, p.titleField), own: true, rowId: row.id });
      const value = field ? row[field.name] : null;
      if (!field || value === null || value === undefined || value === "") continue;
      const link = p.relations.resolve(field, value);
      const target = link
        ? add({ key: `${link.kind}:${link.id}`, label: link.label, own: link.table === p.table.name, link, rowId: link.table === p.table.name ? link.id : undefined })
        : add({ key: `text:${String(value)}`, label: String(value), own: false });
      edges.push([self, target]);
    }
    layout(nodes, edges);
    return { nodes, edges };
  }, [p.rows, p.titleField, field, p.relations, p.table.name]);
  if (!field) return <p className="dv-empty">This table has no links to draw</p>;
  const view = `${W / 2 - W / 2 / zoom - pan.x} ${H / 2 - H / 2 / zoom - pan.y} ${W / zoom} ${H / zoom}`;
  const open = (n: Node) => (n.rowId && n.own ? p.onOpen(n.rowId) : n.link ? p.onOpenLink(n.link) : undefined);
  return (
    <div className="dv-graph">
      <div className="dv-viewbar">
        <span className="dv-faint">
          {graph.nodes.length.toLocaleString()} things · {graph.edges.length.toLocaleString()} links
        </span>
        <span className="dv-spacer" />
        {links.length > 1 ? (
          <label className="dv-inline">
            <span className="dv-faint">Link</span>
            <select className="dv-select" value={field.name} onChange={(e) => p.onViewChange({ ...p.view, relationBy: e.target.value } as ViewConfig)}>
              {links.map((f) => (
                <option key={f.name} value={f.name}>
                  {fieldLabel(f)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <IconButton size="sm" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>
          <Minus size={14} />
        </IconButton>
        <IconButton size="sm" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z * 1.25))}>
          <Plus size={14} />
        </IconButton>
        <IconButton
          size="sm"
          aria-label="Reset the view"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <RotateCcw size={14} />
        </IconButton>
      </div>
      <svg
        className="dv-graph__svg"
        viewBox={view}
        role="img"
        aria-label={`Links by ${fieldLabel(field)}`}
        onPointerDown={(e: ReactPointerEvent) => setDrag({ x: e.clientX, y: e.clientY })}
        onPointerMove={(e: ReactPointerEvent) => {
          if (!drag) return;
          const scale = W / zoom / (e.currentTarget as SVGSVGElement).getBoundingClientRect().width;
          setPan((pp) => ({ x: pp.x + (e.clientX - drag.x) * scale, y: pp.y + (e.clientY - drag.y) * scale }));
          setDrag({ x: e.clientX, y: e.clientY });
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {graph.edges.map(([a, b], i) => (
          <line key={i} x1={graph.nodes[a]!.x} y1={graph.nodes[a]!.y} x2={graph.nodes[b]!.x} y2={graph.nodes[b]!.y} className="dv-graph__edge" />
        ))}
        {graph.nodes.map((n) => (
          <g key={n.key} className={`dv-graph__node${n.own ? "" : " dv-graph__node--other"}`} role="button" tabIndex={0} onClick={() => open(n)} onKeyDown={(e) => e.key === "Enter" && open(n)}>
            <circle cx={n.x} cy={n.y} r={n.own ? 5 : 9} />
            {n.labelY !== undefined ? (
              <text x={n.x} y={n.labelY} textAnchor="middle">
                {n.label.slice(0, 28)}
              </text>
            ) : zoom >= 1.5 || graph.nodes.length <= 60 ? (
              <text x={n.x + 9} y={n.y + 4}>
                {n.label.slice(0, 28)}
              </text>
            ) : null}
            <title>{n.label}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function TreeView(p: ViewProps) {
  const parents = p.allFields.filter((f) => isParentRelation(p.table, f));
  const field = parents.find((f) => f.name === p.view.parentBy) ?? parents[0];
  const [shut, setShut] = useState<Set<string>>(new Set());
  const extras = p.fields.filter((f) => f.name !== p.titleField && f.name !== field?.name && f.kind !== "long_text").slice(0, 2);
  const items = useMemo(() => {
    if (!field) return [];
    const ids = new Set(p.rows.map((r) => r.id));
    const parentOf = (row: DataRow): string | null => {
      const v = row[field.name];
      if (v === null || v === undefined || v === "") return null;
      const link = p.relations.resolve(field, v);
      const id = link?.id ?? String(v);
      return ids.has(id) && id !== row.id ? id : null;
    };
    const children = new Map<string | null, DataRow[]>();
    for (const row of p.rows) {
      const parent = parentOf(row);
      children.set(parent, [...(children.get(parent) ?? []), row]);
    }
    const out: { row: DataRow; level: number; kids: number }[] = [];
    const seen = new Set<string>();
    const walk = (parent: string | null, level: number) => {
      for (const row of children.get(parent) ?? []) {
        if (seen.has(row.id)) continue; // a loop of parents is shown once, not forever
        seen.add(row.id);
        const kids = children.get(row.id)?.length ?? 0;
        out.push({ row, level, kids });
        if (!shut.has(row.id)) walk(row.id, level + 1);
      }
    };
    walk(null, 0);
    for (const row of p.rows) if (!seen.has(row.id)) out.push({ row, level: 0, kids: 0 });
    return out;
  }, [p.rows, field, p.relations, shut]);
  if (!field) return <p className="dv-empty">This table has no parent link</p>;
  return (
    <div className="dv-tree" role="tree">
      {items.map(({ row, level, kids }) => (
        <div key={row.id} className="dv-tree__row" role="treeitem" aria-expanded={kids ? !shut.has(row.id) : undefined} style={{ paddingLeft: 8 + level * 22 }}>
          {kids ? (
            <IconButton size="sm" aria-label={shut.has(row.id) ? "Expand" : "Collapse"} onClick={() => setShut((s) => (s.has(row.id) ? new Set([...s].filter((x) => x !== row.id)) : new Set([...s, row.id])))}>
              {shut.has(row.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </IconButton>
          ) : (
            <span className="dv-tree__leaf" />
          )}
          <button type="button" className="dv-linkrow dv-ellipsis" onClick={() => p.onOpen(row.id)}>
            {titleOf(row, p.titleField)}
          </button>
          {kids ? <span className="dv-faint dv-num">{kids}</span> : null}
          <span className="dv-spacer" />
          {extras.map((f) => (
            <span key={f.name} className="dv-prop">
              <CellValue field={f} value={row[f.name]} row={p.record(row.id)} relations={p.relations} onOpenLink={p.onOpenLink} />
            </span>
          ))}
        </div>
      ))}
      {p.empty ? <p className="dv-empty">{p.empty}</p> : null}
    </div>
  );
}
