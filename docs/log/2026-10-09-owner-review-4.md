# The owner's fourth review: one layout for every table, edge fold buttons, an interactive strip (9 Oct 2026)

Window only (`desktop/src`); no core change.

## Built

- **One layout for every table page** (`modules/DataFrame.tsx`): the data view fills the first
  screen, then Files, Intelligence and Governance. Used by projects (`ModulePage`), Network's
  People and Organizations (now the standard `DataPage` over a read-only source instead of a
  hand-made table), and Intelligence's Agents, Skills and Connections. An empty project and the
  New project page draw the standard data view over an empty source (`emptySource`), so every
  dropdown is there; the hand-made `SimpleTable` is gone.
- **Fold buttons** on both side panels: round, on the edge facing the middle, mid-height, shown on
  hover over that panel; the header fold buttons went. A double-click on a folded panel's empty
  space unfolds it (the folded assistant had no visible way back the owner could find).
- **Rename and icon by double-click** in the sidebar (name: in place; icon: the icon dialog). The
  core has no rename route, so the name is kept as the person's own (`PREF.moduleNames`) and every
  part of the window shows it; Alpha's core still knows the old name. Network can be renamed too.
- **New project**: shows in the sidebar under its typed name while its page is open; **Cancel**
  (and Escape) go back. "Every create has a Cancel" is now fixed rule 25 of the rulebook.
- **Table hover**: columns are measured at rest and the table laid out fixed, so the hover
  handle, checkbox and pencil move text within the cell and never widen a column.
- **Metrics strip**: four lines high at most: two-line tiles stack two high, a split is one block spanning both (its bar, one small line of labels, counts on hover), more scroll sideways; "all added this week" instead of repeating the count; trend
  lines only with values in two weeks, a split only with two categories, "open" only with done
  choices; every chart has a hover tooltip with its x and y; splits are colour-coded with a legend
  (series colours `--series-1…8`, the dataviz reference palette, validated for colour-blind
  separation on both themes; the old `--chart` trio failed it); a click opens a details dialog.
- **Bugs the owner found**: the header switch stayed icons-only after one narrow moment (its
  centre slot shrank to fit the icons and never measured room again; it now grows with the
  header); the toolbar's search had no boundary when closed (it is a bordered box now).
- Found while checking: the split block wrapped to a second row and was clipped (fixed by the
  grid); a chart tooltip stayed on screen after a click opened the dialog (cleared on press).

## Checked

- Typecheck clean; desktop tests all pass (tests updated for Network, the empty project, rename,
  New project's Cancel; new tests for the strip's meaning rules and its details dialog).
- Ran for real in the browser against the running core: Deals (strip, tooltip, dialog, fixed
  column widths under hover), Network, New project (sidebar draft, Cancel), Skills (Files starts
  at the fold), both fold buttons and the double-click unfold; no console errors. Not checked in
  the Mac app (Tauri) itself.

## Not done

- Second Brain's Facts view keeps its own layout (it sits under the Brain/Facts/Map toggle).
- A rename reaches the core only when it gets a rename route.
