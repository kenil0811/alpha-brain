# The UX guidelines v2, in the window (9 October 2026)

Vikas chose from the seventeen recommendations in `log/2026-10-09-ux-guidelines.md`: build 1–3,
5–8, 10–15 and 17; item 4 changed (keep the 220 ms wait, add a pencil on hover); item 9 left;
item 16 documented with the other changes that wait on the core. Same branch and limits as Q33:
window only, no core change, no new route, no new dependency. Built after the owner's review
(e0d3918, 4b65651), which had already given every column Notion's footer set (item 12: nothing
left to do).

## What was built

- **One section fills the screen** (1): a module's header switch ("Sections") holds its
  collections, then Files, Intelligence and Governance; one renders at a time; the last tab is
  remembered; drop-anywhere upload works on every tab. The switch always shows, so the module's
  name moved to the breadcrumb.
- **Comfortable** (2): rows default to Medium; `--text-md` 14px, `--text-base` 15px (table cells
  14px); buttons 8/16px padding; small icon buttons 32px.
- **Sentence case** (3): no `text-transform: uppercase` anywhere (a test holds it); `--text-xs`
  only inside charts, the graph, avatars, counts and the folded rail.
- **A pencil on hover** (4, changed): an editable cell shows a pencil on hover and focus; a click
  edits at once; the row still opens after 220 ms on a single click.
- **Save as you go** (5): record pages save a field when it is left (a choice when picked), one
  call per changed field, "Saved." beside it, the reason beside it and the input kept on failure;
  ⌘Z/⇧⌘Z and History's Undo/Redo save at once; a new record is made by the first field left
  with a value. Save, Discard and the leave dialog are gone.
- **Plain words** (6): Decline for Veto everywhere; `ui/subtitles.ts` holds the one-line
  subtitles; HeaderSwitch items take a `hint` (tooltip and description); Intelligence shows the
  active tab's subtitle; Provenance and the rail's Intelligence carry theirs.
- **Estimated and Assumed** (7) as grey focusable chips in cells and record fields.
- **The metrics strip folds by default** (8), remembered once opened.
- **Red only for problems** (10): the "To check" tile, the listening mic and the presence dot
  moved to amber or accent.
- **Star defaults** (11): `Dropdown` takes `defaultValue` and `onSetDefault`; ★ the default, ☆ on
  hover or focus sets it; used for the composer's depth.
- **Depth** (13): the composer offers Quick overview (default) and Deep thinking, which is
  disabled with its reason (`client.ask` carries no tier); the route choice is in Settings ›
  Thinks with only.
- **Suggest Always allow** (14): from the third approval of one kind, that kind's card suggests
  it; before then it is a ghost button.
- **"/" to insert** (15): outside a text field, "/" opens the command menu as Insert: New record
  per collection of the current module, New module, Upload files.
- **Tidy** (17): dead `.toast`, `select`, `.modpage__below` and duplicate rules gone; ⋯ in every
  comment; unused `MoreVertical` gone.

Built by five workers in parallel on disjoint files, then joined and checked here.

## What ran

- `just test-desktop`: typecheck clean; 278 tests in 42 files pass, 1 skipped (267 before).
  `just test` 210 passed; `just lint` clean. `git diff main -- core connectors journeys
  desktop/src-tauri` empty.
- **Looked at in a browser** (Vite on 1430 against `alpha serve --no-background` on the scratch
  world): Deals with the Sections switch, Governance on its own tab, sentence-case headers, the
  depth control; a record page's Notes left after typing showed "Saved." with no Save button;
  no console errors. Not looked at: dark mode at every size, the "/" menu, the Always allow
  suggestion (tests only).
- **Not run:** `just check-desktop`, the Tauri app, the journeys (no change to how Alpha behaves).

## Not done, and why

- **Item 16 and depth, needing the core** (added to STATE's list): every assistant output saved
  as a file and linked from its turn; each reply's sources (records and files); the
  goal-confirmation rule in planning; a plan approved once covering its routine steps; a depth
  (tier) carried by `ask` so Deep thinking can be enabled.
- "New view" isn't in the Insert menu (view creation lives in the toolbar's own state).
- `onGuard`/`PeekGuard` are now optional and never raised; App.tsx, DataPage.tsx and
  ModulePage.tsx still pass them.
- Leaving a new record's page with typed text in a field doesn't create the record.
- The presence dot now looks the same listening and working.
- Item 9 (disabled reasons on click; menu items reachable by keyboard): not chosen.

## Questions for Vikas

The pencil shows on cell hover, not row hover (a row of pencils covers values; one selector in
`data.css` to switch). A module's name now sits in the breadcrumb, since the header always holds
the switch.
