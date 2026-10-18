# 18 October 2026 — Harness slice 7: pages the model draws

*Proposal: [`../design/harness-slice-7-proposal.md`](../design/harness-slice-7-proposal.md), agreed
in the chat the same afternoon (Q82). Kenil, after a reply refused a line chart ("Alpha's pages
have no chart view"): "i need support for custom ui requests as well.. by default we give
current structure, but we should not restrict these custom ui elements". Of three tiers laid out
(the window's eight table views made reachable; free-form pages as files; a catalogue of Alpha's
own components) he chose the first two now and the catalogue held; pages inside a module only,
never in a reply; data read-only; Alpha's look as variables.*

## What was wrong

The window has had eight ways to show a table since the 12 Oct window (table, list, board,
gallery, calendar, timeline, chart, form), but the model could save a list only as a table or a
list: `saved_list` carried filters, search and columns, never the view, and the turn prompt
never named the kinds. So the refusal in Kenil's screenshot was honest about the model's hands
and wrong about Alpha. And nothing let the model draw what no view can show.

## Built

**The views, reachable.** `list_save` (and `world_shape`'s `saved_list`) take `view`,
`group_by`, `date_by` and `measure`; `views._check` refuses a kind it does not have, a board
without its group field, a calendar, timeline or chart without its date field; the journal line
names the kind ("Kept the list "Calories per day" (chart) on Food log"). The data page now
takes a saved chart's `measure` (the chart view ignored it before).

**Pages** (`world/pages.py`, new). A page is `modules/<id>/pages/<name>.html`, the model's own
HTML, CSS and script, with a header:

```html
<!--alpha
title: Summary
front: true
data:
  days: SELECT date(eaten_at) AS day, SUM(calories) AS calories FROM rows_food_log GROUP BY day
-->
```

- `check_header` takes title, front and data only; each data entry one SELECT (the same
  `READS` test as `world_query`); a wrong one is a Problem in words.
- `Pages.keep` builds the header, runs every query once on the read-only connection (as many
  rows as a view in the window shows, `views.most_rows`: the page draws them, the model never
  reads them), writes the file, journals "Made the page Summary in Food (days: 7 rows)", syncs
  the module (`module.yaml` lists `pages`). One front per module: marking one unmarks the other.
- `Pages.render` serves the page with Alpha's runtime first: the rows as `alpha.data`,
  `alpha.on("data"|"theme", fn)`, the theme's variables set on the root when the window posts
  them, every error of the page's own script posted out to the window.
- The routes (`api/tables.py`): the list, the rows (fresh), the front mark, removal, and the
  frame's load by a **one-use ticket** (`POST …/pages/{name}/ticket`, 60 s, `[pages]
  ticket_seconds` in `limits.toml`; `GET /api/pages/{ticket}` answers without the bearer token a
  frame cannot carry, to this Mac only). The page comes under its own content policy:
  `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:
  blob:; connect-src 'none'; frame-src 'none'; form-action 'none'`: its own script and style,
  nothing from the network, nothing out.
- The hand `page_keep(module, name, title, html, data, front)` (18 hands now); its docstring
  is the whole instruction: when a page and when a view, the data, `alpha.on`, the variables
  to use, no libraries from the web, a page never writes. One clause in `turn.md`'s hands line.
- Kits carry `pages/` (`KIT_DIRS`; install copies them, the update takes the untouched ones by
  hash as for skills and agents). Removing the module removes its directory and the pages with
  it (already so). The engine's write gate already allowed the directory.

**The window.** `modules/PageFrame.tsx`: a sandboxed frame (`sandbox="allow-scripts"`) loaded
by the ticket's URL; on the frame's "ready" the window posts the app's variables (`PAGE_VARS`,
read from the computed style) and the theme, again when the theme changes (a MutationObserver
on `data-theme` and the system's media query); on each change poll the fresh rows are posted,
no reload; a page's error shows "This page did not draw: …" above the frame; "Make it the
front" / "Not the front" and "Remove…" (confirmed). The module page gives each page a tab
labelled by its title, right after the first tab, and opens on the front page when the person
has not chosen a tab there; the module's own first tab is now called **Overview** (a page
called Summary beside a tab called Summary read as two of the same in the app). The app's own
content policy gains `frame-src http://127.0.0.1:*` (Tauri's and the dev page's).

## Ran for real

- Journey `page_drawn` on a fresh world, the real model, twice (`../journeys/2026-10-18-1642.md`
  57 s, `-1644.md` with `--keep`): a food log made, 14 rows logged in one turn, then "make a
  summary page for Food with a line chart of my daily calories and protein, one line each, and
  make it the page the module opens on" → `page_keep` once, 25 s: a header that runs (`daily`,
  7 rows), an SVG with two lines on two axes, the averages above, the front. The new check
  `page` (module, front, rows) and a judge passed.
- **In the real app (WebKit)**, the debug bundle started against the kept world: the Food module
  opened on the page, drawn in the frame in dark, and again in light after the theme switch in
  Settings (the variables arrived, the page redrew); screenshots
  `desktop/.check/2026-10-18-slice7-page-dark.jpg` and `-light.jpg`. The frame sandbox and the
  content policy work in WKWebView; this was the proof the proposal put first.
- 331 core tests (5 new in `test_pages.py`: the file and header, served with rows under the
  policy, the routes and the ticket, the hand and a chart list, a kit and removal), 222 desktop
  tests (3 new in `PageFrame.test.tsx`), lint and types clean.

## Left

- A page cannot carry a library: a chart library vendored into Alpha later if drawings come out
  poor (Claude drew the two-axis chart by hand without one).
- Pages are not versioned (no Versions/Undo), as agents' files are not yet.
- The catalogue tier (Alpha's own components, drawings inside a reply) is held, per Kenil.
- Kenil's own run in his app is the acceptance: "a chart of my calories per day" (a chart list)
  and a page the views cannot make. His app was restarted on this build (his earlier window was
  closed for the check; `just app-restart`).
