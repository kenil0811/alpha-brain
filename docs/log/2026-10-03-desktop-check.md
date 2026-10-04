# The desktop check and the type scale (3 October 2026, late afternoon; ideas 11 and 12 of the port)

**What was built.** `just check-desktop`: every page of the window, at the window's own sizes,
opened in headless Chromium against a check core on a copy of the world, judged by what a
person would call broken, with a screenshot of each. Two halves:

- `core/alpha/journeys/desktop.py` (`alpha check-desktop [address prefixes] [--world] [--keep]`)
  copies the world with SQLite's backup, starts `alpha serve --no-background` on the copy with a
  token of its own, builds the window with `vite build` pointed at that core (into the copy's
  folder, never the app's `dist/`), serves the build on port 1430 (the loopback origin the
  core's CORS allows besides the app's own), runs the browser half, and writes
  `docs/checks/<stamp>.md` (and `.json`, first). It refuses plainly when 1430 is busy (a dev
  server) and when the core or the build does not come up, with the log's tail.
- `desktop/scripts/check-pages.ts` (Node 24 runs it with types stripped; `playwright-core`
  1.62.0 as a dev dependency, the same pin as the browser hand, so the cached Chromium is shared)
  asks the core for the modules, skills, automations and people, forms every address the window
  answers to (`shell/address.ts`: home, activity, people and each person, each module,
  intelligence and its four tabs, each skill, each automation, settings), and opens each one at
  each size in a fresh context: `about:blank` first, then the page, then it waits for the
  requests to go quiet, the fonts and a painted frame. A page fails for: a request answered
  4xx/5xx or never answered; a console error or an uncaught exception; the "core isn't running"
  state or a `role="alert"` notice; fewer than 20 characters of text; the page's own area
  scrolling sideways (naming what reaches past its edge); an element past the window's right
  edge outside a sideways scroll area made for it; text clipped by its box without an
  ellipsis, or spilling past its box; an element cut off by a clipping ancestor; text in view
  that is not what is at its own point (covered by something). Findings of one kind about one
  element fold into a count.

The sizes come from `tauri.conf.json`, not from the check: the window's minimum (now
1100×560) in light, its default (1240×820) in light and in dark. A change to the window's sizes
changes the check.

**What it found, in four runs on a copy of Kenil's world (61 pages, 183 loads each, about two
minutes a run).**

1. `docs/checks/2026-10-03-1608.md`, the first rules: "61 of 61 clean". The screenshots said
   otherwise at the old minimum (860×560): with the panel open the page had 256px and scrolled
   sideways, and the rail's bottom entries (Intelligence, Settings) were below the fold. The
   rules had excused the first because the page's own scroller is a scroll area, and had no
   rule for the second.
2. `docs/checks/2026-10-03-1612.md`, with the rules tightened (the page's own scroller never
   excuses; cut off; covered) and two fixes: 275 findings, almost all real for a different
   reason. Below 1180px wide a media rule turned the panel into a fixed overlay, so at the new
   minimum width the page ran under the panel on every page (263 "covered"). The rest were the
   rule's own noise: text scrolled out of a scroll area (the rail's lower modules, the panel's
   older messages) is not "covered" by what sits over its former place.
3. `docs/checks/2026-10-03-1617.md`, with the covered rule looking only at text in view: 50 of
   61 pages clean, 15 findings, every one real and all of one family, long unbreakable strings
   at the smallest width: file names in bold on Activity (37px past the page even at the
   default size), LinkedIn addresses as pills on six person pages (one covering the "Person"
   label beside it), Advisory's six table tabs in one row, the "Starts at" address on three
   skill pages.
4. `docs/checks/2026-10-03-1622.md`, after the fixes below: 61 of 61 pages clean at every size.

**What was fixed in the window.**

- The window's minimum width is 1100 (was 860): the rail (224), a page of at least 496 and the
  panel (380) side by side. The overlay mode below 1180px is gone with the rule that produced
  it (and the phone-width rule under 760px, which the window could never reach).
- The rail's module list is the part that scrolls (`rail__scroll`); the brand, Home, Activity
  and People above it and Intelligence, Settings and the status below it stay put. Before, the
  whole rail scrolled and hid its bottom entries at the smallest height.
- A long word breaks rather than runs past the page (`overflow-wrap: anywhere` on `.page`);
  the sub-tabs wrap onto a second row with each tab on one line; a pill is at most as wide as
  its row and ends in an ellipsis; a person's page stacks the name, the kind and the keys
  like a module's head does.

**The type scale (idea 12).** Every font size in the window is now one of seven tokens in
`app.css`: `--text-xs` 11 (meta, badges), `-sm` 12, `-md` 13 (the working size), `-base` 14
(reading text, inputs), `-lg` 16 (small headings), `-xl` 20 (section and page-level headings),
`-2xl` 26 (the page title, big numbers). The 171 raw sizes in the stylesheet (fifteen distinct
values, 10 to 30px, including 11.5, 12.5 and 13.5) and the 14 inline `fontSize` numbers in
components were mapped to the nearest step; page titles went from 30 to 26, section heads from
18 to 20, chart labels from 10 to 11. `src/styles/typescale.test.ts` fails a raw pixel size in
either place from now on. CONTRIBUTING §3.8 states the scale and the no-overflow rule; §4
states the check.

**What ran.** `just test-desktop`: typecheck clean, 35 tests in ten files (the pure parts of
the page check: addresses, prefixes, folding, screenshot names; the type scale). `just test`:
184 core tests (the sizes from the configuration, the report, the busy port). `just lint`
clean. Four real runs of the check as above; the app rebuilt and restarted on the result.
