/**
 * Second brain: an egg-shaped force-directed graph of what Alpha holds — the person, what it
 * knows about them, their projects, and the people and companies it has met — with the real
 * links between them (a fact is about someone). Ported from Alpha's Intelligence page
 * (shell/intelligence/SecondBrain.tsx, itself adapted from the CV Naturals project); the layout
 * is `./forceLayout.ts`. Real data or nothing: nothing is invented to make the picture busier.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { Client, Entity, Fact, ModuleCard, ProjectLink } from "../core/client";
import { humanize } from "../modules/format";
import { eggHalfWidth, eggRadii, seedPositions, settle, type SimEdge, type SimNode } from "./forceLayout";

type Kind = "you" | "module" | "fact" | "entity";
interface GraphNode {
  key: string;
  label: string;
  kind: Kind;
  open?: () => void;
}

const COLORS: Record<Kind, string> = { you: "var(--navy)", module: "var(--primary)", fact: "var(--bridge-sage)", entity: "var(--bridge-amber)" };
const KIND_LABEL: Record<Exclude<Kind, "you">, string> = { module: "Projects", fact: "Facts", entity: "People & companies" };
const VIEW_W = 640;
const VIEW_H = 640 * 1.32;
const TAP_SLOP = 6; // screen pixels a press may move and still be a click

export function SecondBrain({ client, modules, facts, onOpenModule, onOpenKnowledge }: { client: Client; modules: ModuleCard[]; facts: Fact[]; onOpenModule: (id: string) => void; onOpenKnowledge: () => void }) {
  const [people, setPeople] = useState<Entity[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    client
      .people()
      .then((all) => !cancelled && setPeople(all))
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, [client]);
  // Real project-to-project links only: the same switchable ones Connections shows.
  const [links, setLinks] = useState<ProjectLink[]>([]);
  useEffect(() => {
    client
      .projectLinks()
      .then(setLinks)
      .catch(() => setLinks([]));
  }, [client, modules]);
  const pending = facts.filter((f) => f.state === "suggested").length;

  const nodes = useMemo<GraphNode[]>(() => {
    if (people === null) return [];
    const known = facts.filter((f) => f.state !== "rejected");
    const list: GraphNode[] = [];
    if (known.length) list.push({ key: "you", label: "You", kind: "you", open: onOpenKnowledge });
    list.push(...modules.map((m) => ({ key: `module:${m.id}`, label: m.name, kind: "module" as const, open: () => onOpenModule(m.id) })));
    list.push(...known.map((f) => ({ key: `fact:${f.id}`, label: `${humanize(f.predicate)}: ${f.value}`, kind: "fact" as const, open: onOpenKnowledge })));
    list.push(...people.map((p) => ({ key: `entity:${p.id}`, label: p.name, kind: "entity" as const })));
    return list;
  }, [people, modules, facts, onOpenModule, onOpenKnowledge]);

  const edges = useMemo<SimEdge[]>(() => {
    const present = new Set(nodes.map((n) => n.key));
    const list: SimEdge[] = [
      ...links.map((l) => ({ from: `module:${l.module}`, to: `module:${l.reads}` })),
      ...facts.map((f) => ({ from: `fact:${f.id}`, to: f.subject === "person" ? "you" : `entity:${f.subject}` })),
      // A fact that arrived from a project is a real, recorded link to it.
      ...facts.filter((f) => f.source.startsWith("module:")).map((f) => ({ from: `fact:${f.id}`, to: f.source })),
    ];
    return list.filter((e) => present.has(e.from) && present.has(e.to));
  }, [nodes, facts, links]);

  const [positions, setPositions] = useState<SimNode[]>([]);
  useEffect(() => {
    const seeded = seedPositions(nodes.map((n) => n.key), 0, 0);
    settle(seeded, edges);
    setPositions(seeded);
  }, [nodes, edges]);
  const posOf = (key: string) => positions.find((n) => n.key === key);

  const eggPath = useMemo(() => {
    const { semiWidth, semiHeight } = eggRadii(nodes.length);
    const right: string[] = [];
    const left: string[] = [];
    for (let i = 0; i <= 80; i++) {
      const ny = -1 + (2 * i) / 80;
      const half = eggHalfWidth(ny, semiWidth);
      right.push(`${half.toFixed(1)},${(ny * semiHeight).toFixed(1)}`);
      left.push(`${(-half).toFixed(1)},${(ny * semiHeight).toFixed(1)}`);
    }
    return `M ${right.join(" L ")} L ${left.reverse().join(" L ")} Z`;
  }, [nodes.length]);

  const degree = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of edges) {
      counts.set(e.from, (counts.get(e.from) ?? 0) + 1);
      counts.set(e.to, (counts.get(e.to) ?? 0) + 1);
    }
    return counts;
  }, [edges]);

  const [selected, setSelected] = useState<Kind | null>(null);
  const focus = useMemo(() => (selected ? new Set(nodes.filter((n) => n.kind === selected).map((n) => n.key)) : null), [selected, nodes]);

  const [view, setView] = useState({ x: -VIEW_W / 2, y: -VIEW_H / 2, w: VIEW_W, h: VIEW_H });
  const fit = () => {
    const { semiWidth, semiHeight } = eggRadii(nodes.length);
    const w = semiWidth * 2 + 80;
    const h = semiHeight * 2 + 80;
    setView({ x: -w / 2, y: -h / 2, w, h });
  };
  useEffect(() => {
    if (nodes.length) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length]);
  const zoomTo = (width: number) =>
    setView((v) => {
      const w = Math.max(160, Math.min(VIEW_W * 3, width));
      return { ...v, w, h: v.h * (w / v.w) };
    });

  const svg = useRef<SVGSVGElement>(null);
  const panFrom = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(0);
  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    panFrom.current = { x: e.clientX, y: e.clientY };
    moved.current = 0;
  };
  const onPointerMove = (e: PointerEvent) => {
    const from = panFrom.current;
    if (!from) return;
    const px = view.w / (svg.current?.clientWidth || VIEW_W);
    moved.current += Math.hypot(e.clientX - from.x, e.clientY - from.y);
    panFrom.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, x: v.x - (e.clientX - from.x) * px, y: v.y - (e.clientY - from.y) * px }));
  };
  const onPointerUp = () => {
    panFrom.current = null;
  };

  const manage = (
    <div className="row" style={{ justifyContent: "flex-end" }}>
      <button type="button" className="btn btn--sm" onClick={onOpenKnowledge}>
        {pending ? `Manage (${pending} waiting for you)` : "Manage what Alpha knows"}
      </button>
    </div>
  );
  if (people === null) return <p className="empty">Loading…</p>;
  if (!nodes.length)
    return (
      <div className="stack">
        {manage}
        <p className="empty">Nothing yet.</p>
      </div>
    );
  return (
    <div className="stack">
    {manage}
    <div className="card intel-graph-card">
      <div className="intel-controls">
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((kind) => (
          <button key={kind} type="button" className={`intel-legend${selected === kind ? " active" : ""}`} aria-pressed={selected === kind} onClick={() => setSelected((k) => (k === kind ? null : kind))}>
            <span className="intel-swatch" style={{ background: COLORS[kind] }} />
            {KIND_LABEL[kind]}
          </button>
        ))}
        <span className="rail__spacer" />
        <button type="button" className="btn btn--sm" onClick={() => zoomTo(view.w / 1.3)} aria-label="Zoom in" title="Zoom in">
          +
        </button>
        <button type="button" className="btn btn--sm" onClick={() => zoomTo(view.w * 1.3)} aria-label="Zoom out" title="Zoom out">
          −
        </button>
        <button type="button" className="btn btn--sm" onClick={fit} title="Back to the whole picture">
          Reset
        </button>
      </div>
      <svg
        ref={svg}
        className="intel-graph"
        data-overflow-ok
        role="img"
        aria-label="Second brain graph"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => zoomTo(view.w * (e.deltaY > 0 ? 1.1 : 1 / 1.1))}
      >
        <path d={eggPath} fill="none" stroke="var(--border)" strokeWidth={1.2} opacity={0.6} pointerEvents="none" />
        {edges.map((e, i) => {
          const a = posOf(e.from);
          const b = posOf(e.to);
          if (!a || !b) return null;
          const lit = !focus || focus.has(e.from) || focus.has(e.to);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border)" strokeWidth={1} opacity={lit ? 1 : 0.15} />;
        })}
        {nodes.map((n) => {
          const p = posOf(n.key);
          if (!p) return null;
          const r = n.kind === "you" ? 10 : 6 + Math.min(8, (degree.get(n.key) ?? 0) * 1.4);
          return (
            <g key={n.key} transform={`translate(${p.x},${p.y})`} className={n.open ? "intel-node intel-node--open" : "intel-node"} opacity={!focus || focus.has(n.key) ? 1 : 0.2} onPointerUp={() => moved.current < TAP_SLOP && n.open?.()}>
              <title>{n.label}</title>
              <circle r={r} fill={COLORS[n.kind]} stroke="var(--surface)" strokeWidth={1.5} />
              <text y={r + 12} textAnchor="middle" fill="var(--text)">
                {n.label.length > 32 ? `${n.label.slice(0, 31)}…` : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
    </div>
  );
}
