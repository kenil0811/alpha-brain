/**
 * Second brain: an egg-shaped force-directed graph of what Alpha holds — the person, what it
 * knows about them, their projects, and the people and companies it has met — with the real
 * links between them (a fact is about someone). Ported from Alpha's Intelligence page
 * (shell/intelligence/SecondBrain.tsx, itself adapted from the CV Naturals project); the layout
 * is `./forceLayout.ts`. Real data or nothing: nothing is invented to make the picture busier.
 *
 * The graph is the place to work, not a menu: clicking (or Enter on) a node selects it and a card
 * beside the graph shows what it is, what it links to and the same edits as its own page; its
 * neighbours light up on hover or focus, and Esc lets go.
 */
import { Button } from "../ui/Button";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { X } from "lucide-react";
import type { Entity } from "../core/client";
import { humanize, when } from "../modules/format";
import { IconButton } from "../ui";
import { eggHalfWidth, eggRadii, seedPositions, settle, type SimEdge, type SimNode } from "./forceLayout";
import { EditField, EntityDetailView, FactDetail, type ItemContext } from "./IntelItem";
import type { Surface } from "./Rail";

type Kind = "you" | "module" | "fact" | "entity";
interface GraphNode {
  key: string;
  label: string;
  kind: Kind;
  /** The node's own page ("Open page" in its card). */
  page: Surface;
}

const COLORS: Record<Kind, string> = { you: "var(--navy)", module: "var(--primary)", fact: "var(--bridge-sage)", entity: "var(--bridge-amber)" };
const KIND_LABEL: Record<Exclude<Kind, "you">, string> = { module: "Projects", fact: "Facts", entity: "People & companies" };
const ONE_KIND: Record<Kind, string> = { you: "You", module: "Project", fact: "Fact", entity: "Person or company" };
const VIEW_W = 640;
const VIEW_H = 640 * 1.32;
const TAP_SLOP = 6; // screen pixels a press may move and still be a click

export function SecondBrain({ ctx, onOpenKnowledge }: { ctx: ItemContext; onOpenKnowledge: () => void }) {
  const { client, modules } = ctx;
  const facts = ctx.data.knowledge.facts;
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
  const pending = facts.filter((f) => f.state === "suggested").length;

  const nodes = useMemo<GraphNode[]>(() => {
    if (people === null) return [];
    const known = facts.filter((f) => f.state !== "rejected");
    const list: GraphNode[] = [];
    if (known.length) list.push({ key: "you", label: "You", kind: "you", page: { kind: "intelligence", tab: "knowledge" } });
    list.push(...modules.map((m) => ({ key: `module:${m.id}`, label: m.name, kind: "module" as const, page: { kind: "module" as const, id: m.id } })));
    list.push(...known.map((f) => ({ key: `fact:${f.id}`, label: `${humanize(f.predicate)}: ${f.value}`, kind: "fact" as const, page: { kind: "intelligence" as const, tab: "knowledge", item: f.id } })));
    list.push(...people.map((p) => ({ key: `entity:${p.id}`, label: p.name, kind: "entity" as const, page: { kind: "intelligence" as const, tab: "brain", item: p.id } })));
    return list;
  }, [people, modules, facts]);

  const edges = useMemo<SimEdge[]>(() => {
    const present = new Set(nodes.map((n) => n.key));
    const list: SimEdge[] = [
      ...facts.map((f) => ({ from: `fact:${f.id}`, to: f.subject === "person" ? "you" : `entity:${f.subject}` })),
      // A fact that arrived from a project is a real, recorded link to it.
      ...facts.filter((f) => f.source.startsWith("module:")).map((f) => ({ from: `fact:${f.id}`, to: f.source })),
    ];
    return list.filter((e) => present.has(e.from) && present.has(e.to));
  }, [nodes, facts]);

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

  const neighbours = useMemo(() => {
    const out = new Map<string, Set<string>>();
    const add = (a: string, b: string) => out.set(a, (out.get(a) ?? new Set()).add(b));
    for (const e of edges) {
      add(e.from, e.to);
      add(e.to, e.from);
    }
    return out;
  }, [edges]);

  // The legend shows one kind; a hovered (or focused, else the picked) node lights its neighbours.
  const [selected, setSelected] = useState<Kind | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const near = hover ?? picked;
  const focus = useMemo(() => {
    if (near) return new Set([near, ...(neighbours.get(near) ?? [])]);
    return selected ? new Set(nodes.filter((n) => n.kind === selected).map((n) => n.key)) : null;
  }, [near, neighbours, selected, nodes]);
  const pickedNode = nodes.find((n) => n.key === picked) ?? null;
  // Esc lets go of the picked node (an open field takes its own Esc first).
  useEffect(() => {
    if (!picked) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) setPicked(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [picked]);

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
  // The node a press started on (null on the background), read before the svg captures the pointer.
  const pressed = useRef<string | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    pressed.current = (e.target as Element).closest?.("[data-key]")?.getAttribute("data-key") ?? null;
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
    // A press that didn't pan is a click: on a node it picks it, on the background it lets go.
    if (panFrom.current && moved.current < TAP_SLOP) setPicked(pressed.current);
    panFrom.current = null;
  };

  const manage = (
    <div className="row" style={{ justifyContent: "flex-end" }}>
      <Button variant="outline" size="sm" onClick={onOpenKnowledge}>
        {pending ? `Manage (${pending} waiting for you)` : "Manage what Alpha knows"}
      </Button>
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
    <div className="brain">
    <div className="card intel-graph-card">
      <div className="intel-controls">
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((kind) => (
          <button key={kind} type="button" className={`intel-legend${selected === kind ? " active" : ""}`} aria-pressed={selected === kind} onClick={() => setSelected((k) => (k === kind ? null : kind))}>
            <span className="intel-swatch" style={{ background: COLORS[kind] }} />
            {KIND_LABEL[kind]}
          </button>
        ))}
        <span className="rail__spacer" />
        <Button variant="outline" size="sm" onClick={() => zoomTo(view.w / 1.3)} aria-label="Zoom in" title="Zoom in">
          +
        </Button>
        <Button variant="outline" size="sm" onClick={() => zoomTo(view.w * 1.3)} aria-label="Zoom out" title="Zoom out">
          −
        </Button>
        <Button variant="outline" size="sm" onClick={fit} title="Back to the whole picture">
          Reset
        </Button>
      </div>
      <svg
        ref={svg}
        className="intel-graph"
        data-overflow-ok
        role="group"
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
          const lit = !focus || (near ? e.from === near || e.to === near : focus.has(e.from) || focus.has(e.to));
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--border)" strokeWidth={1} opacity={lit ? 1 : 0.15} />;
        })}
        {nodes.map((n) => {
          const p = posOf(n.key);
          if (!p) return null;
          const r = n.kind === "you" ? 10 : 6 + Math.min(8, (degree.get(n.key) ?? 0) * 1.4);
          return (
            <g
              key={n.key}
              data-key={n.key}
              transform={`translate(${p.x},${p.y})`}
              className={`intel-node${picked === n.key ? " intel-node--picked" : ""}`}
              opacity={!focus || focus.has(n.key) ? 1 : 0.2}
              tabIndex={0}
              role="button"
              aria-label={`${ONE_KIND[n.kind]}: ${n.label}`}
              aria-pressed={picked === n.key}
              onPointerEnter={() => setHover(n.key)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(n.key)}
              onBlur={() => setHover(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPicked(n.key);
                }
              }}
            >
              <title>{n.label}</title>
              <circle r={r} fill={COLORS[n.kind]} stroke={picked === n.key ? "var(--text)" : "var(--surface)"} strokeWidth={picked === n.key ? 3 : 1.5} />
              <text y={r + 12} textAnchor="middle" fill="var(--text)">
                {n.label.length > 32 ? `${n.label.slice(0, 31)}…` : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
    {pickedNode ? <NodeCard node={pickedNode} links={[...(neighbours.get(pickedNode.key) ?? [])].map((k) => nodes.find((n) => n.key === k)).filter((n): n is GraphNode => !!n)} ctx={ctx} onPick={setPicked} /> : null}
    </div>
    </div>
  );
}

/** The picked node, in place beside the graph: what it is, what it links to, its edits. */
function NodeCard({ node, links, ctx, onPick }: { node: GraphNode; links: GraphNode[]; ctx: ItemContext; onPick: (key: string | null) => void }) {
  const [kind, id] = [node.kind, node.key.slice(node.key.indexOf(":") + 1)];
  const fact = kind === "fact" ? ctx.data.knowledge.facts.find((f) => f.id === id) : undefined;
  const module = kind === "module" ? ctx.modules.find((m) => m.id === id) : undefined;
  // In a narrow window the card wraps below the graph: bring it into view.
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    card.current?.scrollIntoView?.({ block: "nearest" });
  }, [node.key]);
  return (
    <aside ref={card} className="card card--pad brain__card stack" aria-label={`${ONE_KIND[kind]}: ${node.label}`}>
      <div className="intel__head">
        <span className="ifield__label">{ONE_KIND[kind]}</span>
        <IconButton size="sm" className="brain__close" aria-label="Close" title="Close (Esc)" onClick={() => onPick(null)}>
          <X size={14} />
        </IconButton>
      </div>
      {fact ? (
        <FactDetail fact={fact} ctx={ctx} />
      ) : kind === "entity" ? (
        <EntityDetailView key={id} id={id} ctx={ctx} />
      ) : module ? (
        <>
          <EditField label="Name" value={module.name} zazoo onSave={(next) => ctx.onAsk(`Rename the project “${module.name}” to “${next}”.`)} />
          <EditField label="Goal" value={module.goal ?? ""} zazoo onSave={(next) => ctx.onAsk(`Change the goal of the project “${module.name}” to “${next}”.`)} />
          <p className="item__sub">
            {module.records} rows in {module.tables.length} {module.tables.length === 1 ? "table" : "tables"}
            {module.last_at ? ` · last ${when(module.last_at)}` : ""}
          </p>
        </>
      ) : (
        <h3>You</h3>
      )}
      {links.length ? (
        <div className="stack brain__links">
          <span className="ifield__label">Links</span>
          {links.map((n) => (
            <button key={n.key} type="button" className="linklike brain__link" onClick={() => onPick(n.key)}>
              <span className="intel-swatch" style={{ background: COLORS[n.kind] }} aria-hidden="true" />
              {n.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="row">
        <Button variant="outline" size="sm" onClick={() => ctx.onGo(node.page)}>
          Open page
        </Button>
      </div>
    </aside>
  );
}
