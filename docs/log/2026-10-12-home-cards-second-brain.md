# Home as cards, Second Brain as one graph and one table, a page for every kept thing (12 Oct 2026, Q45)

Branch `feat/ui-audit-fixes` (worktree `alpha-brain-audit-fixes`), commits db2e496 to 3afb5e2,
not yet pushed to `feat/ui-rulebook` (PR #5). Window only: nothing under `core/`, `connectors/`,
`journeys/` or `desktop/src-tauri/` changed; what needs the core is
`design/core-changes-for-the-window.md` §G9–G13.

## What was decided

The owner, 12 Oct (Q45; the rulebook's §11 Home and §12 Second Brain carry it):
- Home is a grid of cards. Cards are the reference; Alpha picks how each one is shown from what it
  is for. Every card has a purpose (its title) and an action on every item, in three fixed
  heights by priority, as many columns as stay readable.
- Second Brain's core is one graph of everything, like Obsidian's. Facts, goals and hypotheses go
  in one table, and a hypothesis row shows ✓ (keep it as a fact, or make it a goal) and ✕ on hover.
  The same table is in each project's Intelligence › Second Brain.
- One visible element per function. Every element has a page. The numbers strip is always shown.
  The Dashboard view follows ChatGPT's dashboards.
- "Map" means a map of places. "Graph" means things and their links. Both get small zoom and move
  buttons in the bottom-right corner.

## What was built

- **Before the plan:**
  - db2e496: Home's header with greeting, date and next event; one colour for the header, panels
    and bar; custom colours and fonts.
  - 23f9b21: Intelligence on the one data view; Experimental features with Bubbles.
- **The strip and the add row** (e175568, 5826979): the numbers strip has no fold. The add row
  shows only where it adds inline (rule 29).
- **Home** (63f590c):
  - `shell/homeCards.ts` builds card specs from what Home already loads, most urgent first: Needs
    you, Didn't work, Today, Alpha's guesses, Working on, Goals, Done today, then the projects.
  - Sizes are S/M/L (1, 3 or 5 items); a card is wide past 10 items; a card with nothing to act on
    is never made.
  - Every item has its action: ✓/✕, the ask's choices, Approve/Decline, Try again or Open.
  - "N more" opens the card's page. Needs you has its own page.
  - Alpha composing the cards itself is G10.
- **Second Brain** (2074eb4, 119fdd4):
  - `shell/brain/` holds the graph:
    - nodes and links from the world, a legend that filters, search, things with no links,
      always show names, and a side panel with links in and out;
    - Open page, ✓/✕ for a hypothesis, and a local graph 1–3 links deep;
    - d3-force layout, one tab stop with arrow keys along the links, zoom and move buttons.
  - `knowledgeSource` is one table of facts, goals and hypotheses, with ✓/✕ on hover for a
    hypothesis. It is scoped per project through the people its records name.
  - The egg and the Map are gone.
- **Pages** (dcb81ae): goals, standing permissions and notes each have a page; rows, nodes and
  Home's goals open them.
- **Dashboard** (4a833cb, c27361e):
  - numbers first, with their change on the week before, in words;
  - "As of", a period for every tile, Ask Alpha, Alpha's read, Tell me when, a CSV of the tiles,
    and Edit under ⋮.
- **The reviewer's findings** (87633a4):
  - a separate agent that did not build found 12 issues; the main ones are fixed;
  - Make it a goal keeps the hypothesis until the goal is approved;
  - ✓/✕ no longer open the row;
  - the graph refits as it fills, and a selection whose node is gone is dropped.
  - Still open:
    - the layout runs on the main thread;
    - standing instructions have no page;
    - a kept item's page always goes back to Second Brain;
    - the table's Tab skips the ✓/✕ (keyboard users reach a hypothesis through its page).
- **Layout fixes** (3afb5e2):
  - graph labels read 12px on screen at any size or zoom (they were about 5px);
  - the zoom buttons are 24px;
  - Home's greeting no longer wraps and is cut (a stale `flex-wrap`);
  - cards are at least 240px wide, so 1240 shows more than one column;
  - Settings' section list fits;
  - a project card's detail wraps to two lines.

## What ran

- `tsc --noEmit` is clean. vitest: 56 files, 481 passed, 1 skipped. `just stats`: core 247 passed,
  ruff and mypy clean. Proven by tests.
- `just check-layout` (Edge, a backup of the audited world, 1100×560 and 1240×820, light and
  dark):
  - first run: 152 of 272 states flagged;
  - second run: 20 of 272;
  - after 3afb5e2: 4 of 272 (a project card's detail cut at 1240); that detail now wraps to two
    lines;
  - final run: 272 of 272 clean.
- Not run: journeys (no change to how Alpha behaves), `just check-desktop`, and the Mac app beyond
  a look at `just app-dev`.
