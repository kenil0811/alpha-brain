/**
 * Second Brain's graph view (the owner, 12 Oct; Obsidian's graph view as the reference): every
 * thing in the platform and every link between them, in one picture filling the page.
 * - The legend is the kind filter: each chip shows or hides a kind, with its count.
 * - Search finds a node and centres on it; Filter hides nodes that link to nothing; ⋮ has
 *   labels and Refresh (the world map is asked again only then, Q30).
 * - Hover lights a node's neighbours; a click selects it and opens the side panel (its links,
 *   ✓ / ✕ for a hypothesis, Open page, and the local graph 1–3 links around it); a double-click
 *   opens its page.
 * - Zoom and move with the buttons in the bottom-right corner, the wheel, or by dragging.
 * "Graph" is this: things and links. "Map" is kept for places on a world map.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { say } from "../../core/client";
import type { Client, Intelligence, WorkGraph } from "../../core/client";
import { Button, IconButton, Notice, Toggle, ZoomControls } from "../../ui";
import { ICON_SM, X } from "../../ui/icons";
import { HypothesisButtons } from "../intel/Hypothesis";
import type { TableRecords } from "./collect";
import type { Surface } from "../Rail";
import { KINDS, around, cachedWorld, graphOf, groups, keepWorld, neighbours, overview, place, search, visible, type GNode, type GraphKind, type Placed } from "./model";

const W = 1000;
const H = 700;
const RADIUS: Partial<Record<GraphKind, number>> = { you: 14, module: 10, collection: 7, agent: 8, automation: 7, record: 3 };
const label = (k: GraphKind) => KINDS.find((x) => x.kind === k)?.label ?? k;
type Depth = "all" | "1" | "2" | "3";

/** What the page around the graph sets: its toolbar's search, and the options in its ⋮. */
export interface GraphOptions {
  query: string;
  orphans: boolean;
  labels: boolean;
  /** Every record and person, not the overview of projects, collections and organisations. */
  every?: boolean;
  /** Bumped by Refresh. */
  refresh: number;
}

export function GraphView({ client, data, onGo, onChanged, options }: { client: Client; data: Intelligence; onGo?: (s: Surface) => void; onChanged: () => void; options: GraphOptions }) {
  const { query, orphans, labels, every = false, refresh: tick } = options;
  const [world, setWorld] = useState<WorkGraph | null>(() => cachedWorld(client));
  const [problem, setProblem] = useState<string | null>(null);
  const fetched = useRef(tick); // the Refresh last asked for, so a remount doesn't ask again
  useEffect(() => {
    if (world && tick === fetched.current) return;
    fetched.current = tick;
    let live = true;
    client
      .graph("world")
      .then((g) => {
        keepWorld(client, g);
        if (live) setWorld(g);
      })
      .catch((e: unknown) => live && setProblem(say(e))); // the graph still draws what Intelligence holds
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asked once, and again on Refresh
  }, [client, tick]);
  const base = useMemo(() => graphOf(world, data), [world, data]);
  // every collection's records, read once per set of collections; one that fails is left out
  const names = base.nodes.filter((n) => n.kind === "collection" && n.id.startsWith("table:")).map((n) => n.id.slice("table:".length)).join("\n");
  const [tables, setTables] = useState<TableRecords[]>([]);
  useEffect(() => {
    if (!names || !every) return; // the overview needs no records
    let live = true;
    void Promise.allSettled(names.split("\n").map(async (name) => client.table(name))).then((got) => {
      if (live) setTables(got.flatMap((g) => (g.status === "fulfilled" && g.value ? [g.value] : [])));
    });
    return () => {
      live = false;
    };
  }, [client, names, tick, every]);
  const graph = useMemo(() => (every ? (tables.length ? graphOf(world, data, tables) : base) : overview(base)), [base, world, data, tables, every]);
  const placed = useRef<Placed>({});
  const at = useMemo(() => (placed.current = place(graph, placed.current)), [graph]);
  const near = useMemo(() => neighbours(graph), [graph]);

  const [hidden, setHidden] = useState<Set<GraphKind>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [depth, setDepth] = useState<Depth>("all");
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const only = useMemo(() => (selected && depth !== "all" ? around(graph, selected, Number(depth)) : null), [graph, selected, depth]);
  const shown = useMemo(() => visible(graph, { hidden, only, orphans }), [graph, hidden, only, orphans]);
  const count = useMemo(() => {
    const c = new Map<GraphKind, number>();
    for (const n of graph.nodes) c.set(n.kind, (c.get(n.kind) ?? 0) + 1);
    return c;
  }, [graph]);
  const node = selected ? graph.nodes.find((n) => n.id === selected) : undefined;
  // a node that went (a rejected hypothesis) takes its selection and local graph with it
  useEffect(() => {
    if (selected && !node) {
      setSelected(null);
      setDepth("all");
    }
  }, [selected, node]);
  const lit = hover ?? selected;
  // the graph's one tab stop: the selected node, else you, else the first shown
  const tabStop = node && shown.nodes.includes(node) ? node.id : shown.nodes.some((n) => n.id === "you") ? "you" : shown.nodes[0]?.id;
  const litSet = lit ? new Set([lit, ...(near.get(lit) ?? [])]) : null;

  const fit = (nodes = shown.nodes) => {
    if (!nodes.length) return setView({ x: 0, y: 0, k: 1 });
    const xs = nodes.map((n) => at[n.id]?.x ?? 0);
    const ys = nodes.map((n) => at[n.id]?.y ?? 0);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(3, Math.max(0.2, 0.9 * Math.min(W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0))));
    setView({ k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k });
  };
  // fit as the graph fills in (Intelligence, then the world, then the records) until the person
  // moves the view, and again whenever the local graph changes
  const fitted = useRef("");
  const moved = useRef(false);
  useEffect(() => {
    const local = selected && depth !== "all" ? `${selected}:${depth}` : "";
    const key = `${moved.current && !local ? "" : shown.nodes.length}|${local}`;
    if (fitted.current !== key) {
      fitted.current = key;
      fit();
    }
  });
  const centre = (id: string) => {
    const p = at[id];
    if (p) setView((v) => ({ ...v, x: -p.x * v.k, y: -p.y * v.k }));
  };
  const zoom = (by: number) => {
    moved.current = true;
    setView((v) => ({ k: Math.min(6, Math.max(0.1, v.k * by)), x: v.x * by, y: v.y * by }));
  };
  const move = (dx: number, dy: number) => {
    moved.current = true;
    setView((v) => ({ ...v, x: v.x + dx * 120, y: v.y + dy * 120 }));
  };
  // the drawing is scaled to fit ("meet"): by its width or its height, whichever is tighter
  const unitsPerPixel = () => Math.max(W / (svg.current?.clientWidth || W), H / (svg.current?.clientHeight || H));
  /** Labels read 12px on screen whatever the drawing's scale or zoom. */
  const textSize = (12 * unitsPerPixel()) / view.k;
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest(".gnode")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    moved.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const dragMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const u = unitsPerPixel();
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x) * u, y: d.vy + (e.clientY - d.y) * u }));
  };
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  // the toolbar's search finds as it is typed: the first thing shown by that name, selected and centred
  useEffect(() => {
    if (!query.trim()) return setMessage(null);
    const hit = search(shown, query)[0];
    if (!hit) return setMessage({ ok: false, text: `Nothing shown is called "${query.trim()}".` });
    setMessage(null);
    setSelected(hit.id);
    centre(hit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on a new search, and once more when the graph arrives
  }, [query, shown.nodes.length > 0]);

  return (
    <div className="graph">
      <div className="graph__legend" role="group" aria-label="Kinds shown">
        {KINDS.filter((k) => count.get(k.kind)).map((k) => (
          <button key={k.kind} type="button" className={`gchip gchip--${k.kind}`} aria-pressed={!hidden.has(k.kind)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(k.kind)) n.delete(k.kind); else n.add(k.kind); return n; })}>
            <span className="gchip__dot" aria-hidden="true" />
            {k.label} <span className="gchip__n">{count.get(k.kind)}</span>
          </button>
        ))}
      </div>
      {problem ? <Notice tone="bad">Couldn't load all of the graph: {problem}</Notice> : null}
      {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
      <div className={`graph__body${node ? " graph__body--side" : ""}`}>
        <div className="graph__canvas">
          <svg ref={svg} className="graph__svg" viewBox={`${-W / 2} ${-H / 2} ${W} ${H}`} role="img" aria-label={`The graph: ${shown.nodes.length} things, ${shown.edges.length} links`} onPointerDown={down} onPointerMove={dragMove} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
            <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {groups(shown, at).map((g) => (
                <circle key={`group:${g.id}`} className={`ggroup${lit === g.id ? " ggroup--lit" : ""}`} cx={g.x} cy={g.y} r={g.r} aria-hidden="true" />
              ))}
              {shown.edges.map((e) => {
                const a = at[e.from];
                const b = at[e.to];
                if (!a || !b) return null;
                const on = litSet ? litSet.has(e.from) && litSet.has(e.to) && (e.from === lit || e.to === lit) : false;
                return <line key={`${e.from}|${e.to}`} className={`gedge${e.waiting ? " gedge--waiting" : ""}${on ? " gedge--lit" : litSet ? " gedge--dim" : ""}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
              })}
              {shown.nodes.map((n) => {
                const p = at[n.id];
                if (!p) return null;
                const r = (RADIUS[n.kind] ?? 5) + (n.size ? Math.min(12, Math.sqrt(n.size) / 2) : Math.min(6, Math.sqrt(near.get(n.id)?.size ?? 0)));
                // named when it is drawn large enough on screen to carry a name: the larger, the sooner
                const named = labels || (r * view.k) / unitsPerPixel() >= 14 || n.kind === "you" || n.kind === "module" || n.kind === "collection" || litSet?.has(n.id);
                return (
                  <g
                    key={n.id}
                    className={`gnode gnode--${n.kind}${n.id === selected ? " gnode--on" : ""}${litSet && !litSet.has(n.id) ? " gnode--dim" : ""}`}
                    transform={`translate(${p.x} ${p.y})`}
                    role="button"
                    data-id={n.id}
                    tabIndex={n.id === tabStop ? 0 : -1}
                    aria-label={`${n.title}, ${label(n.kind)}`}
                    aria-pressed={n.id === selected}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(n.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => setSelected(n.id)}
                    onDoubleClick={() => n.open && onGo?.(n.open)}
                    onKeyDown={(e) => {
                      if (e.key.startsWith("Arrow")) {
                        // one tab stop for the whole graph: the arrows walk to the next or previous neighbour
                        e.preventDefault();
                        const list = [...(near.get(n.id) ?? [])].filter((id) => shown.nodes.some((m) => m.id === id));
                        if (!list.length) return;
                        const next = list[(e.key === "ArrowLeft" || e.key === "ArrowUp" ? list.length - 1 : 0)];
                        setSelected(next);
                        centre(next);
                        requestAnimationFrame(() => (svg.current?.querySelector(`[data-id="${CSS.escape(next)}"]`) as SVGGElement | null)?.focus());
                      } else if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (n.id === selected && n.open) onGo?.(n.open);
                        else setSelected(n.id);
                      }
                    }}
                  >
                    <circle r={r} />
                    {named ? (
                      <text className="gnode__label" y={r + textSize} fontSize={textSize}>
                        {n.title.length > 28 ? `${n.title.slice(0, 27)}…` : n.title}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
          <ZoomControls onZoom={zoom} onMove={move} onFit={() => fit()} />
        </div>
        {node ? (
          <aside className="card graph__side" aria-label={node.title}>
            <div className="graph__sidehead">
              <div className="graph__sidetitles">
                <h3>{node.title}</h3>
                <span className="faint">{[label(node.kind), node.detail].filter(Boolean).join(" · ")}</span>
              </div>
              <IconButton size="sm" label="Close" icon={<X size={ICON_SM} />} onClick={() => { setSelected(null); setDepth("all"); }} />
            </div>
            {node.kind === "hypothesis" ? (
              <HypothesisButtons client={client} id={node.id.slice("fact:".length)} text={node.title} done={(text, ok = true) => { setMessage({ ok, text }); if (ok) onChanged(); }} />
            ) : null}
            {node.open ? (
              <Button size="sm" onClick={() => onGo?.(node.open!)}>
                Open page
              </Button>
            ) : null}
            <Toggle<Depth> inBody label="Local graph" value={depth} onChange={setDepth} items={[{ id: "all", label: "All" }, { id: "1", label: "1 link" }, { id: "2", label: "2 links" }, { id: "3", label: "3 links" }]} />
            <h4 className="graph__links">Links ({near.get(node.id)?.size ?? 0})</h4>
            <ul className="graph__linklist">
              {[...(near.get(node.id) ?? [])].map((id) => graph.nodes.find((n) => n.id === id)).filter((n): n is GNode => Boolean(n)).map((n) => (
                <li key={n.id}>
                  <button type="button" className="graph__link" onClick={() => { setSelected(n.id); centre(n.id); }}>
                    <span className={`gchip__dot gchip--${n.kind}`} aria-hidden="true" />
                    <span className="graph__linkname">{n.title}</span>
                    <span className="faint">{label(n.kind)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
