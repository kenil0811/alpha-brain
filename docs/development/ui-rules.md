# UI rules

The rules every screen in AB follows, adopted from Alpha's (`docs/development/ui-bridge-baseline.md`
on Alpha's `feat/ui-bridge-baseline`), adapted to AB's design §8. Where a rule names a file, it is
under `desktop/`.

## Copy and density (strong rule)

The audience is executives: to the point, minimal distraction.

- Titles and labels are short and specific. No descriptive sentence under a title or inside a
  card: the explanation goes in an `InfoTip` (`src/ui/InfoTip.tsx`) next to the title, or a
  native `title=`, never as visible body text.
- Empty states are one short line ("Nothing yet.", "No goals yet.").
- Inputs are sized to their content. A key, id or name field is compact (about 240-320px); only
  long content (notes, prompts, free text) gets a wide or multi-line field.
- Toolbars: search and filters sit in one row above what they act on; the search field gives up
  width first.
- Plain language; minimal, elegant, professional by default.
- Never drop what the person needs to act: errors, warnings and destructive confirmations stay
  visible, kept to one line. Errors are announced (`role="alert"`).
- Nothing says "coming soon"; a thing that doesn't exist yet isn't shown.
- Never show a terminal, a command or a stack trace to the person.

## Type scale (strong rule)

Five sizes, as tokens in `src/styles/tokens.css`, and nothing else: `--text-xs` 12px (meta),
`--text-sm` 13px (labels), `--text-md` 15px (body, buttons, inputs), `--text-lg` 19px (section
headings), `--text-xl` 26px (page titles). No raw px font sizes in CSS, no inline `fontSize`.
Labels are sentence case, never uppercased (no `text-transform: uppercase`). The layout check
reports `FONTS` when a screen uses more than five sizes. (The Zazoo character's own SVG art is
drawn in its own units and is exempt.)

## Fit and overflow (strong rule)

Nothing spills out of its box at 1100x760 and 1440x900.

- Text fits its place: shorten the copy first; a one-line ellipsis (full text in `title=`) only
  where the text is the person's own (a project name).
- A search bar or an empty field gives up width before labels or values truncate.
- Placeholders fit their field at the narrowest width.
- Rows wrap rather than squeeze.
- Nothing covers text: fixed headers are opaque; an avatar or tooltip never sits on a label.
  Nothing is cut at the top or bottom.
- Check before shipping a layout change: run `tools/layout-check.js` (dev tools console or a
  Playwright eval) at 1100x760 and 1440x900, with Chief of Staff at its narrowest, in every state
  the page passes through. It must return `[]`. Report 768x560 too; it is not a target. Then
  read a screenshot against these rules: the script cannot judge wording.

## Vocabulary (strong rule)

- A module is a **project** in everything a person reads; one inside another is a **sub
  project**. Code identifiers, routes and API paths keep "module". The core's turn rules say the
  same to the model (`core/alpha/runtime/turn.py`, rule 8).
- The assistant is **Chief of Staff**.

## Layout (AB design §8)

- A flex shell: the rail (224px; collapses to a 76px icon column; resizable 76-360) | the page |
  Chief of Staff (380px; resizable 260-520; collapses to a 48px strip). Nothing overlays the
  page at 1024px and wider; below that the rail shows icons and Chief of Staff opens over the
  page, without changing what was saved.
- The rail keeps AB's items: Home, Activity, the projects, Intelligence, Settings.
- Every page starts with a 56px `PageHeader` (`src/ui/PageHeader.tsx`), level with the rail's
  brand row and Chief of Staff's header. Page titles are serif.
- The page lives in the address (`#/m/<id>`, `#/intelligence/<tab>`), so back and forward work.
- Light and dark both come from the tokens; never hard-code a colour.

## Reuse (platform rule)

Use what exists before building: AB's primitives in `src/ui/` (Button, IconButton, InfoTip,
Tooltip, DropdownMenu, Dialog, Tabs, toast, PageHeader, panel control), then lucide icons, then a
proven library. No emoji or unicode glyphs as icons.

## Bugs

`bugs.md` at the repo root lists bugs found, open and fixed, with how each fix was verified.

## Not adopted

These four of Alpha's rules are deliberately not part of AB's (decided by the person):

- **Per-feature CSS files.** Alpha has each feature area own its own `.css`; AB keeps
  `tokens.css` plus `app.css` (and the `ui/` primitives' own files).
- **Chat replies capped at two sentences.** AB's Chief of Staff answers as long as the answer
  needs.
- **A 768x560 minimum window.** AB's window keeps its own minimum; 768x560 is reported by the
  layout check, not enforced.
- **Project creation asks the person's role first.** AB has no creation questionnaire; a project
  starts from what the person says.
