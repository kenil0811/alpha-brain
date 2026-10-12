# The owner's decisions on the UX audit, built in the window (11 Oct 2026, Q44)

Branch `feat/ui-audit-fixes` (worktree `alpha-brain-audit-fixes`), from `feat/ui-rulebook` at
285f4b3 plus the fourth review (355bb5b), pushed back to `feat/ui-rulebook` (PR #5). Window only:
nothing under `core/`, `connectors/`, `journeys/` or `desktop/src-tauri/` changed; what needs
the core is `design/core-changes-for-the-window.md` §G (and C9).

## What was decided

Vikas answered the audit (`ux-audit-pr5/README.md`, U1–U53, R1–R20); the rulebook carries every
decision (§0–§18, fixed rules 1, 4, 13, 16, 22, 23 changed and 28–30 added) and Q44 records it.
The reversals are marked in `Exploration/UX_Guidelines_Platform.md` (outside the repo).

## What was built

- Notion-sized tokens: type 11–30px (body 14), a 4px spacing grid, radii 6/8/16, icons 16/20,
  header 52px; every raw px in the stylesheets and inline styles mapped to them; nothing a
  person reads under 12px except the folded sidebar's labels.
- The frame: the setup card on Home only and never while Alpha is away; while Alpha starts or
  is away the three-part frame stays, with a slim notice and Try now; one `plainError`/`say`
  turns every failure into a sentence (no status codes, no server text, no "core").
- Sidebar: the workspace logo is its own mark (the first letter, or a logo), never the avatar (first built as the avatar, then reversed by the owner the same day); a project wears the icon its name or goal suggests, else its first letter, never a table; every avatar shows the whole companion rather than a zoomed face; Settings keeps its section list on the left at 1100 too; folded, each icon has its name below it
  (12 characters, the full name on hover); nothing while loading, New project when empty, a
  quiet "Couldn't load projects" with Try again on failure; errors stay until dismissed.
- Assistant: the conversation's Archive and Delete live in its ⋮ (Rename and Delete wait for
  the core); only finished replies are announced to screen readers; composer focus ring; no hop.
- One shared Toggle for page and section switches; one Switch; subtitles moved under (i).
- Every delete and revoke confirms (Cancel first and focused); Governance rule deletes too.
- Every dropdown's Add new… either adds inline or opens a describe dialog sent to Alpha.
- Data view: Add/Edit list is a page with Save list and Cancel over a live preview; toolbar
  changes are temporary with Save to this list / Reset; CSV downloads exactly what is shown
  and says the count; group counts over the whole result; the toolbar folds labels, then items
  into ⋮, and gives them back; kit menus with arrow keys; no peek; empty records left out,
  nameless rows read Untitled; required fields can't be emptied (table and record page);
  date and number fields read "13/10", "next friday", "1.2k".
- Colour: chart and map palette is the accent plus greys; "You" and status chips neutral;
  contrast tokens raised and checked by a test; a `prefers-contrast` set.

## Guard rails

- `just check-layout [--world <path>]`: the window in a real browser (Edge here) on a SQLite
  backup of a world, 31 states × 1100×560 and 1240×820 × light and dark × browser installed or
  not; flags overflow, sideways page scroll, wraps, ellipses and covered controls.
- `src/test/sourceRules.test.ts`: glyph icons, native inputs and dialogs, raw px (CSS and inline
  styles), numeric icon sizes, `--text-xs` outside the folded labels.
- The review was done by a separate agent that did not build; its 20 findings were fixed.

## What ran

- `tsc --noEmit` clean; vitest 50 files, 472 passed, 1 skipped (proven by tests).
- `just check-layout` on a backup of the audited world: first run flagged 224 of 248 states
  (two causes on every page: the workspace name wrapping and the depth picker cut); after the
  fixes: 60 of 272, then 48 of 272, all of them the Settings theme toggle 4px too wide; fixed
  and measured in the browser (202 of 202px), not re-run in full after that last fix.
- Not run: journeys (no change to how Alpha behaves), the Mac app itself.
