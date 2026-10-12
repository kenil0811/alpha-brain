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
import { Button, IconButton, Notice, Toggle, ZoomControls, useContextMenu } from "../../ui";
import { Check, FilterIcon, ICON_SM, MoreVertical, SearchIcon, X } from "../../ui/icons";
import type { TableRecords } from "./collect";
import type { Surface } from "../Rail";
import { KINDS, around, cachedWorld, graphOf, keepWorld, neighbours, place, search, visible, type GNode, type GraphKind, type Placed } from "./model";

const W = 1000;
const H = 700;
const RADIUS: Partial<Record<GraphKind, number>> = { you: 14, module: 10, collection: 7, agent: 8, automation: 7, record: 3 };
const label = (k: GraphKind) => KINDS.find((x) => x.kind === k)?.label ?? k;
type Depth = "all" | "1" | "2" | "3";

export function GraphView({ client, data, onGo, onChanged }: { client: Client; data: Intelligence; onGo?: (s: Surface) => void; onChanged: () => void }) {
  const [world, setWorld] = useState<WorkGraph | null>(() => cachedWorld(client));
  const [tick, setTick] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (world && !tick) return;
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
    if (!names) return;
    let live = true;
    void Promise.allSettled(names.split("\n").map(async (name) => client.table(name))).then((got) => {
      if (live) setTables(got.flatMap((g) => (g.status === "fulfilled" && g.value ? [g.value] : [])));
    });
    return () => {
      live = false;
    };
  }, [client, names, tick]);
  const graph = useMemo(() => (tables.length ? graphOf(world, data, tables) : base), [base, world, data, tables]);
  const placed = useRef<Placed>({});
  const at = useMemo(() => (placed.current = place(graph, placed.current)), [graph]);
  const near = useMemo(() => neighbours(graph), [graph]);

  const [hidden, setHidden] = useState<Set<GraphKind>>(new Set());
  const [orphans, setOrphans] = useState(true);
  const [labels, setLabels] = useState(false);
  const [query, setQuery] = useState("");
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
  const lit = hover ?? selected;
  const litSet = lit ? new Set([lit, ...(near.get(lit) ?? [])]) : null;

  const fit = (nodes = shown.nodes) => {
    if (!nodes.length) return setView({ x: 0, y: 0, k: 1 });
    const xs = nodes.map((n) => at[n.id]?.x ?? 0);
    const ys = nodes.map((n) => at[n.id]?.y ?? 0);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(3, Math.max(0.2, 0.9 * Math.min(W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0))));
    setView({ k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k });
  };
  // fit once the graph first has its shape, and again when the local graph changes
  const fitted = useRef("");
  useEffect(() => {
    const key = `${shown.nodes.length > 0}|${selected && depth !== "all" ? `${selected}:${depth}` : ""}`;
    if (fitted.current !== key) {
      fitted.current = key;
      fit();
    }
  });
  const centre = (id: string) => {
    const p = at[id];
    if (p) setView((v) => ({ ...v, x: -p.x * v.k, y: -p.y * v.k }));
  };
  const zoom = (by: number) => setView((v) => ({ k: Math.min(6, Math.max(0.1, v.k * by)), x: v.x * by, y: v.y * by }));
  const move = (dx: number, dy: number) => setView((v) => ({ ...v, x: v.x + dx * 120, y: v.y + dy * 120 }));
  const unitsPerPixel = () => W / (svg.current?.clientWidth || W);
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest(".gnode")) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
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

  const find = () => {
    const hit = search(shown, query)[0];
    if (!hit) return setMessage({ ok: false, text: `Nothing shown is called "${query.trim()}".` });
    setMessage(null);
    setSelected(hit.id);
    centre(hit.id);
  };
  const decide = async (n: GNode, accept: boolean) => {
    try {
      await client.decideFact(n.id.slice("fact:".length), accept);
      setMessage({ ok: true, text: accept ? "Kept as a fact." : "Rejected." });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: say(e) });
    }
  };
  const filterMenu = useContextMenu([{ label: "Things with no links", on: orphans, onSelect: () => setOrphans((o) => !o) }]);
  const moreMenu = useContextMenu([
    { label: "Always show names", on: labels, onSelect: () => setLabels((l) => !l) },
    { label: "Refresh", onSelect: () => setTick((t) => t + 1), separatorBefore: true },
  ]);

  return (
    <div className="graph">
      <div className="toolbar graph__bar">
        <form className="graph__search" role="search" onSubmit={(e) => { e.preventDefault(); find(); }}>
          <SearchIcon size={ICON_SM} aria-hidden="true" />
          <input className="textfield" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find in the graph" aria-label="Find in the graph" />
        </form>
        <span className="spacer" />
        <Button size="sm" variant="ghost" icon={<FilterIcon size={ICON_SM} />} aria-haspopup="menu" onClick={(e) => filterMenu.openFrom(undefined, e.currentTarget)}>
          Filter
        </Button>
        <IconButton label="More" icon={<MoreVertical />} aria-haspopup="menu" onClick={(e) => moreMenu.openFrom(undefined, e.currentTarget)} />
        {filterMenu.menu}
        {moreMenu.menu}
      </div>
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
                const r = (RADIUS[n.kind] ?? 5) + Math.min(6, Math.sqrt(near.get(n.id)?.size ?? 0));
                const named = labels || view.k >= 1.6 || n.kind === "you" || n.kind === "module" || litSet?.has(n.id);
                return (
                  <g
                    key={n.id}
                    className={`gnode gnode--${n.kind}${n.id === selected ? " gnode--on" : ""}${litSet && !litSet.has(n.id) ? " gnode--dim" : ""}`}
                    transform={`translate(${p.x} ${p.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.title}, ${label(n.kind)}`}
                    aria-pressed={n.id === selected}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(n.id)}
                    onBlur={() => setHover(null)}
                    onClick={() => setSelected(n.id)}
                    onDoubleClick={() => n.open && onGo?.(n.open)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (n.id === selected && n.open) onGo?.(n.open);
                        else setSelected(n.id);
                      }
                    }}
                  >
                    <circle r={r} />
                    {named ? (
                      <text className="gnode__label" y={r + 12 / view.k} fontSize={12 / view.k}>
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
              <div className="row">
                <Button size="sm" variant="primary" icon={<Check size={ICON_SM} />} onClick={() => void decide(node, true)}>
                  Keep as a fact
                </Button>
                <Button size="sm" variant="ghost" icon={<X size={ICON_SM} />} onClick={() => void decide(node, false)}>
                  Reject
                </Button>
              </div>
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
