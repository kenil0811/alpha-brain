/**
 * The map of Alpha's own work (Intelligence › Map): modules as hubs, the tables in them, the
 * skills that read into them, the automations that run the skills, the sources each module
 * reads from and the sign-ins and folders that reach them. Every node opens its page; every
 * edge says what it means and where the world says so. The layout settles in a worker, so the
 * page never stalls; a node can be dragged and the rest make room; Shake gives it a nudge.
 * (The design's option C, `docs/design/knowledge-graph-proposal.md`, chosen by Kenil 3 Oct.)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client, GraphEdge, GraphNode, WorkGraph } from "../../core/client";
import type { Surface } from "../Rail";
import { Button } from "../../ui";
import { ActivityIcon, Eye, FolderOpen, Globe, IntelligenceIcon, Layers, Link2, Play, Table2, Zap } from "../../ui/icons";
import { makeSimulation, positionsOf, settle, toMapEdges, toMapNodes, type Positions } from "./layout";
import type { FromWorker, ToWorker } from "./layout.worker";

type Kind = GraphNode["kind"];
const KINDS: { kind: Kind; label: string }[] = [
  { kind: "module", label: "Modules" },
  { kind: "table", label: "Tables" },
  { kind: "skill", label: "Skills" },
  { kind: "automation", label: "Automations" },
  { kind: "source", label: "Sources" },
  { kind: "connection", label: "Connections" },
];

/** The address a node opens: the window's, not the core's. */
export function addressOf(node: GraphNode): Surface | null {
  switch (node.kind) {
    case "module":
      return node.module ? { kind: "module", id: node.module } : null;
    case "table":
    case "source":
      return node.module ? { kind: "module", id: node.module } : { kind: "intelligence", tab: "skills" };
    case "skill":
      return { kind: "skill", name: node.name ?? node.id.slice("skill:".length) };
    case "automation":
      return { kind: "automation", id: node.id.slice("automation:".length) };
    case "connection":
      return { kind: "intelligence", tab: "connections" };
  }
}

/** An edge in words, from the side of `from`. */
export function edgeWords(edge: GraphEdge, other: string): string {
  const count = edge.count ? ` (${edge.count})` : "";
  const order = edge.order ? ` (step ${edge.order})` : "";
  return `${edge.kind} ${other}${order}${count}`;
}

function colourOf(node: GraphNode): string {
  if (node.kind === "skill") return node.role === "read" ? "var(--k-read)" : node.role === "act" ? "var(--k-act)" : "var(--k-run)";
  return `var(--k-${node.kind})`;
}

function Glyph({ node }: { node: GraphNode }) {
  const props = { x: -8, y: -8, width: 16, height: 16, strokeWidth: 2 };
  if (node.kind === "module") return <Layers {...props} x={-10} y={-10} width={20} height={20} />;
  if (node.kind === "table") return <Table2 {...props} />;
  if (node.kind === "automation") return <ActivityIcon {...props} />;
  if (node.kind === "source") return <Globe {...props} x={-6} y={-6} width={12} height={12} />;
  if (node.kind === "connection") return node.subtitle === "files" ? <FolderOpen {...props} /> : <Link2 {...props} />;
  if (node.role === "read") return <Eye {...props} />;
  if (node.role === "act") return <Zap {...props} />;
  if (node.role === "run") return <Play {...props} />;
  return <IntelligenceIcon {...props} />;
}

function stateOf(node: GraphNode): "bad" | "warn" | "off" | null {
  if (node.kind === "skill") return node.state === "broken" ? "bad" : node.state === "untried" ? "warn" : null;
  if (node.kind === "automation") return node.state === "problem" ? "bad" : node.state === "off" ? "off" : null;
  if (node.kind === "source") return node.state === "working" ? null : node.state === "blocked" || node.state === "unavailable" ? "bad" : node.state === "needs_signin" || node.state === "not_built" ? "warn" : "off";
  if (node.kind === "connection") return node.state === "connected" ? null : node.state === "off" ? "off" : "warn";
  return null;
}

function stateWords(node: GraphNode): string | null {
  if (!node.state) return null;
  const plain: Record<string, string> = { ok: "working", broken: "broken", untried: "not yet tried", on: "on", off: "off", problem: "last run failed", working: "working", needs_signin: "needs a sign-in", blocked: "blocked by the site", unavailable: "unavailable", not_built: "not read yet", skipped: "skipped", connected: "connected" };
  return plain[node.state] ?? node.state;
}

export function WorkMap({ client, version, onGo }: { client: Client; version: number; onGo?: (s: Surface) => void }) {
  const [graph, setGraph] = useState<WorkGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Positions>({});
  const [settled, setSettled] = useState(false);
  const [hidden, setHidden] = useState<Set<Kind>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ width: 900, height: 600 });
  const box = useRef<HTMLDivElement | null>(null);
  const worker = useRef<Worker | null>(null);
  const drag = useRef<{ id: string | null; startX: number; startY: number; viewX: number; viewY: number; moved: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .graph()
      .then((g) => !cancelled && (setGraph(g), setError(null)))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [client, version]);

  // The map takes the room it has.
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setSize({ width: Math.max(320, el.clientWidth), height: Math.max(320, el.clientHeight) });
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);

  const shown = useMemo(() => {
    if (!graph) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    const nodes = graph.nodes.filter((n) => !hidden.has(n.kind));
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
  }, [graph, hidden]);

  // The layout: in a worker when the window has them, else at once on this thread.
  useEffect(() => {
    if (!graph) return;
    setSettled(false);
    // Without a worker (a test, or a webview that will not start one), the layout settles at
    // once on this thread: the same picture, without the motion.
    const atOnce = () => {
      const nodes = toMapNodes(shown.nodes);
      settle(makeSimulation(nodes, toMapEdges(shown.edges, nodes), size.width, size.height));
      setPositions(positionsOf(nodes));
      setSettled(true);
    };
    if (typeof Worker === "undefined") {
      atOnce();
      return;
    }
    worker.current?.terminate();
    let w: Worker;
    try {
      w = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
    } catch {
      atOnce();
      return;
    }
    worker.current = w;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      setPositions(e.data.positions);
      if (e.data.type === "end") setSettled(true);
    };
    w.onerror = () => {
      w.terminate();
      if (worker.current === w) worker.current = null;
      atOnce();
    };
    const start: ToWorker = { type: "start", nodes: shown.nodes, edges: shown.edges, width: size.width, height: size.height };
    w.postMessage(start);
    return () => {
      w.terminate();
      if (worker.current === w) worker.current = null;
    };
  }, [graph, shown, size.width, size.height]);

  const byId = useMemo(() => new Map(shown.nodes.map((n) => [n.id, n])), [shown]);
  const neighbours = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const e of shown.edges) {
      (out.get(e.from) ?? out.set(e.from, new Set()).get(e.from)!).add(e.to);
      (out.get(e.to) ?? out.set(e.to, new Set()).get(e.to)!).add(e.from);
    }
    return out;
  }, [shown]);
  const focus = hovered ?? selected;
  const lit = focus ? new Set([focus, ...(neighbours.get(focus) ?? [])]) : null;
  // The hubs keep their names; skills and sources show theirs when the map is close enough,
  // or when they light up around what is hovered or chosen.
  const labelled = (n: GraphNode) => n.kind === "module" || n.kind === "table" || n.kind === "automation" || n.kind === "connection" || view.k >= 1.5 || (lit?.has(n.id) ?? false);
  const touched = useRef(false);

  const toGraph = useCallback((clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    return { x: (clientX - rect.left - view.x) / view.k, y: (clientY - rect.top - view.y) / view.k };
  }, [view]);

  const onPointerDown = (e: React.PointerEvent, id: string | null) => {
    if (e.button !== 0) return;
    drag.current = { id, startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.id) {
      const p = toGraph(e.clientX, e.clientY);
      if (worker.current) worker.current.postMessage({ type: "drag", id: d.id, x: p.x, y: p.y } satisfies ToWorker);
      else setPositions((all) => ({ ...all, [d.id!]: p }));
    } else {
      touched.current = true;
      setView((v) => ({ ...v, x: d.viewX + (e.clientX - d.startX), y: d.viewY + (e.clientY - d.startY) }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.id && d.moved) worker.current?.postMessage({ type: "release", id: d.id } satisfies ToWorker);
    if (!d.moved) setSelected(d.id);
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };
  const onWheel = (e: React.WheelEvent) => {
    touched.current = true;
    const rect = box.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    setView((v) => {
      const k = Math.min(3, Math.max(0.3, v.k * (e.deltaY < 0 ? 1.12 : 0.89)));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  };
  const fit = useCallback((from: Positions = positions) => {
    const pts = shown.nodes.map((n) => from[n.id]).filter(Boolean);
    if (!pts.length) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs) - 70, Math.max(...xs) + 70, Math.min(...ys) - 70, Math.max(...ys) + 70];
    const k = Math.min(3, Math.max(0.3, Math.min(size.width / (maxX - minX), size.height / (maxY - minY))));
    setView({ k, x: (size.width - (minX + maxX) * k) / 2, y: (size.height - (minY + maxY) * k) / 2 });
  }, [positions, shown.nodes, size.width, size.height]);
  // Once settled, the whole map comes into view, unless the person has already moved it.
  useEffect(() => {
    if (settled && !touched.current) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);
  const shake = () => {
    if (worker.current) worker.current.postMessage({ type: "shake" } satisfies ToWorker);
  };
  const toggleKind = (kind: Kind) => setHidden((s) => { const next = new Set(s); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; });

  if (error) return <p className="notice" role="alert">{error}</p>;
  if (!graph) return <p className="muted">Drawing the map…</p>;
  if (!graph.nodes.length) return <p className="empty">Nothing to map yet. A module, a table or a skill is the first dot.</p>;

  // Labels keep a readable size whatever the zoom: they shrink less than the map does.
  const labelScale = Math.min(1.6, Math.max(0.9, 1 / Math.sqrt(view.k)));
  const selectedNode = selected ? byId.get(selected) ?? null : null;
  const selectedEdges = selectedNode ? shown.edges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id) : [];

  return (
    <div className="map" ref={box} aria-label="The map of Alpha's work">
      <svg className={`map__svg${settled ? "" : " map__svg--settling"}`} width={size.width} height={size.height} role="img" aria-label={`${shown.nodes.length} things and ${shown.edges.length} links`} onPointerDown={(e) => onPointerDown(e, null)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}>
        <defs>
          <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-3)" />
          </marker>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g className="map__edges">
            {shown.edges.map((e, i) => {
              const a = positions[e.from];
              const b = positions[e.to];
              if (!a || !b) return null;
              const dim = lit ? !(lit.has(e.from) && lit.has(e.to)) : false;
              const from = byId.get(e.from);
              const to = byId.get(e.to);
              return (
                <line key={i} className={`map__edge map__edge--${e.kind.replace(/ /g, "-")}${dim ? " map__edge--dim" : ""}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd={e.kind === "in" ? undefined : "url(#map-arrow)"}>
                  <title>{`${from?.title ?? e.from} ${edgeWords(e, to?.title ?? e.to)}${e.source ? ` — ${e.source}` : ""}`}</title>
                </line>
              );
            })}
          </g>
          <g className="map__nodes">
            {shown.nodes.map((n) => {
              const p = positions[n.id];
              if (!p) return null;
              const r = toMapNodes([n])[0].r;
              const state = stateOf(n);
              const dim = lit ? !lit.has(n.id) : false;
              return (
                <g
                  key={n.id}
                  className={`map__node map__node--${n.kind}${state ? ` map__node--${state}` : ""}${dim ? " map__node--dim" : ""}${selected === n.id ? " map__node--selected" : ""}`}
                  transform={`translate(${p.x} ${p.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.title}, ${n.kind}${n.subtitle ? `, ${n.subtitle}` : ""}`}
                  onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, n.id); }}
                  onPointerMove={onPointerMove}
                  onPointerUp={(e) => { e.stopPropagation(); onPointerUp(e); }}
                  onPointerEnter={() => setHovered(n.id)}
                  onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                  onDoubleClick={() => { const s = addressOf(n); if (s && onGo) onGo(s); }}
                  onKeyDown={(e) => { if (e.key === "Enter") setSelected(n.id); }}
                >
                  <circle r={r} fill={colourOf(n)} />
                  <g className="map__glyph"><Glyph node={n} /></g>
                  {labelled(n) ? (
                    <g transform={`translate(0 ${r + 4}) scale(${labelScale})`}>
                      <text y={12} textAnchor="middle" className="map__label">{n.title.length > 26 ? `${n.title.slice(0, 25)}…` : n.title}</text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <div className="map__tools">
        <Button size="sm" onClick={() => fit()}>Fit</Button>
        <Button size="sm" onClick={shake} disabled={!worker.current}>Shake</Button>
      </div>
      <div className="map__legend" role="group" aria-label="Show">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" className={`map__chip${hidden.has(k.kind) ? " map__chip--off" : ""}`} aria-pressed={!hidden.has(k.kind)} onClick={() => toggleKind(k.kind)}>
            <i style={{ background: `var(--k-${k.kind})` }} aria-hidden="true" />
            {k.label}
          </button>
        ))}
      </div>
      {selectedNode ? (
        <aside className="map__card" aria-label={selectedNode.title}>
          <div className="map__card-head">
            <span className="map__dot" style={{ background: colourOf(selectedNode) }} aria-hidden="true" />
            <b>{selectedNode.title}</b>
            <span className="faint">{selectedNode.kind === "skill" ? `${selectedNode.role} skill` : selectedNode.kind}</span>
          </div>
          {selectedNode.subtitle ? <p className="muted">{selectedNode.subtitle}</p> : null}
          {selectedNode.description ? <p className="map__desc">{selectedNode.description}</p> : null}
          {stateWords(selectedNode) ? <p className={stateOf(selectedNode) === "bad" ? "notice" : "muted"}>{stateWords(selectedNode)}{selectedNode.detail ? `: ${selectedNode.detail}` : ""}</p> : null}
          {selectedNode.kind === "skill" && selectedNode.runs !== undefined ? <p className="muted">{selectedNode.runs} run{selectedNode.runs === 1 ? "" : "s"} in 30 days{selectedNode.failed ? `, ${selectedNode.failed} failed` : ""}</p> : null}
          {selectedEdges.length ? (
            <ul className="map__links">
              {selectedEdges.map((e, i) => {
                const other = e.from === selectedNode.id ? byId.get(e.to) : byId.get(e.from);
                const words = e.from === selectedNode.id ? edgeWords(e, other?.title ?? "") : `${other?.title ?? ""} ${e.kind} this`;
                return (
                  <li key={i}>
                    <button type="button" className="linkbtn" onClick={() => setSelected(other?.id ?? null)}>{words}</button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="row" style={{ marginTop: 8 }}>
            {addressOf(selectedNode) && onGo ? (
              <Button size="sm" variant="primary" onClick={() => onGo(addressOf(selectedNode)!)}>Open</Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
