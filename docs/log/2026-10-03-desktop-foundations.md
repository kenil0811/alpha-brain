# Desktop foundations, from pull request #3's ideas (3 October 2026, evening)

The first slice of the port decided with Kenil (Q27–Q28, `2026-10-03-review-pr3.md` §8): what
every later desktop slice stands on, rebuilt on main in Alpha's conventions, nothing copied.

**What changed.**

- **The app's type ships with it.** `@fontsource-variable/geist` and `source-serif-4` are
  bundled (six woff2 files in the build); the Google Fonts links and the two CSP entries are
  gone. The app no longer needs the network for its look.
- **Contrast at AA.** `--text-3` (secondary text) was 3.0:1 on white; it, `--warn` and the
  primary button's blue are at or above 4.5:1 now. The Mac's own settings are honoured with no
  knob: `prefers-reduced-motion` stops every animation and transition, `prefers-contrast: more`
  darkens secondary text and borders.
- **Pages have addresses** (`shell/address.ts`): `#/home`, `#/activity`, `#/people`,
  `#/people/<id>`, `#/m/<id>`, `#/intelligence/<tab>`, `#/settings`. The address wins over the
  remembered place when it names a page; back and forward move between pages; the companion
  and ⌘K can open a page by its address later. Tested for every surface and for addresses that
  name nothing.
- **The rail and the panel resize** by their borders (`shell/useDragWidth.ts`): the rail
  160–360 px, the panel 280–560 px, a handle that shows the two-sided cursor for the whole
  drag; widths kept per window as a convenience, never world data.
- **A UI kit** (`src/ui/`): `Button` (default / primary / ghost / danger; md / sm),
  `IconButton` (the label is required), `Badge` (good / warn / bad / info / gray), `Tabs`
  (arrow keys, Home and End, a roving tab stop), `Menu`, `Popover` and `Dialog` on Radix
  (focus kept, Escape and outside-click handled), `Tooltip` and `InfoTip`, and `icons.ts`,
  the lucide icons the app uses named by what they mean here. The app moved onto it: 79 raw
  buttons became `Button`; every icon button is an `IconButton` with a lucide icon; the badges
  are `Badge`; the three tab strips (Intelligence, the module page's sections and tables, the
  table's views) are `Tabs`; the table's hand-rolled `role="menu"` is a `Popover`; the
  screenshot lightbox is a `Dialog`; the rail's glyphs (⌂ ◷ ☺ ▦ ◈ ⚙ + » «) and the step marks
  (✓ ✗ 👁 ▾ ▸), the pager (« »), the sort marks and the Finder arrow are lucide icons. The one
  button left on raw classes is the voice button's live state.
- Dependencies, pinned: four Radix packages, `lucide-react`, the two font packages. Not
  taken: the map and its two packages, TanStack virtual (comes with the table views).

**What ran.** `pnpm typecheck` clean; vitest 11 tests (the kit's six: classes and type on a
button, a labelled icon button, a badge's tone, tabs by keyboard, a popover opening and closing
on Escape, a dialog's title and Escape; addresses round-trip; the rail). Checked in the browser
pane against a background-free core on a backup copy: Home, the Deal Tracker module, the Deal
Listings table with the options popover open (Download, Columns with arrow buttons, Lists),
dark mode, the lucide rail. The app rebuilt and reopened.

**Not done here.** The five-size type scale as tokens and the no-overflow check (they come with
the desktop acceptance tool); `Segmented` for the Activity filters (the chips are fine);
`PageHeader`; using `InfoTip` anywhere yet.
