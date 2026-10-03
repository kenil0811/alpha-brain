/**
 * The map: rows pinned where their place field says. Drawn offline from world-atlas (Bridge's
 * basemap), so nothing about the person's rows leaves the Mac: a place written as coordinates
 * ("38.72, -9.14", or "Lisbon | 38.72, -9.14") pins exactly; a country name ("Portugal",
 * "Lisbon, Portugal") pins on the country. Anything else is counted, not guessed.
 */
import { useMemo, useState } from "react";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import countries from "world-atlas/countries-110m.json";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../ui/DropdownMenu";
import { parseLocationValue, type DataRow } from "../engine";
import { fieldLabel } from "../cells";
import { isPlaceField } from "../eligibility";
import { titleOf } from "./CardViews";
import type { ViewProps } from "../types";

const W = 960;
const TOP = 84;
const BOTTOM = -58;
const H = Math.round((W * (TOP - BOTTOM)) / 360);
/** Pins closer than this (map units; the biggest pin is 32 across) are drawn as one. */
const NEAR = 28;
const px = (lng: number) => ((lng + 180) / 360) * W;
const py = (lat: number) => ((TOP - lat) / (TOP - BOTTOM)) * H;

const ALIASES: Record<string, string> = {
  usa: "united states of america",
  us: "united states of america",
  "united states": "united states of america",
  america: "united states of america",
  uk: "united kingdom",
  england: "united kingdom",
  scotland: "united kingdom",
  wales: "united kingdom",
  "great britain": "united kingdom",
  uae: "united arab emirates",
  "czech republic": "czechia",
  "south korea": "south korea",
  korea: "south korea",
  "ivory coast": "côte d'ivoire",
  holland: "netherlands",
  "the netherlands": "netherlands",
  drc: "dem. rep. congo",
};

interface Country {
  name: string;
  d: string;
  at: [number, number];
}

let atlas: Country[] | null = null;
let atlasByName: Map<string, Country> | null = null;
/** Country outlines as SVG paths and a point to pin each one on, worked out once. */
function world(): Country[] {
  if (atlas) return atlas;
  const topo = countries as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const fc = feature(topo, topo.objects.countries) as unknown as { features: Feature<Polygon | MultiPolygon, { name: string }>[] };
  atlas = fc.features.map((f) => {
    const polys: Position[][][] = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let d = "";
    let biggest: Position[] = [];
    for (const poly of polys) {
      for (const ring of poly) {
        let prev: number | null = null;
        ring.forEach(([lng, lat], i) => {
          const x = px(lng!);
          // A ring crossing the date line starts again on the other side rather than
          // drawing a line across the whole map.
          d += `${i === 0 || (prev !== null && Math.abs(x - prev) > W / 2) ? "M" : "L"}${x.toFixed(1)},${py(lat!).toFixed(1)}`;
          prev = x;
        });
        d += "Z";
      }
      if (poly[0] && poly[0].length > biggest.length) biggest = poly[0];
    }
    const lng = biggest.reduce((s, p) => s + p[0]!, 0) / (biggest.length || 1);
    const lat = biggest.reduce((s, p) => s + p[1]!, 0) / (biggest.length || 1);
    return { name: f.properties.name, d, at: [px(lng), py(lat)] as [number, number] };
  });
  atlasByName = new Map(atlas.map((c) => [c.name.toLowerCase(), c]));
  return atlas;
}

export function placeOf(value: unknown): { label: string; at: [number, number] } | null {
  const parsed = parseLocationValue(value);
  if (!parsed) return null;
  if (parsed.coordinate) return { label: parsed.label, at: [px(parsed.coordinate.longitude), py(parsed.coordinate.latitude)] };
  world();
  const byName = atlasByName!;
  const parts = parsed.label.split(",").map((s) => s.trim().toLowerCase());
  for (const part of [parts[parts.length - 1]!, parsed.label.toLowerCase()]) {
    const hit = byName.get(ALIASES[part] ?? part);
    if (hit) return { label: hit.name, at: hit.at };
  }
  return null;
}

export function MapView(p: ViewProps) {
  const places = p.allFields.filter(isPlaceField);
  const field = places.find((f) => f.name === p.view.locationBy) ?? places[0];
  const [picked, setPicked] = useState<string | null>(null);
  const { pins, unplaced } = useMemo(() => {
    const groups = new Map<string, { label: string; at: [number, number]; rows: DataRow[] }>();
    let missing = 0;
    for (const row of p.rows) {
      const place = field ? placeOf(row[field.name]) : null;
      if (!place) {
        missing += 1;
        continue;
      }
      const key = `${Math.round(place.at[0])}:${Math.round(place.at[1])}`;
      const g = groups.get(key) ?? { label: place.label, at: place.at, rows: [] };
      g.rows.push(row);
      groups.set(key, g);
    }
    // Pins that would overlap become one, named after the biggest.
    const merged: [string, { label: string; at: [number, number]; rows: DataRow[] }][] = [];
    for (const [key, g] of [...groups.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length)) {
      const near = merged.find(([, m]) => Math.hypot(m.at[0] - g.at[0], m.at[1] - g.at[1]) < NEAR);
      if (!near) merged.push([key, { ...g, rows: [...g.rows] }]);
      else {
        near[1].rows.push(...g.rows);
        if (!near[1].label.endsWith(" and nearby")) near[1].label += " and nearby";
      }
    }
    return { pins: merged, unplaced: missing };
  }, [p.rows, field]);
  const chosen = pins.find(([k]) => k === picked)?.[1];
  const most = Math.max(1, ...pins.map(([, g]) => g.rows.length));
  return (
    <div className="dv-map">
      <div className="dv-viewbar">
        <span className="dv-faint">{pins.reduce((s, [, g]) => s + g.rows.length, 0).toLocaleString()} placed</span>
        {unplaced ? <span className="dv-faint">· {unplaced.toLocaleString()} without a place the map knows</span> : null}
        <span className="dv-spacer" />
        {places.length > 1 && field ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="dv-select">
                {fieldLabel(field)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {places.map((f) => (
                <DropdownMenuItem key={f.name} onSelect={() => p.onViewChange({ ...p.view, locationBy: f.name })}>
                  {fieldLabel(f)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div className="dv-map__body">
        <svg viewBox={`0 0 ${W} ${H}`} className="dv-map__svg" role="img" aria-label="Map">
          {world().map((c) => (
            <path key={c.name} d={c.d} className="dv-map__land">
              <title>{c.name}</title>
            </path>
          ))}
          {pins.map(([key, g]) => (
            <g key={key} className={`dv-map__pin${picked === key ? " dv-map__pin--on" : ""}`} role="button" tabIndex={0} aria-label={`${g.label}: ${g.rows.length}`} onClick={() => setPicked(key === picked ? null : key)} onKeyDown={(e) => e.key === "Enter" && setPicked(key)}>
              <circle cx={g.at[0]} cy={g.at[1]} r={6 + 10 * Math.sqrt(g.rows.length / most)} />
              {g.rows.length > 1 ? (
                <text x={g.at[0]} y={g.at[1] + 4} textAnchor="middle">
                  {g.rows.length}
                </text>
              ) : null}
              <title>{`${g.label}: ${g.rows.length}`}</title>
            </g>
          ))}
        </svg>
        {chosen ? (
          <aside className="dv-map__list" aria-label={chosen.label}>
            <b>{chosen.label}</b>
            {chosen.rows.slice(0, 50).map((row) => (
              <button key={row.id} type="button" className="dv-linkrow dv-ellipsis" onClick={() => p.onOpen(row.id)}>
                {titleOf(row, p.titleField)}
              </button>
            ))}
            {chosen.rows.length > 50 ? <span className="dv-faint">+{chosen.rows.length - 50} more</span> : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
