# Harness, slice 7: pages the model draws

*A proposal, 18 October 2026, shown to Kenil in the chat (the file is the record). Kenil, after
a reply refused a line chart ("Alpha's pages have no chart view"): "i need support for custom
ui requests as well.. by default we give current structure, but we should not restrict these
custom ui elements". Q62 left custom views to a later trial; this is it. Of the three tiers
discussed (the window's eight table views made reachable; free-form pages as files; a catalogue
of Alpha's own components), Kenil chose the free-form pages, inside a module only, reading
data only, in Alpha's look.*

## What a page is

A file `modules/<id>/pages/<name>.html` the model writes: its own HTML, CSS and script,
drawing whatever the person asked (a line chart of daily intake, a dashboard, a summary). A
header at the top says its title and the data it needs:

```html
<!--alpha
title: Summary
front: true
data:
  days: SELECT date(eaten_at) AS day, SUM(calories) AS calories, SUM(protein) AS protein
        FROM rows_food_log GROUP BY day ORDER BY day
-->
```

Each entry under `data` is one SELECT on the same read-only views `world_query` reads; the page
gets the rows as `alpha.data.days`. A page cannot write, cannot reach the network and cannot
reach the app: a change to the data stays a sentence in the chat. A page that reads another
module's table is a crossing a kit warns about, as a skill's is.

## How it is made

A new hand, `page_keep(name, title, html, data)`: it checks the header, runs every query once
(a wrong SELECT fails in the turn, not on the screen), writes the file, journals "Made the
page Summary in Food", and the model says it in a line. Small changes ("make the fat line
dashed") go through Edit on the file, as a skill's do; the next sync checks the header again.
`module.yaml` lists the pages. One sentence in the turn prompt: a drawing the person asks for
(a chart, a dashboard, a summary) is a page; the hand's own instruction holds the format and
the variables. No rulebook.

## How it is shown

The core serves a page at its own address with the rows in it and a strict content policy (no
network, no scripts but the page's own). The window shows it in a sandboxed frame (scripts
allowed, nothing else) on the module page's new **Pages** tab; the page marked `front: true`
is what the module opens on (the "summary page"). The window hands the frame Alpha's colours
and fonts as the same CSS variables the app uses (`--text`, `--primary`, `--chart-3`,
`--font-ui`, …), light and dark, and the model is told to use them; inside that, the page draws
as it likes. When the module's data changes (the window's change poll), the frame gets the
fresh rows and the page redraws. A page that throws shows "This page did not draw" with the
error, never a blank.

Proven in the real app (WebKit), not the Chromium pane: the frame sandbox and the content
policy are proven first, in half a day, before the rest is built.

Limits, said plainly: no libraries from the web (there is no network), so the model draws
with SVG or canvas by hand, which Claude does well; a chart library vendored into Alpha comes
later if the drawings come out poor.

## Where it travels and dies

A kit carries `pages/` as it carries skills and agents (the hashes, Q53's ownership rule);
removing the module removes its directory and the pages with it; the journal keeps the lines.
The engine's write gate already allows the module's directory; nothing to open.

## What stays the same

Tables and their eight views, the module page's other tabs, the chat (no drawings inside
replies: Kenil, 18 Oct), the hands (18 with `page_keep`).

## Journey and acceptance

`page_drawn` on a fresh world: a food log with a week of rows, "make a summary page with a
line chart of daily calories and protein"; checks: the file exists with a valid header, the
served page answers with seven days of rows, the page is the module's front. The drawing is
accepted by eye: a screenshot of the app window, then Kenil's own run.

## Size

Three days: the WebKit proof half a day; the core (the hand, the header, serving, the sync,
kits, purge, tests, the journey) one and a half; the window (Pages tab, the frame, the
variables, refresh, the error box) one. Two commits as before.

## Questions

1. The eight views the window already has, made reachable (`saved_list` carrying the view
   kind, `date_by`, `measure`, `group_by`; half a day) in this slice too, or left out? I would
   include it: "a chart of X" should not need a page when a view does it.
2. Pages inside the module page only, no entry in the rail? I would keep them inside: less,
   not more.
