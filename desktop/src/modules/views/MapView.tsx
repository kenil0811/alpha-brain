/**
 * The Map view (Q44, design `map-view-plan.md`): a collection's records where they are, on a
 * quiet outline of the world drawn here, offline (Natural Earth's countries at 1:50m through
 * world-atlas, in the rulebook's greys). Nothing is fetched to draw it.
 *
 * - One dot per record with a place; dots close together on screen merge into a numbered circle,
 *   which a click zooms into. A place Apple's geocoder found is estimated and drawn hollow; one
 *   given with its point is filled.
 * - A click selects a record and shows its card (title, two fields, Open page); a double-click
 *   opens its page, as in the graph.
 * - Records with no place are counted on one line; Show them lists them in the Table.
 * - Zoom and move with the buttons in the bottom-right corner, the wheel, or by dragging; arrow
 *   keys walk from dot to dot (one tab stop), Enter opens.
 */
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { feature, mesh } from "topojson-client";
import countries from "world-atlas/countries-50m.json";
import { isPlace, type PlaceValue, type RecordRow } from "../../core/client";
import { Button, ZoomControls } from "../../ui";
import { showValue, type FieldInfo } from "../fields";
import { titleText } from "./engine";

const W = 1000;
const H = 520;
/** Dots nearer than this on screen merge into one circle. */
const MERGE_PX = 22;

const projection = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: "Sphere" });
const path = geoPath(projection);
// drawn once for the life of the window: the countries, and the borders between them
type Topo = Parameters<typeof mesh>[0];
const world = countries as unknown as Topo;
const shapes = world.objects.countries as Parameters<typeof mesh>[1];
const LAND = path(feature(world, "countries")) ?? "";
const BORDERS = path(mesh(world, shapes, (a, b) => a !== b)) ?? "";
const SPHERE = path({ type: "Sphere" }) ?? "";

type Dot = { row: RecordRow; place: PlaceValue; x: number; y: number };
type Cluster = { x: number; y: number; dots: Dot[] };

export function MapView({ rows, field, titleField, fields, onOpen, onShowRecords }: { rows: RecordRow[]; field: FieldInfo; titleField?: string; fields: FieldInfo[]; onOpen: (id: string) => void; onShowRecords: (ids: string[], label: string) => void }) {
  const dots = useMemo(() => {
    const out: Dot[] = [];
    for (const row of rows) {
      const place = row.values[field.name];
      if (!isPlace(place) || place.lat === undefined || place.lon === undefined) continue;
      const at = projection([place.lon, place.lat]);
      if (at) out.push({ row, place, x: at[0], y: at[1] });
    }
    return out.sort((a, b) => a.x - b.x || a.y - b.y);
  }, [rows, field.name]);
  const unplaced = rows.filter((r) => !dots.some((d) => d.row === r) && r.values[field.name] !== undefined && r.values[field.name] !== null);
  const without = rows.length - dots.length;

  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const unitsPerPixel = () => Math.max(W / (svg.current?.clientWidth || W), H / (svg.current?.clientHeight || H));

  const zoom = (by: number, about = { x: W / 2, y: H / 2 }) =>
    setView((v) => {
      const k = Math.min(40, Math.max(1, v.k * by));
      const f = k / v.k;
      return { k, x: about.x - (about.x - v.x) * f, y: about.y - (about.y - v.y) * f };
    });
  const move = (dx: number, dy: number) => setView((v) => ({ ...v, x: v.x + dx * 120, y: v.y + dy * 120 }));
  const fit = () => {
    if (!dots.length) return setView({ x: 0, y: 0, k: 1 });
    const xs = dots.map((d) => d.x);
    const ys = dots.map((d) => d.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(12, Math.max(1, 0.8 * Math.min(W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0))));
    setView({ k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k });
  };
  // the records first fill the view; after that it stays where the person put it
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && dots.length) {
      fitted.current = true;
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the first places arrive
  }, [dots.length]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      // zoom about the pointer: where it is in the drawing's own units
      const m = el.getScreenCTM?.();
      const at = m && el.createSVGPoint ? Object.assign(el.createSVGPoint(), { x: e.clientX, y: e.clientY }).matrixTransform(m.inverse()) : undefined;
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, at ? { x: at.x, y: at.y } : undefined);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const dragMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
    const u = unitsPerPixel();
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x) * u, y: d.vy + (e.clientY - d.y) * u }));
  };

  // dots close together on screen at this zoom merge (a grid as wide as MERGE_PX)
  const clusters = useMemo(() => {
    const cell = (MERGE_PX * unitsPerPixel()) / view.k;
    const bins = new Map<string, Dot[]>();
    for (const d of dots) {
      const key = `${Math.floor(d.x / cell)}:${Math.floor(d.y / cell)}`;
      bins.set(key, [...(bins.get(key) ?? []), d]);
    }
    return [...bins.values()].map((ds): Cluster => ({ x: ds.reduce((s, d) => s + d.x, 0) / ds.length, y: ds.reduce((s, d) => s + d.y, 0) / ds.length, dots: ds }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the drawing's scale is read as it is now
  }, [dots, view.k]);
  const [focus, setFocus] = useState(0);
  const tabAt = Math.min(focus, Math.max(0, clusters.length - 1));
  const chosen = dots.find((d) => d.row.id === selected);
  const r = (6 * unitsPerPixel()) / view.k; // a dot is 12px across at any zoom
  const shownFields = fields.filter((f) => f.name !== titleField && f.name !== field.name && f.kind !== "long_text").slice(0, 2);
  const name = (d: Dot) => titleText(d.row, titleField);

  const choose = (c: Cluster) => {
    if (c.dots.length === 1) return setSelected(c.dots[0].row.id);
    zoom(2.5, { x: view.x + c.x * view.k, y: view.y + c.y * view.k });
  };

  return (
    <div className="mapview">
      <div className="mapview__canvas">
        <svg
          ref={svg}
          className="mapview__svg"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Map of ${dots.length} ${dots.length === 1 ? "record" : "records"} by ${field.label ?? field.name}`}
          onPointerDown={down}
          onPointerMove={dragMove}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <path className="mapview__sea" d={SPHERE} />
            <path className="mapview__land" d={LAND} />
            <path className="mapview__borders" d={BORDERS} strokeWidth={0.6 / view.k} />
            {clusters.map((c, i) => {
              const one = c.dots.length === 1 ? c.dots[0] : null;
              const label = one ? `${name(one)}, ${one.place.label}${one.place.estimated ? " (estimated)" : ""}` : `${c.dots.length} records here; zoom in`;
              return (
                <g
                  key={c.dots.map((d) => d.row.id).join(",")}
                  className={`mapdot${one ? "" : " mapdot--many"}${one?.place.estimated ? " mapdot--estimated" : ""}${one && one.row.id === selected ? " mapdot--on" : ""}`}
                  transform={`translate(${c.x} ${c.y})`}
                  role="button"
                  aria-label={label}
                  tabIndex={i === tabAt ? 0 : -1}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => choose(c)}
                  onDoubleClick={() => one && onOpen(one.row.id)}
                  onKeyDown={(e) => {
                    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                    if (step) {
                      e.preventDefault();
                      const next = (i + step + clusters.length) % clusters.length;
                      setFocus(next);
                      (e.currentTarget.parentElement?.querySelectorAll<SVGGElement>(".mapdot")[next])?.focus();
                    } else if (e.key === "Enter") {
                      if (one && selected === one.row.id) onOpen(one.row.id);
                      else choose(c);
                    }
                  }}
                >
                  <title>{label}</title>
                  <circle r={one ? r : r * 1.6} strokeWidth={(2 * unitsPerPixel()) / view.k} />
                  {one ? null : (
                    <text className="mapdot__n" fontSize={(11 * unitsPerPixel()) / view.k} dy="0.35em">
                      {c.dots.length}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {chosen ? (
          <aside className="mapcard" aria-label={name(chosen)}>
            <strong className="mapcard__title">{name(chosen)}</strong>
            <span className="faint">
              {chosen.place.label}
              {chosen.place.estimated ? ` · estimated by ${chosen.place.source ?? "Apple Maps"}` : ""}
            </span>
            {shownFields.map((f) => {
              const v = showValue(chosen.row.values[f.name], f.kind, f.unit);
              return v ? (
                <span key={f.name}>
                  <span className="faint">{f.label ?? f.name}</span> {v}
                </span>
              ) : null;
            })}
            <div className="row">
              <Button size="sm" onClick={() => onOpen(chosen.row.id)}>
                Open page
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </aside>
        ) : null}
        <ZoomControls onZoom={(by) => zoom(by)} onMove={move} onFit={fit} />
      </div>
      {without ? (
        <p className="faint mapview__none">
          {without.toLocaleString()} {without === 1 ? "record has" : "records have"} no place
          {unplaced.length ? `; ${unplaced.length.toLocaleString()} of them couldn't be found` : ""}.{" "}
          <Button size="sm" variant="ghost" onClick={() => onShowRecords(rows.filter((r) => !dots.some((d) => d.row === r)).map((r) => r.id), `No ${field.label ?? field.name}`)}>
            Show them
          </Button>
        </p>
      ) : null}
    </div>
  );
}
