# The owner's second review of the window (9 October 2026)

Vikas used the window after Q36 and asked for a long list of changes; four contradictions were
settled first (Q37): sections back below the table, ⋮ everywhere, autosave plus a visible Save /
Cancel / "Last saved", and the star for the default with a highlighted selection instead of a
tick; then duplicate names collapse in the window (renaming needs the core), New project opens a
page and asks the assistant, the workspace is "Kenil's workspace", and "module" becomes
"project" in every word a person reads and in the rulebook, the design doc and STATE (code, the
store, the build plan and older logs keep "module"). Same branch and limits: window only, no core
change, no new route, no new dependency.

## What was built

- **Kit** (`ui/`): every Dropdown has search, a hover star (stored itself under
  `alpha.default.<key>`, read with `useDropdownDefault`), "Add new…" (with no `onAdd` it asks for
  a description and sends it to the assistant through `AssistantProvider`), and a highlighted
  selection instead of a tick; `MultiDropdown`; ContextMenu submenus; `MoreVertical` (⋮); the
  dropdown rules moved to `styles/kit.css`.
- **The data view**: List · View · Search on the left; Filter, frequent actions (Upload, the
  numbers' show arrow) and ⋮ on the right; Sort inside ⋮; the list name opens a dropdown of lists
  with Add list (list actions in ⋮ and right-click); a View button with the current type's icon;
  Download with CSV and Excel beneath it; the metrics strip below the toolbar with its arrow at
  the top-right; choice lists as the standard dropdown; conditional colour fixed (a new rule had
  an empty value, so nothing coloured) and says what it did; hidden properties keep their place
  with an eye-off; text slides aside for the checkbox and the pencil; a Save bar ("Not saved
  yet", "Saved", "Last saved 14:32") with Cancel that deletes a record made in this visit; "+ New"
  opens the record page everywhere (Food log added inline because its core accepts an empty
  record); the record header "← Deals · Globex pilot" via `dedupeCrumbs`.
- **Project pages**: Files, Intelligence (Activity, Agents and automations, Goals, Alpha's page,
  Inside) and Governance below the data again; an empty project shows one empty table; Network's
  People and Organizations are tables even when empty, with Intelligence and Governance below;
  `NewProjectPage` (name, purpose, one empty table, Create project asks the assistant).
- **Shell**: Home's "Didn't work today" cards beside the bell's Activity; Settings with its
  section list back, Overview first, the Companion section gone (Appearance links to Alpha's
  agent page); connections and facts as full pages (`#/intelligence/connections/<id>`,
  `#/intelligence/facts/<id>`); the bell at the right of the assistant's header and under the
  avatar when folded; "Alpha" under the folded avatar; pupils drawn under the eyes' glint (white-
  eyed animals had none); "Kenil's workspace" by default; panels fold when dragged in below half
  their minimum and widen with no cap; sidebar drops accepted on dragenter (WebKit drops only
  there); New project everywhere.
- **The egg**: links drawn (You → projects → collections → records, relations, people), 1px at
  every zoom; every record a dot on a spiral in its collection's disc (over 200, a sample and
  "+N more — zoom in"); names by layer as you zoom (+, −, Fit; to 16×).
- **Merge leftover**: `Settings.test.tsx` and main's `settings.test.tsx` were one file on a Mac;
  main's tests are `BrowserRow.test.tsx` (394c988).

Built by five workers in parallel on disjoint files, joined and checked here.

## What ran

- `just test-desktop`: typecheck clean; 302 tests in 46 files pass, 1 skipped.
- **Looked at in a browser** (Vite 1430, the scratch world's core): Deals (toolbar, strip below
  it, ⋮, Filter right, sections below), a record page's header, Settings with Overview, the
  bell in the assistant's header, "Kenil's workspace", New project. The core on 53977 was
  started before main's merge, so `/api/browser` 404s there (not this change). The scratch
  world's Deals list has Stage and Amount hidden from earlier testing.
- **Not run:** the Tauri app (the sidebar drop fix is for WebKit and was only reasoned and unit
  tested), `just check-desktop`, the journeys. The egg was seen by tests only.

## Not done in the window

- The footer's Calculate menu and the column menu's Wrap text still use their menus.
- Download's formats open beneath it in ⋮, not as a side submenu (⋮ scrolls, so a submenu would
  clip).
- Record dots in the egg aren't reachable by keyboard; touchscreen pinch.
- Home's failures come from the last 300 activity entries.

## Needs the core (also in STATE)

Creating a person or organisation in Network; files tied to Network; renaming a project (so
"Deals" can hold something not called "Deals") and the builder refusing a duplicate name;
Try again for failures other than an agent's run.
