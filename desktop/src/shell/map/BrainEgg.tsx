/**
 * The Second Brain drawn as a graph inside an egg (`egg.ts` lays it out). It reads every
 * collection's records itself (`client.table`), so each record is a dot around its collection.
 * Hovering or focusing a node lights it, its links and its neighbours and writes its name; a
 * click opens it: a project, a record, a person, an agent or a skill goes to its page, a fact,
 * a goal or the person is shown beside the egg (`onSelect`). The wheel, a pinch or the + and −
 * buttons zoom; deeper layers get their names as it zooms in (`LABEL_AT`), and a big
 * collection's records past its sample appear. A drag on the background pans, a double-click
 * puts it back; all of it inside the shell.
 *
 * The keyboard (9 Oct, the owner): Tab enters the egg on one node (the person first); the arrow
 * keys move to the neighbouring node that way (`stepToward`), zooming in when it is a record not
 * drawn yet; Enter opens it; its name is announced. On a touchscreen two fingers pinch to zoom.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Client } from "../../core/client";
import { AgentAvatar } from "../AgentAvatar";
import type { Surface } from "../Rail";
import { Button, IconButton } from "../../ui";
import { EGG, EGG_PATH, LABEL_AT, layEgg, RECORDS_ALL_AT, stepToward, type Arrow, type Brain, type BrainKind, type BrainNode, type Placed, type TableRecords, withRecords } from "./egg";

const KIND_WORD: Record<BrainKind, string> = { you: "you", module: "project", collection: "collection", record: "record", agent: "agent", skill: "skill", person: "person", organisation: "organisation", goal: "goal", fact: "fact" };
const LEGEND: { kind: BrainKind; label: string }[] = [
  { kind: "module", label: "Projects" },
  { kind: "collection", label: "Collections" },
  { kind: "record", label: "Records" },
  { kind: "fact", label: "Facts" },
  { kind: "person", label: "People" },
  { kind: "organisation", label: "Organisations" },
  { kind: "goal", label: "Goals" },
  { kind: "agent", label: "Agents" },
  { kind: "skill", label: "Skills" },
];
const MAX_ZOOM = 16;

const short = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function BrainEgg({ client, brain: given, selected, onGo, onSelect }: { client: Client; brain: Brain; selected: string | null; onGo?: (s: Surface) => void; onSelect: (id: string) => void }) {
  const clip = `egg-${useId().replace(/:/g, "")}`;
  const svg = useRef<SVGSVGElement | null>(null);
  // Every collection's records, read once per set of collections; one that fails is left out.
  const names = given.nodes.filter((n) => n.kind === "collection" && n.id.startsWith("table:")).map((n) => n.id.slice("table:".length)).join("\n");
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
  }, [client, names]);
  const brain = useMemo(() => (tables.length ? withRecords(given, tables) : given), [given, tables]);
  const placed = useRef<Placed>({});
  const at = useMemo(() => (placed.current = layEgg(brain, placed.current)), [brain]);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [per, setPer] = useState(1); // drawing units per screen pixel, so labels keep their size
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width) setPer(Math.max(EGG.width / rect.width, EGG.height / rect.height));
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const panned = useRef(false);
  // Touch: every finger down, and a pinch's start (the fingers' distance, the view, their middle).
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; view: typeof view; p: { x: number; y: number } } | null>(null);
  // The keyboard's place in the egg: the one node Tab reaches; the arrows move it.
  const [cursor, setCursor] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const moved = useRef(false);

  const neighbours = useMemo(() => {
    const out = new Map<string, Set<string>>();
    for (const e of brain.edges) {
      (out.get(e.from) ?? out.set(e.from, new Set()).get(e.from)!).add(e.to);
      (out.get(e.to) ?? out.set(e.to, new Set()).get(e.to)!).add(e.from);
    }
    return out;
  }, [brain]);
  const focus = hover ?? selected;
  const lit = focus ? new Set([focus, ...(neighbours.get(focus) ?? [])]) : null;
  const shows = (id: string) => (at[id]?.zoom ?? 1) <= view.k;
  const current = cursor && shows(cursor) && brain.nodes.some((n) => n.id === cursor) ? cursor : (brain.nodes.find((n) => n.kind === "you") ?? brain.nodes[0])?.id;
  useEffect(() => {
    if (!moved.current || !current) return;
    moved.current = false;
    [...(svg.current?.querySelectorAll<SVGGElement>("[data-node]") ?? [])].find((g) => g.dataset.node === current)?.focus();
  });

  /** A point on screen in the drawing's units. */
  const units = (clientX: number, clientY: number) => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect || !rect.width) return { x: EGG.width / 2, y: EGG.height / 2, per: 1 };
    const per = Math.max(EGG.width / rect.width, EGG.height / rect.height); // the viewBox meets the box
    return { x: EGG.width / 2 + (clientX - rect.left - rect.width / 2) * per, y: EGG.height / 2 + (clientY - rect.top - rect.height / 2) * per, per };
  };
  /** Zoom by `factor` around point `p` (the drawing's units; its middle by default). */
  const zoomBy = (factor: number, p: { x: number; y: number } = { x: EGG.width / 2, y: EGG.height / 2 }) =>
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(1, v.k * factor));
      return k === 1 ? { x: 0, y: 0, k } : { k, x: p.x - ((p.x - v.x) * k) / v.k, y: p.y - ((p.y - v.y) * k) / v.k };
    });
  // The wheel zooms around the pointer (a native listener, so the page does not scroll too).
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = units(e.clientX, e.clientY);
      zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p); // a trackpad pinch comes as a ctrl-wheel
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  /** An arrow on node `n`: to the neighbour that way, shown (zoomed to, centred) if it is not yet. */
  const step = (n: BrainNode, key: Arrow) => {
    const next = stepToward(n.id, [...(neighbours.get(n.id) ?? [])], brain.nodes.map((m) => m.id), at, key);
    const node = next ? brain.nodes.find((m) => m.id === next) : undefined;
    if (!next || !node) return;
    const p = at[next];
    if (!shows(next) && p) {
      const k = Math.min(MAX_ZOOM, Math.max(view.k, p.zoom ?? 1));
      setView({ k, x: EGG.width / 2 - p.x * k, y: EGG.height / 2 - p.y * k });
    }
    moved.current = true;
    setCursor(next);
    setSaid(`${node.title}, ${node.detail ?? KIND_WORD[node.kind]}`);
  };
  const open = (node: BrainNode) => {
    if (panned.current) return;
    if (node.open && onGo) onGo(node.open);
    else onSelect(node.id);
  };
  const lift = (id: number) => {
    fingers.current.delete(id);
    if (fingers.current.size < 2) pinch.current = null;
    if (!fingers.current.size) pan.current = null;
  };
  const counts = new Map<BrainKind, number>();
  for (const n of brain.nodes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const labelScale = per / view.k;

  return (
    <div className="brain__egg">
      <svg
        ref={svg}
        className="brain__svg"
        viewBox={`0 0 ${EGG.width} ${EGG.height}`}
        role="group"
        aria-label={`${brain.nodes.length} things and ${brain.edges.length} links`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (fingers.current.size === 2) {
            const [a, b] = [...fingers.current.values()];
            pan.current = null;
            panned.current = true; // a pinch opens nothing
            pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, view, p: units((a.x + b.x) / 2, (a.y + b.y) / 2) };
            return;
          }
          panned.current = false;
          pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const z = pinch.current;
          if (z && fingers.current.size >= 2) {
            const [a, b] = [...fingers.current.values()];
            const k = Math.min(MAX_ZOOM, Math.max(1, (z.view.k * Math.hypot(a.x - b.x, a.y - b.y)) / z.dist));
            setView(k === 1 ? { x: 0, y: 0, k } : { k, x: z.p.x - ((z.p.x - z.view.x) * k) / z.view.k, y: z.p.y - ((z.p.y - z.view.y) * k) / z.view.k });
            return;
          }
          const d = pan.current;
          if (!d || view.k === 1) return;
          if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
          d.moved = panned.current = true;
          const per = units(0, 0).per;
          setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x) * per, y: d.vy + (e.clientY - d.y) * per }));
        }}
        onPointerUp={(e) => lift(e.pointerId)}
        onPointerCancel={(e) => lift(e.pointerId)}
        onPointerLeave={(e) => lift(e.pointerId)}
        onDoubleClick={(e) => e.target === e.currentTarget || (e.target as Element).classList.contains("brain__shell") ? setView({ x: 0, y: 0, k: 1 }) : undefined}
      >
        <defs>
          <clipPath id={clip}>
            <path d={EGG_PATH} />
          </clipPath>
        </defs>
        <path className="brain__shell" d={EGG_PATH} />
        <g clipPath={`url(#${clip})`}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <g className="brain__edges">
              {brain.edges.map((e) => {
                const a = at[e.from];
                const b = at[e.to];
                if (!a || !b || !shows(e.from) || !shows(e.to)) return null;
                const on = lit ? lit.has(e.from) && lit.has(e.to) && (e.from === focus || e.to === focus) : false;
                return <line key={`${e.from}|${e.to}`} className={`brain__edge${e.spoke ? " brain__edge--spoke" : ""}${e.waiting ? " brain__edge--waiting" : ""}${lit ? (on ? " brain__edge--lit" : " brain__edge--dim") : ""}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
              })}
            </g>
            {brain.nodes.map((n) => {
              const p = at[n.id];
              if (!p || !shows(n.id)) return null;
              const dim = lit ? !lit.has(n.id) : false;
              // Its layer's zoom names it; hover names it and, but for records, its neighbours.
              const more = p.more && view.k < RECORDS_ALL_AT ? p.more : 0;
              const labelled = view.k >= LABEL_AT[n.kind] || n.id === focus || more > 0 || (n.kind !== "record" && (lit?.has(n.id) ?? false));
              return (
                <g
                  key={n.id}
                  className={`brain__node brain__node--${n.kind}${n.waiting ? " brain__node--waiting" : ""}${dim ? " brain__node--dim" : ""}${selected === n.id ? " brain__node--on" : ""}`}
                  transform={`translate(${p.x} ${p.y})`}
                  role="button"
                  data-node={n.id}
                  tabIndex={n.id === current ? 0 : -1}
                  aria-label={`${n.title}, ${n.detail ?? KIND_WORD[n.kind]}`}
                  onClick={() => open(n)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
                      e.preventDefault();
                      step(n, e.key);
                    } else if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      panned.current = false;
                      open(n);
                    }
                  }}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                  onFocus={() => {
                    setHover(n.id);
                    setCursor(n.id);
                  }}
                  onBlur={() => setHover((h) => (h === n.id ? null : h))}
                >
                  <circle r={p.r} />
                  {n.kind === "agent" && n.agent ? (
                    <foreignObject x={-p.r} y={-p.r} width={p.r * 2} height={p.r * 2}>
                      <AgentAvatar client={client} agent={n.agent} size={p.r * 2} label={n.title} />
                    </foreignObject>
                  ) : null}
                  {labelled ? (
                    <g transform={`translate(0 ${p.r + 2}) scale(${labelScale})`}>
                      <text className="brain__label" y={11} textAnchor="middle">
                        {short(n.title)}
                      </text>
                      {more ? (
                        <text className="brain__label brain__label--more" y={24} textAnchor="middle">
                          +{more.toLocaleString()} more — zoom in
                        </text>
                      ) : null}
                    </g>
                  ) : null}
                  <title>{n.detail ? `${n.detail}: ${n.title}` : n.title}</title>
                </g>
              );
            })}
          </g>
        </g>
        <path className="brain__rim" d={EGG_PATH} />
      </svg>
      <div className="sr-only" role="status" aria-live="polite">
        {said}
      </div>
      <div className="brain__zoom">
        <IconButton size="sm" label="Zoom in" icon={<span aria-hidden="true">+</span>} onClick={() => zoomBy(1.5)} disabledReason={view.k >= MAX_ZOOM ? "As close as it goes" : undefined} />
        <IconButton size="sm" label="Zoom out" icon={<span aria-hidden="true">−</span>} onClick={() => zoomBy(1 / 1.5)} disabledReason={view.k <= 1 ? "The whole egg is in view" : undefined} />
        <Button size="sm" onClick={() => setView({ x: 0, y: 0, k: 1 })} disabled={view.k === 1}>
          Fit
        </Button>
      </div>
      <div className="brain__legend" aria-hidden="true">
        {LEGEND.filter((l) => counts.get(l.kind)).map((l) => (
          <span key={l.kind} className="brain__key">
            <i className={`brain__dot brain__dot--${l.kind}`} />
            {l.label} <span className="faint">{counts.get(l.kind)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
