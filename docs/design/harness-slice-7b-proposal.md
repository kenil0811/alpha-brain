# Harness, slice 7b: clean pages

*A proposal, 18 October 2026, shown to Kenil in the chat (the file is the record) and agreed
the same evening (Q83). After the first page the model drew in his app: "this is the chart it
created, it's not clean, and it also create a new summary page. why.. we need alpha to have
clean professional ui. We need to set some guidelines on how alpha/the model will set these
things up".*

## Why it looked like that

- **The frame clipped the page.** The window gave a page a fixed height, so the bottom axis
  labels were cut off (a bug of slice 7).
- **The model drew by hand and never looked.** Its reply said so: "I haven't looked at the
  rendered page". Free-hand SVG every time is a different chart every time.
- **It made a new page because it had nowhere else to put the chart.** "The summary page"
  meant the module's own first tab; the model cannot write on it, so it made a page and called
  it Summary.

## The guidelines, built into the mechanism rather than a rulebook

1. **One module page, blocks not tabs.** The module's Overview is the page (`pages/overview.html`,
   the front by itself). "Add a chart to the summary page" adds a block to it. A separate tab
   only when the person asks for a separate page or dashboard.
2. **A page kit Alpha ships, so the look is Alpha's.** Inside the frame's runtime, a small
   library of Alpha's own blocks: stat, card, line chart, bar chart, table, text, grid, drawn by
   our code in the app's variables with the axis, legend, spacing and clipping rules decided
   once. The model composes with them (`alpha.ui.page(function (d) { return [ …blocks ]; })`)
   and draws by hand only for what the kit lacks.
3. **Alpha looks before it says done.** After a page is made or changed, the core renders it
   headless (Alpha's own Chromium, the app's variables, no network) and asks one small
   judgement with eyes against the six lines; a page that is not clean is fixed in the same
   turn; the journal keeps the verdict.
4. **Six design lines in the hand's instruction, not sixty.** One block per thing. Titles in
   the person's words, numbers with units. Nothing decorative. A target is one thin labelled
   line. One period per chart, the latest on the right. Never a fixed colour or font.
5. **The frame grows with its page**, and a page redraws without flicker when the data changes.

## Size

About two days: the kit a day, the look half a day, the overview blocks and the frame half a
day. A journey `page_clean` on a fresh world where the check is Alpha's own look at the
rendered image, not the HTML.

## Questions (answered: yes to all)

1. Blocks on the Overview by default, tabs only on request.
2. The kit: stat, card, line, bar, table, grid to start, more as asked.
3. The look costs one small vision judgement per page change.
