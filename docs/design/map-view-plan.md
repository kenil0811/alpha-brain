# The Map view: places on a map (plan, 12 Oct 2026, not built)

The owner, 12 Oct: a **map** is places on the world; a **graph** is things and their links. Both
have small zoom and move buttons in the bottom-right corner. This plan is about the map. No code
is written until the owner answers the questions at the end. The core needs are G13 in
`core-changes-for-the-window.md`.

## What exists today

- **Collections have no place field.** The field kinds are text, long text, number, date,
  datetime, yes/no, choice, multichoice, status, url, relation and file
  (`core/alpha/world/collections.py`, `FIELD_KINDS`). A city or address is kept as text today.
- **Entities have a `place` kind**, but nothing makes one, and it has no coordinates
  (`core/alpha/world/entities.py`).
- **The window has no map.** `ui/ZoomControls` (zoom in, zoom out, fit, four moves) already
  serves the graph, and the map can use it as it is.
- **The audited world has no place data.** Kenil's real world does: deal sites, job boards and the
  car wash research all name cities and addresses as text.

## 1. Data: a `place` field kind (core, G13)

- **A value** is `{label, lat, lon, precision, source}`:
  - `label` is what the person or the page said ("Austin, TX", "12 Main St");
  - `precision` is one of `address`, `city`, `region` or `country`;
  - `source` is where the coordinates came from.
- **Coordinates come from Alpha**, by geocoding the text with a stated source (the rule "every
  value with its provenance"). A geocoded point is **estimated** and shows the Estimated chip. A
  point the person drops or corrects is **known**.
- **A text field Alpha recognises as places** (city, address, location) can be turned into a
  place field. The text is kept as the label. This is a proposal the person approves, never
  silent.
- **Geocoding needs a service.** There are three candidates, and the choice is question Q2:

| | What it is | Privacy | Cost / limits | Fit |
|---|---|---|---|---|
| **Nominatim** (OpenStreetMap) | free web geocoder | sees each address looked up | 1 request a second, must name the app; fine for a person's own world, not for bulk | simplest; core-only |
| **Apple's geocoder** (CoreLocation, on the Mac) | the Mac's own | goes to Apple, like Maps | free, rate-limited per device | best quality on a Mac; needs a Tauri plugin (`src-tauri`, owner's permission) |
| **Offline gazetteer** (GeoNames cities, about 25 MB) | a table of the world's towns | nothing leaves the Mac | none | cities only, no street addresses |

**Recommendation:** use the offline gazetteer for cities first, because most rows name a city and
nothing leaves the Mac. Use Nominatim only for street addresses the person asks to place, one at
a time, with its source recorded. Apple's geocoder can come later, if the title-bar work opens
`src-tauri` anyway.

## 2. Tiles: what the map is drawn on

| Option | What it looks like | Network and privacy | Weight | Licence and terms |
|---|---|---|---|---|
| **A. Country and coast outlines** (d3-geo plus the world-atlas TopoJSON, 1:50m) | a clean, quiet world map in our own colours; no streets | none: fully offline | about 0.8 MB of data and 2 small libraries | public domain (Natural Earth) |
| B. OpenStreetMap raster tiles | the familiar street map | every view goes to OSM's servers | none | OSM's tile policy forbids app-scale use without your own server |
| C. MapLibre plus a hosted vector service (MapTiler, Stadia) | streets at every zoom, styled | every view goes to the vendor; needs a key | about 800 KB library | paid past a free tier |
| D. MapLibre plus offline PMTiles (Protomaps) | streets, offline | none | a world file at city zoom is hundreds of MB to a few GB (to be measured) | ODbL attribution |

**Recommendation: A now, D later if streets are asked for.**
- A matches "your workspace lives on this Mac", and it draws in the rulebook's palette (the accent
  plus greys, faint grid).
- A is SVG like the graph, so the same zoom, pan, keyboard and ZoomControls work unchanged.
- A shows "where in the world" well, which is what deals, job boards and clients need.
- D is the path to streets with nothing sent out, at the cost of a large download, offered once
  in Settings.

New window dependencies under A: `d3-geo`, `topojson-client` and `world-atlas` (the window already
uses d3-force).

## 3. Where the Map shows

- **A view type in the data view.** It is listed in the View dropdown beside Table and Board, like
  Graph, and offered when the collection has a place field. Otherwise it is disabled with the
  reason "Map needs a place field. Ask Alpha in the panel to add one."
  - It shows the same rows as the Table: the list's filters, the search and Hide done all apply.
  - Each record is a dot. Dots close together merge into a numbered circle that splits as you zoom.
  - An estimated place is a hollow dot, and a known place is a filled dot.
  - Hovering a dot shows its name. A click selects it and shows a small card (title, two key
    fields, **Open page**). A double-click opens the page, as in the graph.
  - Records without a place are counted in one faint line ("4 records have no place"). A click on
    the line shows them in the Table.
  - Zoom, fit and move buttons sit bottom right (`ui/ZoomControls`). The wheel and dragging work,
    and arrow keys walk from dot to dot.
  - Dashboard: a "Where" tile with the same map, small and clickable.
- **Network:** people and organisations with a place, on the same Map view of the Network table.
- **Not in Second Brain.** The graph stays the graph. A place entity is a node there and opens its
  page, which shows a small map.

## 4. Build order (after the answers)

1. **Core:**
   - the `place` field kind and value;
   - geocoding with provenance (the chosen service), with the gazetteer loaded into the world's
     directory;
   - Alpha's proposal to convert a text field;
   - the API returns place values. This is G13.
2. **Window:**
   - `modules/views/MapView.tsx` with option A, clustering, the side card and the count line;
   - Map in the View dropdown, using the `views` list built for Graph;
   - the Dashboard "Where" tile.
3. **Checks:**
   - unit tests for projection, clustering and the place value;
   - `just check-layout` with a world that has places;
   - a journey: "put my deals on a map" turns the city text into places and shows the map.

## The owner's answers (12 Oct)

1. **Tiles:** outlines now, streets later (option A, then D).
2. **Geocoding:** Apple's geocoder (CoreLocation), through a Tauri plugin. This needs a change
   under `desktop/src-tauri/`, which the owner accepts by choosing it; the core asks the host for
   coordinates and records "Apple Maps" as the source.
3. **Converting text:** Alpha proposes it when it sees a city or address field. The person
   approves; it is never silent.
4. **Where it shows:** the data view's Map type only (not Network, the Dashboard or Home, for now).

So the build is:
- core G13 (the `place` kind, geocoding through the host, the proposal);
- the Tauri geocoding plugin;
- `MapView` as a view type.
The window part waits on the first two.

## The questions as asked

1. **Tiles:** is a quiet outline map with no streets (A) right for now, with an offline street
   download (D) later? Or are streets needed from the start, and if so, may the map call an
   outside service (B or C)?
2. **Geocoding:** may addresses be looked up online (Nominatim, one at a time, recorded)? Or
   should it be offline cities only until you say otherwise?
3. **Converting text:** should Alpha propose turning a city or address text field into a place
   field when it sees one, or only when asked?
4. **Where it shows:** is the data view, Network and a Dashboard tile enough, or should Home also
   have a map card (for example, today's events by place)?
