# 18 October 2026 — Harness slice 7b: clean pages

*Proposal: [`../design/harness-slice-7b-proposal.md`](../design/harness-slice-7b-proposal.md),
agreed in the chat the same evening (Q83). Kenil, on the first page the model drew in his app:
"it's not clean, and it also create a new summary page. why.. we need alpha to have clean
professional ui. We need to set some guidelines on how alpha/the model will set these things
up".*

## What was wrong, in three parts

1. The window gave a page's frame a fixed height, so the bottom axis labels were cut off (a bug
   of slice 7, the window's half).
2. The model drew the SVG by hand and never looked at the result (its own reply: "I haven't
   looked at the rendered page"): target lines on the wrong axis, a legend placed by chance.
3. "The summary page" meant the module's own first tab; the model could not write on it, so it
   made a second page called Summary beside a tab called Summary.

## Built

**The page kit** (`core/alpha/world/pagekit/kit.js`, `kit.css`, about 300 lines, served inline
in every page's runtime). Blocks drawn by Alpha's code in the app's variables: `stat`/`stats`
(value, unit, "of" with a thin bar), `chart` (line or bar; several series; a right axis; "nice"
ticks; date labels thinned to fit; a target as one thin dashed labelled line that moves below
the line when near the top; points with their values on hover; margins from the tick widths so
nothing clips), `table` (numbers right-aligned, dates as "12 Oct"), `card`, `text`, `grid`.
`alpha.ui.page(function (d) { return [ …blocks ]; })` renders and re-renders on fresh data, a
theme change and a width change (ResizeObserver), without flicker.

**The overview rule** (`world/pages.py` `OVERVIEW`): a page named `overview` is the module's
own page and the front by itself; the hand's instruction says "add a chart to the summary page"
means that page again (Read it, keep its blocks, add one), and a page of another name only
when the person asks for a separate page or dashboard.

**The look before done** (`runtime/look.py`, new; `connectors/browser/scripts/page_shot.mjs`,
new). After `page_keep` writes, the core renders the page in Alpha's own Chromium (headless,
every request but the page refused, the app's light variables applied, 900 px wide), keeps
the image at `pages/.looks/<name>.png` inside the module's directory (where the model may Read
it), and asks one small judgement with eyes: a `look` kind of run (Read allowed, nothing else;
`models.toml` `look = "haiku"`; `prompts/page_look.md`, six rules, strict on clipping and on a
flattened scale). The hand returns `look: {clean, words, image}` and, when not clean,
`fix_first` naming what is wrong; the journal keeps "Alpha looked at the page overview:
clean." (kind `checked`). A page whose own script fails is not clean without asking anyone; no
browser installed means no look, said as a `failed` line, never a page declared bad.

**Six design lines** in `page_keep`'s instruction (one block per thing; titles in the person's
words and numbers with units; nothing decorative; a target is one thin labelled line; one
period per chart, the latest on the right; never a fixed colour or font), with the kit's
blocks by example. `judge.ask` takes a kind and a system prompt for the look; the engine lets a
run read when its kind allows it.

**The window.** The front page is shown on the Overview tab above Alpha's own cards, not as a
tab; the other pages are tabs; the frame follows the page's own height (the runtime posts it
on load and on every resize), so nothing is cut off; the buttons read "Make it a tab" / "Show
it on Overview".

## Ran for real

- A kit page rendered headless with three stats, a two-axis line chart with a target, a bar
  chart and a table: whole labels, the latest day at the right, the target label clear of the
  lines once moved below (the first render had it across the protein line, fixed).
- Journey `page_clean` on a fresh world, the real model (`../journeys/2026-10-18-1717.md`, 68 s):
  "add a line chart of my daily calories and protein to the summary page, one line each" →
  the model read nothing extra, called `page_keep` once with `name: overview`, the kit's line
  chart with the right axis for protein, 7 days; **one page, the front**; Alpha's look said
  clean (9.6 s) and the model's answer said "I checked that it draws cleanly". The run was
  marked failed by the `page` check's own bug (it looked for an SVG tag in the HTML, which the
  kit draws from script); fixed, and the rerun passed (``../journeys/2026-10-18-1719.md`, 68 s, every check green`).
- 335 core tests (3 new in `test_look.py`, 2 in `test_pages.py`), 222 desktop tests, lint and
  types clean. The app rebuilt and Kenil's app restarted on it; his window was minimized at the
  time, so the Overview placement was not seen in WebKit by me: his open is the look.

## Left

- The look judges the light theme only; a dark look when a page draws colours by hand.
- Pages and agents' files still have no Versions/Undo.
- More kit blocks as asked (a pie, a heat map, a progress ring); the hand-drawn path stays for
  the rest.
