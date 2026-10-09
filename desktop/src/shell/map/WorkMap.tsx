/**
 * The map (Intelligence › Map), in two views. **World** is the person's brain: themselves at
 * the centre, their areas sized by what happened there, the tables, documents, pages and goals
 * in each, the people and organisations Alpha knows, and the links between them, with the
 * ones Alpha proposed drawn dashed until the person decides. What is concentrated shows as a
 * dense, big cluster; what is quiet as a small one; what nothing connects wears a dotted ring,
 * and the glance at the corner counts it. **Work** is Alpha's own plumbing: skills, automations,
 * sources, connections. Both are drawn the same way: a force layout in a worker, pan, zoom,
 * find, pins, focus on one area, a card for anything with its links in words and Open.
 *
 * The map asks the core only when the person opens it for the first time and when they press
 * Refresh (Q30: never on a clock); it says as of when. Refresh on the World view also has
 * Alpha look over the map for links (a cheap model run) before redrawing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client, GraphEdge, GraphKind, GraphNode, WorkGraph } from "../../core/client";
import type { Surface } from "../Rail";
import { timeText } from "../../modules/format";
import { Button, IconButton } from "../../ui";
import { ActivityIcon, BookOpen, Building2, Eye, FileText, Flag, FolderOpen, Globe, IntelligenceIcon, Layers, Link2, Play, Table2, User, X, Zap } from "../../ui/icons";
import { anchorsFor, makeSimulation, positionsOf, settle, toMapEdges, toMapNodes, type Anchors, type Positions } from "./layout";
import type { FromWorker, ToWorker } from "./layout.worker";
import { shape, signature, type ShapedNode } from "./shape";

type Kind = GraphNode["kind"];
const KINDS: Record<GraphKind, { kind: Kind; label: string }[]> = {
  work: [
    { kind: "module", label: "Modules" },
    { kind: "table", label: "Tables" },
    { kind: "skill", label: "Skills" },
    { kind: "automation", label: "Automations" },
    { kind: "source", label: "Sources" },
    { kind: "connection", label: "Connections" },
  ],
  world: [
    { kind: "module", label: "Areas" },
    { kind: "table", label: "Tables" },
    { kind: "person", label: "People" },
    { kind: "organisation", label: "Organisations" },
    { kind: "document", label: "Documents" },
    { kind: "page", label: "Pages" },
    { kind: "goal", label: "Goals" },
  ],
};
/** The edges that only say where a thing belongs: the clusters show it, so they are not drawn. */
const MEMBERSHIP = new Set<GraphEdge["kind"]>(["in", "about", "of"]);
const LONELY_KINDS = new Set<Kind>(["person", "organisation", "document"]);
const PLACES_KEY = "alpha.map.places";

/** The last map of each kind this window drew for a core: opening the tab again shows it, as of then. */
const caches = new WeakMap<Client, Map<GraphKind, { graph: WorkGraph; at: Date }>>();
const cacheFor = (client: Client) => caches.get(client) ?? caches.set(client, new Map()).get(client)!;

/** The address a node opens: the window's, not the core's. */
export function addressOf(node: GraphNode): Surface | null {
  switch (node.kind) {
    case "module":
      return node.module ? { kind: "module", id: node.module } : null;
    case "table":
    case "source":
    case "document":
    case "goal":
      return node.module ? { kind: "module", id: node.module } : { kind: "intelligence", tab: "knowledge" };
    case "skill":
      return { kind: "skill", name: node.name ?? node.id.slice("skill:".length) };
    case "automation":
      return { kind: "automation", id: node.id.slice("automation:".length) };
    case "connection":
      return { kind: "intelligence", tab: "connections" };
    case "person":
    case "organisation":
      return node.entity ? { kind: "entity", id: node.entity } : { kind: "people" };
    case "page":
      return node.module ? { kind: "module", id: node.module } : { kind: "intelligence", tab: "knowledge" };
    case "you":
      return { kind: "intelligence", tab: "knowledge" };
  }
}

/** An edge in words, from the side of `from`. */
export function edgeWords(edge: GraphEdge, other: string): string {
  const count = edge.count ? ` (${edge.count})` : "";
  const order = edge.order ? ` (step ${edge.order})` : "";
  const verb = edge.kind === "related" ? (edge.why ? edge.why.split(":")[0] : "related to") : edge.kind;
  return `${verb} ${other}${order}${count}`;
}

function colourOf(node: GraphNode): string {
  if (node.kind === "skill") return node.role === "read" ? "var(--k-read)" : node.role === "act" ? "var(--k-act)" : "var(--k-run)";
  return `var(--k-${node.kind})`;
}

function Glyph({ node }: { node: GraphNode }) {
  const props = { x: -9, y: -9, width: 18, height: 18, strokeWidth: 2 };
  switch (node.kind) {
    case "module":
      return <Layers {...props} x={-12} y={-12} width={24} height={24} />;
    case "table":
      return <Table2 {...props} />;
    case "automation":
      return <ActivityIcon {...props} />;
    case "source":
      return <Globe {...props} x={-6} y={-6} width={12} height={12} />;
    case "connection":
      return node.subtitle === "files" ? <FolderOpen {...props} /> : <Link2 {...props} />;
    case "you":
      return <User {...props} x={-12} y={-12} width={24} height={24} />;
    case "person":
      return <User {...props} />;
    case "organisation":
      return <Building2 {...props} />;
    case "document":
      return <FileText {...props} />;
    case "page":
      return <BookOpen {...props} />;
    case "goal":
      return <Flag {...props} />;
    case "skill":
      return node.role === "read" ? <Eye {...props} /> : node.role === "act" ? <Zap {...props} /> : node.role === "run" ? <Play {...props} /> : <IntelligenceIcon {...props} />;
  }
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

function kindWords(node: GraphNode): string {
  if (node.kind === "skill") return `${node.role} skill`;
  if (node.kind === "module") return "area";
  if (node.kind === "you") return "the person";
  return node.kind;
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
    const was = remembered();
    localStorage.setItem(PLACES_KEY, JSON.stringify({ ...was, ...positions }));
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

const timeOf = timeText;

export function WorkMap({ client, onGo, initialKind = "world" }: { client: Client; onGo?: (s: Surface) => void; initialKind?: GraphKind }) {
  const [kind, setKind] = useState<GraphKind>(initialKind);
  const cache = cacheFor(client);
  const [graph, setGraph] = useState<WorkGraph | null>(() => cache.get(initialKind)?.graph ?? null);
  const [asOf, setAsOf] = useState<Date | null>(() => cache.get(initialKind)?.at ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [positions, setPositions] = useState<Positions>({});
  const [settled, setSettled] = useState(false);
  const [hidden, setHidden] = useState<Set<Kind>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focusHome, setFocusHome] = useState<string | null>(null);
  const [litSet, setLitSet] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ width: 900, height: 600 });
  const box = useRef<HTMLDivElement | null>(null);
  const worker = useRef<Worker | null>(null);
  const seen = useRef<string | null>(graph ? signature(graph) : null);
  const started = useRef(false);
  const touched = useRef(false);
  const drag = useRef<{ id: string | null; startX: number; startY: number; viewX: number; viewY: number; moved: boolean } | null>(null);

  // The core is asked on the first open of a view and on Refresh, never on a clock. A refresh
  // that changed nothing is dropped; one that did keeps every node's place.
  const fetchGraph = useCallback(async (of: GraphKind): Promise<void> => {
    try {
      const g = await client.graph(of);
      const at = new Date();
      cacheFor(client).set(of, { graph: g, at });
      setAsOf(at);
      setError(null);
      const sig = signature(g);
      if (sig === seen.current) return;
      seen.current = sig;
      setGraph(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);
  useEffect(() => {
    if (!cacheFor(client).has(kind)) void fetchGraph(kind);
  }, [client, fetchGraph, kind]);
  const refresh = async () => {
    setBusy(kind === "world" ? "Alpha is looking for links…" : "Refreshing…");
    try {
      if (kind === "world") await client.connectGraph();
      await fetchGraph(kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const switchKind = (to: GraphKind) => {
    if (to === kind) return;
    const had = cache.get(to);
    setKind(to);
    setSelected(null);
    setFocusHome(null);
    setLitSet(null);
    setHidden(new Set());
    touched.current = false;
    seen.current = had ? signature(had.graph) : null;
    setGraph(had?.graph ?? null);
    setAsOf(had?.at ?? null);
  };

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
    const nodes = shaped.nodes.filter((n) => !hidden.has(n.kind) && (focusHome === null || n.home === focusHome || n.id === `module:${focusHome}` || n.id === "you"));
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
  // What nothing connects: a person, an organisation or a document with no edge beyond
  // belonging to an area. (Tables, pages and goals belong to an area by nature; areas and the
  // person are the places things belong.)
  const lonely = useMemo(() => {
    const linked = new Set<string>();
    for (const e of shown.edges) {
      if (MEMBERSHIP.has(e.kind)) continue;
      linked.add(e.from);
      linked.add(e.to);
    }
    return new Set(shown.nodes.filter((n) => LONELY_KINDS.has(n.kind) && !linked.has(n.id)).map((n) => n.id));
  }, [shown]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(shown.nodes.filter((n) => n.title.toLowerCase().includes(q) || (n.subtitle ?? "").toLowerCase().includes(q) || (n.sources ?? []).some((s) => s.title.toLowerCase().includes(q))).map((n) => n.id));
  }, [query, shown.nodes]);
  const focus = hovered ?? selected;
  const lit = matches ?? litSet ?? (focus ? new Set([focus, ...(neighbours.get(focus) ?? [])]) : null);
  const labelled = (n: GraphNode) => n.kind === "module" || n.kind === "you" || n.kind === "table" || n.kind === "automation" || n.kind === "connection" || n.kind === "goal" || view.k >= 1.4 || focusHome !== null || (lit?.has(n.id) ?? false);
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
    if (!d.moved) {
      setSelected(d.id);
      setLitSet(null);
    }
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
  const toggleKind = (k: Kind) => setHidden((s) => { const next = new Set(s); if (next.has(k)) next.delete(k); else next.add(k); return next; });
  const focusOn = (home: string | null) => {
    setFocusHome(home);
    touched.current = false;
    setSelected(null);
  };
  const goTo = (id: string) => {
    const p = positions[id];
    if (!p) return;
    setSelected(id);
    setLitSet(null);
    touched.current = true;
    setView((v) => ({ ...v, x: size.width / 2 - p.x * v.k, y: size.height / 2 - p.y * v.k }));
  };
  const decide = async (fact: string, accept: boolean) => {
    try {
      await client.decideFact(fact, accept);
      await fetchGraph(kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (error && !graph) return <p className="notice" role="alert">{error}</p>;
  if (!graph || !shaped) return <p className="muted">Drawing the map…</p>;

  const selectedNode = selected ? byId.get(selected) ?? null : null;
  const selectedEdges = selectedNode ? shown.edges.filter((e) => e.from === selectedNode.id || e.to === selectedNode.id) : [];
  const counts = new Map<Kind, number>();
  for (const n of shaped.nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const focusTitle = focusHome ? byId.get(`module:${focusHome}`)?.title ?? graph.nodes.find((n) => n.id === `module:${focusHome}`)?.title : null;
  const areas = shaped.nodes.filter((n) => n.kind === "module").sort((a, b) => (b.activity ?? 0) - (a.activity ?? 0));
  const suggested = shown.edges.filter((e) => e.kind === "related" && e.state === "suggested").length;

  return (
    <div className="map" ref={box} aria-label={kind === "world" ? "The map of your world" : "The map of Alpha's work"}>
      {!graph.nodes.length ? (
        <p className="empty" style={{ padding: 24 }}>Nothing to map yet. A module, a table or a skill is the first dot.</p>
      ) : (
        <svg className={`map__svg${settled ? "" : " map__svg--settling"}`} width={size.width} height={size.height} role="img" aria-label={`${shown.nodes.length} things and ${shown.edges.filter((e) => !MEMBERSHIP.has(e.kind)).length} links`} onPointerDown={(e) => onPointerDown(e, null)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}>
          <defs>
            <marker id="map-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-3)" />
            </marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <g className="map__edges">
              {shown.edges.map((e, i) => {
                if (MEMBERSHIP.has(e.kind)) return null;
                const a = positions[e.from];
                const b = positions[e.to];
                if (!a || !b) return null;
                const dim = lit ? !(lit.has(e.from) && lit.has(e.to)) : false;
                const from = byId.get(e.from);
                const to = byId.get(e.to);
                return (
                  <path key={i} className={`map__edge map__edge--${e.kind.replace(/ /g, "-")}${e.state === "suggested" ? " map__edge--suggested" : ""}${dim ? " map__edge--dim" : ""}`} d={curve(a, b)} markerEnd={e.kind === "related" ? undefined : "url(#map-arrow)"}>
                    <title>{`${from?.title ?? e.from} ${edgeWords(e, to?.title ?? e.to)}${e.state === "suggested" ? " (Alpha thinks)" : ""}${e.source ? ` — ${e.source}` : ""}`}</title>
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
                    className={`map__node map__node--${n.kind}${state ? ` map__node--${state}` : ""}${dim ? " map__node--dim" : ""}${selected === n.id ? " map__node--selected" : ""}${p.pinned ? " map__node--pinned" : ""}${lonely.has(n.id) ? " map__node--lonely" : ""}`}
                    transform={`translate(${p.x} ${p.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.title}, ${kindWords(n)}${n.subtitle && n.kind !== "source" ? `, ${n.subtitle}` : ""}${lonely.has(n.id) ? ", not linked" : ""}`}
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
      )}
      <div className="map__tools">
        <div className="toggle toggle--views" role="tablist" aria-label="Which map">
          <button type="button" role="tab" aria-selected={kind === "world"} onClick={() => switchKind("world")}>World</button>
          <button type="button" role="tab" aria-selected={kind === "work"} onClick={() => switchKind("work")}>Work</button>
        </div>
        <input className="map__search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && matches?.size) goTo([...matches][0]); if (e.key === "Escape") setQuery(""); }} placeholder="Find…" aria-label="Find on the map" />
        <IconButton size="sm" label="Zoom in" icon={<span aria-hidden="true">+</span>} onClick={() => zoomBy(1.3)} />
        <IconButton size="sm" label="Zoom out" icon={<span aria-hidden="true">−</span>} onClick={() => zoomBy(0.77)} />
        <Button size="sm" onClick={() => fit()}>Fit</Button>
        <Button size="sm" onClick={shake} disabled={!worker.current} title="Let every pinned node go and settle again">Shake</Button>
        <Button size="sm" onClick={() => void refresh()} disabled={busy !== null} title={kind === "world" ? "Ask the core again and have Alpha look for links" : "Ask the core again"}>Refresh</Button>
        {asOf ? <span className="map__asof">as of {timeOf(asOf)}</span> : null}
      </div>
      {busy ? <div className="map__busy" role="status">{busy}</div> : null}
      {error && graph ? <div className="map__busy notice" role="alert">{error}</div> : null}
      {focusHome !== null ? (
        <div className="map__focus">
          <span>Showing {focusTitle ?? "one area"}</span>
          <IconButton size="sm" label="Show everything" icon={<X />} onClick={() => focusOn(null)} />
        </div>
      ) : null}
      <div className="map__legend" role="group" aria-label="Show">
        {KINDS[kind].map((k) => (
          <button key={k.kind} type="button" className={`map__chip${hidden.has(k.kind) ? " map__chip--off" : ""}`} aria-pressed={!hidden.has(k.kind)} onClick={() => toggleKind(k.kind)}>
            <i style={{ background: `var(--k-${k.kind})` }} aria-hidden="true" />
            {k.label}
            <span className="map__count">{counts.get(k.kind) ?? 0}</span>
          </button>
        ))}
      </div>
      {kind === "world" && graph.nodes.length && !selectedNode ? (
        <aside className="map__glance" aria-label="At a glance">
          {areas.length ? (
            <div>
              <b>Most going on:</b> {areas.slice(0, 3).map((a) => `${a.title} (${a.activity ?? 0})`).join(", ")}
              {areas.length > 3 && (areas[areas.length - 1].activity ?? 0) < (areas[0].activity ?? 0) / 4 ? <span>; quietest: {areas[areas.length - 1].title}</span> : null}
            </div>
          ) : null}
          <div>
            <b>Not linked:</b>{" "}
            {lonely.size ? (
              <button type="button" className="linkbtn" onClick={() => setLitSet((s) => (s ? null : new Set(lonely)))}>{lonely.size} thing{lonely.size === 1 ? "" : "s"} nothing connects</button>
            ) : (
              "nothing; everything connects to something"
            )}
          </div>
          {suggested ? <div><b>Alpha thinks:</b> {suggested} link{suggested === 1 ? " waits" : "s wait"} for your yes</div> : null}
          <div className="faint">Refresh asks Alpha to look for links; dashed lines are its guesses.</div>
        </aside>
      ) : null}
      {selectedNode ? (
        <aside className="map__card" aria-label={selectedNode.title}>
          <div className="map__card-head">
            <span className="map__dot" style={{ background: colourOf(selectedNode) }} aria-hidden="true" />
            <b>{selectedNode.title}</b>
            <span className="faint">{kindWords(selectedNode)}</span>
            <IconButton size="sm" label="Close" icon={<X />} onClick={() => setSelected(null)} />
          </div>
          {selectedNode.subtitle ? <p className="muted map__addr">{selectedNode.subtitle}</p> : null}
          {selectedNode.description ? <p className="map__desc">{selectedNode.description}</p> : null}
          {selectedNode.facts?.length ? (
            <ul className="map__links">
              {selectedNode.facts.map((f) => (
                <li key={f.predicate}>{f.predicate.replace(/_/g, " ")}: {f.value}</li>
              ))}
            </ul>
          ) : null}
          {stateWords(selectedNode.state) ? <p className={stateOf(selectedNode) === "bad" ? "notice" : "muted"}>{stateWords(selectedNode.state)}{selectedNode.detail ? `: ${selectedNode.detail}` : ""}</p> : null}
          {selectedNode.kind === "skill" && selectedNode.runs !== undefined ? <p className="muted">{selectedNode.runs} run{selectedNode.runs === 1 ? "" : "s"} in 30 days{selectedNode.failed ? `, ${selectedNode.failed} failed` : ""}</p> : null}
          {selectedNode.kind !== "skill" && selectedNode.activity ? <p className="muted">{selectedNode.activity} thing{selectedNode.activity === 1 ? "" : "s"} happened here in 30 days</p> : null}
          {lonely.has(selectedNode.id) ? <p className="muted">Nothing connects this yet.</p> : null}
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
          {selectedEdges.filter((e) => !MEMBERSHIP.has(e.kind)).length ? (
            <div>
              <p className="faint map__h">Links</p>
              <ul className="map__links">
                {selectedEdges.filter((e) => !MEMBERSHIP.has(e.kind)).map((e, i) => {
                  const other = e.from === selectedNode.id ? byId.get(e.to) : byId.get(e.from);
                  const words = e.from === selectedNode.id ? edgeWords(e, other?.title ?? "") : `${other?.title ?? ""} ${edgeWords({ ...e, kind: e.kind }, "this")}`;
                  return (
                    <li key={i}>
                      <button type="button" className="linkbtn" onClick={() => other && goTo(other.id)}>{words}</button>
                      {e.kind === "related" && e.state === "suggested" ? (
                        <div className="map__think">
                          Alpha thinks: {e.why?.split(":").slice(1).join(":").trim() || e.why}
                          {e.source ? <span className="faint"> — {e.source.replace(/^map:/, "")}</span> : null}
                          <div className="row" style={{ marginTop: 6 }}>
                            <Button size="sm" variant="primary" onClick={() => void decide(e.fact!, true)}>Yes, keep it</Button>
                            <Button size="sm" variant="ghost" onClick={() => void decide(e.fact!, false)}>No</Button>
                          </div>
                        </div>
                      ) : null}
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
              <Button size="sm" onClick={() => focusOn(selectedNode.module!)}>Just this area</Button>
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
