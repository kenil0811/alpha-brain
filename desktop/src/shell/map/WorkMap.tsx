/**
 * The map of Alpha's own work (Intelligence › Map): each module a cluster of its tables, the
 * skills that read into them, the automations that run the skills, the sources nothing reads
 * yet, and at the centre the sign-ins, folders and skills that serve every module. Every node
 * opens its page; every edge says what it means and where the world says so. The layout
 * settles in a worker, so the page never stalls; a dragged node stays where it is put (Shake
 * lets everything go); the map refreshes when the app changes and every half minute while it
 * is in view, keeping every node's place. (The design's option C,
 * `docs/design/knowledge-graph-proposal.md`, chosen by Kenil 3 Oct.)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client, GraphEdge, GraphNode, WorkGraph } from "../../core/client";
import type { Surface } from "../Rail";
import { Button, IconButton } from "../../ui";
import { ActivityIcon, Eye, FolderOpen, Globe, IntelligenceIcon, Layers, Link2, Play, Table2, X, Zap } from "../../ui/icons";
import { anchorsFor, makeSimulation, positionsOf, settle, toMapEdges, toMapNodes, type Anchors, type Positions } from "./layout";
import type { FromWorker, ToWorker } from "./layout.worker";
import { shape, signature, type ShapedNode } from "./shape";

type Kind = GraphNode["kind"];
const KINDS: { kind: Kind; label: string }[] = [
  { kind: "module", label: "Modules" },
  { kind: "table", label: "Tables" },
  { kind: "skill", label: "Skills" },
  { kind: "automation", label: "Automations" },
  { kind: "source", label: "Sources" },
  { kind: "connection", label: "Connections" },
];
const REFRESH_MS = 30_000;
const PLACES_KEY = "alpha.map.places";

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
  const props = { x: -9, y: -9, width: 18, height: 18, strokeWidth: 2 };
  if (node.kind === "module") return <Layers {...props} x={-12} y={-12} width={24} height={24} />;
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

function stateWords(state: string | undefined): string | null {
  if (!state) return null;
  const plain: Record<string, string> = { ok: "working", broken: "broken", untried: "not yet tried", on: "on", off: "off", problem: "last run failed", working: "working", needs_signin: "needs a sign-in", blocked: "blocked by the site", unavailable: "unavailable", not_built: "not read yet", skipped: "skipped", connected: "connected" };
  return plain[state] ?? state;
}

function remembered(): Positions {
  try {
    return JSON.parse(localStorage.getItem(PLACES_KEY) ?? "{}") as Positions;
  } catch {
    return {};
  }
}
function remember(positions: Positions): void {
  try {
    localStorage.setItem(PLACES_KEY, JSON.stringify(positions));
  } catch {
    /* no storage: the places are not kept */
  }
}

/** A curved line between two points, bowed a little to one side so parallel edges part. */
function curve(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const bend = 0.12;
  return `M ${a.x} ${a.y} Q ${mx - dy * bend} ${my + dx * bend} ${b.x} ${b.y}`;
}

export function WorkMap({ client, version, onGo }: { client: Client; version: number; onGo?: (s: Surface) => void }) {
  const [graph, setGraph] = useState<WorkGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [positions, setPositions] = useState<Positions>({});
  const [settled, setSettled] = useState(false);
  const [hidden, setHidden] = useState<Set<Kind>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focusHome, setFocusHome] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ width: 900, height: 600 });
  const box = useRef<HTMLDivElement | null>(null);
  const worker = useRef<Worker | null>(null);
  const seen = useRef<string | null>(null);
  const started = useRef(false);
  const touched = useRef(false);
  const drag = useRef<{ id: string | null; startX: number; startY: number; viewX: number; viewY: number; moved: boolean } | null>(null);

  // What the core says now; a refresh that changes nothing is dropped, one that does keeps
  // every node's place and settles the difference.
  const fetchGraph = useCallback(() => {
    client
      .graph()
      .then((g) => {
        const sig = signature(g);
        setAsOf(new Date());
        setError(null);
        if (sig === seen.current) return;
        seen.current = sig;
        setGraph(g);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [client]);
  useEffect(() => {
    fetchGraph();
  }, [fetchGraph, version]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchGraph();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchGraph]);

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

  const shaped = useMemo(() => (graph ? shape(graph) : null), [graph]);
  const shown = useMemo(() => {
    if (!shaped) return { nodes: [] as ShapedNode[], edges: [] as GraphEdge[], homes: [] as string[] };
    const nodes = shaped.nodes.filter((n) => !hidden.has(n.kind) && (focusHome === null || n.home === focusHome || n.id === `module:${focusHome}`));
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: shaped.edges.filter((e) => ids.has(e.from) && ids.has(e.to)), homes: shaped.homes };
  }, [shaped, hidden, focusHome]);
  const anchors: Anchors = useMemo(() => anchorsFor(focusHome !== null ? [focusHome] : shown.homes, size.width, size.height), [shown.homes, focusHome, size.width, size.height]);

  // The layout: in a worker when the window has them, else at once on this thread. The first
  // start seeds from where things were last time; a refresh keeps where they are now.
  useEffect(() => {
    if (!shaped) return;
    setSettled(false);
    const atOnce = () => {
      const nodes = toMapNodes(shown.nodes, anchors, started.current ? positions : remembered());
      settle(makeSimulation(nodes, toMapEdges(shown.edges, nodes), anchors));
      setPositions(positionsOf(nodes));
      setSettled(true);
      started.current = true;
    };
    if (typeof Worker === "undefined") {
      atOnce();
      return;
    }
    if (worker.current && started.current) {
      worker.current.postMessage({ type: "update", nodes: shown.nodes, edges: shown.edges, anchors } satisfies ToWorker);
      return;
    }
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
      if (e.data.type === "end") {
        setSettled(true);
        remember(e.data.positions);
      }
    };
    w.onerror = () => {
      w.terminate();
      if (worker.current === w) worker.current = null;
      atOnce();
    };
    w.postMessage({ type: "start", nodes: shown.nodes, edges: shown.edges, anchors, from: remembered() } satisfies ToWorker);
    started.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shaped, shown, anchors]);
  useEffect(() => () => worker.current?.terminate(), []);

  const byId = useMemo(() => new Map(shown.nodes.map((n) => [n.id, n])), [shown]);
  const neighbours = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const e of shown.edges) {
      (out.get(e.from) ?? out.set(e.from, new Set()).get(e.from)!).add(e.to);
      (out.get(e.to) ?? out.set(e.to, new Set()).get(e.to)!).add(e.from);
    }
    return out;
  }, [shown]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(shown.nodes.filter((n) => n.title.toLowerCase().includes(q) || (n.subtitle ?? "").toLowerCase().includes(q) || (n.sources ?? []).some((s) => s.title.toLowerCase().includes(q))).map((n) => n.id));
  }, [query, shown.nodes]);
  const focus = hovered ?? selected;
  const lit = matches ?? (focus ? new Set([focus, ...(neighbours.get(focus) ?? [])]) : null);
  // The hubs keep their names; skills and sources show theirs when the map is close enough,
  // or when they light up around what is hovered, chosen or searched for.
  const labelled = (n: GraphNode) => n.kind === "module" || n.kind === "table" || n.kind === "automation" || n.kind === "connection" || view.k >= 1.4 || focusHome !== null || (lit?.has(n.id) ?? false);
  const labelScale = Math.min(1.6, Math.max(0.9, 1 / Math.sqrt(view.k)));

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
      else setPositions((all) => ({ ...all, [d.id!]: { ...p, pinned: true } }));
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
  const zoomBy = (factor: number, at?: { x: number; y: number }) => {
    const px = at?.x ?? size.width / 2;
    const py = at?.y ?? size.height / 2;
    touched.current = true;
    setView((v) => {
      const k = Math.min(3, Math.max(0.3, v.k * factor));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  };
  const onWheel = (e: React.WheelEvent) => {
    const rect = box.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    zoomBy(e.deltaY < 0 ? 1.12 : 0.89, { x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const fit = useCallback((from: Positions = positions, ids?: Set<string>) => {
    const pts = shown.nodes.filter((n) => !ids || ids.has(n.id)).map((n) => from[n.id]).filter(Boolean);
    if (!pts.length) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = 80;
    const [minX, maxX, minY, maxY] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
    // The legend sits along the bottom and the tools along the top: the map fits between them.
    const room = { width: size.width, height: size.height - 56 };
    const k = Math.min(2.2, Math.max(0.3, Math.min(room.width / (maxX - minX), room.height / (maxY - minY))));
    setView({ k, x: (room.width - (minX + maxX) * k) / 2, y: 8 + (room.height - (minY + maxY) * k) / 2 });
  }, [positions, shown.nodes, size.width, size.height]);
  // Once settled, the whole map comes into view, unless the person has already moved it.
  useEffect(() => {
    if (settled && !touched.current) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);
  const shake = () => {
    worker.current?.postMessage({ type: "shake" } satisfies ToWorker);
  };
  const unpin = (id: string) => {
    if (worker.current) worker.current.postMessage({ type: "unpin", id } satisfies ToWorker);
    else setPositions((all) => ({ ...all, [id]: { ...all[id], pinned: undefined } }));
  };
  const toggleKind = (kind: Kind) => setHidden((s) => { const next = new Set(s); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; });
  const focusOn = (home: string | null) => {
    setFocusHome(home);
    touched.current = false;
    setSelected(null);
  };
  const goTo = (id: string) => {
    const p = positions[id];
    if (!p) return;
    setSelected(id);
    touched.current = true;
    setView((v) => ({ ...v, x: size.width / 2 - p.x * v.k, y: size.height / 2 - p.y * v.k }));
  };

  if (error) return <p className="notice" role="alert">{error}</p>;
  if (!graph || !shaped) return <p className="muted">Drawing the map…</p>;
  if (!graph.nodes.length) return <p className="empty">Nothing to map yet. A module, a table or a skill is the first dot.</p>;

  const selectedNode = selected ? byId.get(selected) ?? null : null;
  const selectedEdges = selectedNode ? shown.edges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id) : [];
  const counts = new Map<Kind, number>();
  for (const n of shaped.nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const focusTitle = focusHome ? byId.get(`module:${focusHome}`)?.title ?? graph.nodes.find((n) => n.id === `module:${focusHome}`)?.title : null;

  return (
    <div className="map" ref={box} aria-label="The map of Alpha's work">
      <svg className={`map__svg${settled ? "" : " map__svg--settling"}`} width={size.width} height={size.height} role="img" aria-label={`${shown.nodes.length} things and ${shown.edges.filter((e) => e.kind !== "in").length} links`} onPointerDown={(e) => onPointerDown(e, null)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}>
        <defs>
          <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-3)" />
          </marker>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g className="map__edges">
            {shown.edges.map((e, i) => {
              if (e.kind === "in") return null;
              const a = positions[e.from];
              const b = positions[e.to];
              if (!a || !b) return null;
              const dim = lit ? !(lit.has(e.from) && lit.has(e.to)) : false;
              const from = byId.get(e.from);
              const to = byId.get(e.to);
              return (
                <path key={i} className={`map__edge map__edge--${e.kind.replace(/ /g, "-")}${dim ? " map__edge--dim" : ""}`} d={curve(a, b)} markerEnd="url(#map-arrow)">
                  <title>{`${from?.title ?? e.from} ${edgeWords(e, to?.title ?? e.to)}${e.source ? ` — ${e.source}` : ""}`}</title>
                </path>
              );
            })}
          </g>
          <g className="map__nodes">
            {shown.nodes.map((n) => {
              const p = positions[n.id];
              if (!p) return null;
              const r = toMapNodes([n], anchors)[0].r;
              const state = stateOf(n);
              const dim = lit ? !lit.has(n.id) : false;
              return (
                <g
                  key={n.id}
                  className={`map__node map__node--${n.kind}${state ? ` map__node--${state}` : ""}${dim ? " map__node--dim" : ""}${selected === n.id ? " map__node--selected" : ""}${p.pinned ? " map__node--pinned" : ""}`}
                  transform={`translate(${p.x} ${p.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.title}, ${n.kind}${n.subtitle && n.kind !== "source" ? `, ${n.subtitle}` : ""}`}
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
                  {p.pinned ? <circle className="map__pin" cx={r * 0.7} cy={-r * 0.7} r={4} /> : null}
                  {labelled(n) ? (
                    <g transform={`translate(0 ${r + 4}) scale(${labelScale})`}>
                      <text y={13} textAnchor="middle" className="map__label">{n.title.length > 26 ? `${n.title.slice(0, 25)}…` : n.title}</text>
                      {n.sources?.length ? <text y={27} textAnchor="middle" className="map__sub">{`${n.sources.length} source${n.sources.length === 1 ? "" : "s"}`}</text> : null}
                    </g>
                  ) : null}
                </g>
              );
            })}
          </g>
        </g>
      </svg>
      <div className="map__tools">
        <input className="map__search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && matches?.size) goTo([...matches][0]); if (e.key === "Escape") setQuery(""); }} placeholder="Find…" aria-label="Find on the map" />
        <IconButton size="sm" label="Zoom in" icon={<span aria-hidden="true">+</span>} onClick={() => zoomBy(1.3)} />
        <IconButton size="sm" label="Zoom out" icon={<span aria-hidden="true">−</span>} onClick={() => zoomBy(0.77)} />
        <Button size="sm" onClick={() => fit()}>Fit</Button>
        <Button size="sm" onClick={shake} disabled={!worker.current} title="Let every pinned node go and settle again">Shake</Button>
        <Button size="sm" onClick={fetchGraph} title={asOf ? `As of ${asOf.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}; refreshes when the app changes and every half minute in view` : undefined}>Refresh</Button>
      </div>
      {focusHome !== null ? (
        <div className="map__focus">
          <span>Showing {focusTitle ?? "one module"}</span>
          <IconButton size="sm" label="Show everything" icon={<X />} onClick={() => focusOn(null)} />
        </div>
      ) : null}
      <div className="map__legend" role="group" aria-label="Show">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" className={`map__chip${hidden.has(k.kind) ? " map__chip--off" : ""}`} aria-pressed={!hidden.has(k.kind)} onClick={() => toggleKind(k.kind)}>
            <i style={{ background: `var(--k-${k.kind})` }} aria-hidden="true" />
            {k.label}
            <span className="map__count">{counts.get(k.kind) ?? 0}</span>
          </button>
        ))}
      </div>
      {selectedNode ? (
        <aside className="map__card" aria-label={selectedNode.title}>
          <div className="map__card-head">
            <span className="map__dot" style={{ background: colourOf(selectedNode) }} aria-hidden="true" />
            <b>{selectedNode.title}</b>
            <span className="faint">{selectedNode.kind === "skill" ? `${selectedNode.role} skill` : selectedNode.kind}</span>
            <IconButton size="sm" label="Close" icon={<X />} onClick={() => setSelected(null)} />
          </div>
          {selectedNode.subtitle ? <p className="muted map__addr">{selectedNode.subtitle}</p> : null}
          {selectedNode.description ? <p className="map__desc">{selectedNode.description}</p> : null}
          {stateWords(selectedNode.state) ? <p className={stateOf(selectedNode) === "bad" ? "notice" : "muted"}>{stateWords(selectedNode.state)}{selectedNode.detail ? `: ${selectedNode.detail}` : ""}</p> : null}
          {selectedNode.kind === "skill" && selectedNode.runs !== undefined ? <p className="muted">{selectedNode.runs} run{selectedNode.runs === 1 ? "" : "s"} in 30 days{selectedNode.failed ? `, ${selectedNode.failed} failed` : ""}</p> : null}
          {selectedNode.sources?.length ? (
            <div>
              <p className="faint map__h">Reads</p>
              <ul className="map__links">
                {selectedNode.sources.map((s) => (
                  <li key={s.title}>{s.title}{s.state && s.state !== "working" ? <span className="faint"> · {stateWords(s.state)}</span> : null}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {selectedEdges.filter((e) => e.kind !== "in").length ? (
            <div>
              <p className="faint map__h">Links</p>
              <ul className="map__links">
                {selectedEdges.filter((e) => e.kind !== "in").map((e, i) => {
                  const other = e.from === selectedNode.id ? byId.get(e.to) : byId.get(e.from);
                  const words = e.from === selectedNode.id ? edgeWords(e, other?.title ?? "") : `${other?.title ?? ""} ${e.kind} this`;
                  return (
                    <li key={i}>
                      <button type="button" className="linkbtn" onClick={() => other && goTo(other.id)}>{words}</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <div className="row" style={{ marginTop: 8 }}>
            {addressOf(selectedNode) && onGo ? (
              <Button size="sm" variant="primary" onClick={() => onGo(addressOf(selectedNode)!)}>Open</Button>
            ) : null}
            {selectedNode.kind === "module" && selectedNode.module && focusHome !== selectedNode.module ? (
              <Button size="sm" onClick={() => focusOn(selectedNode.module!)}>Just this module</Button>
            ) : null}
            {positions[selectedNode.id]?.pinned ? (
              <Button size="sm" variant="ghost" onClick={() => unpin(selectedNode.id)}>Let go</Button>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
