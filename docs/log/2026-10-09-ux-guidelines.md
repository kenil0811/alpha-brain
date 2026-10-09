# The UX guidelines v2, against the window and into the rulebook (9 October 2026)

Vikas asked for the built window to be judged against `Exploration/UX_Guidelines_Platform.md`
(v2), for the rulebook to take its guidelines, and for a list of what to build. The decision is
Q36 (Q34 until the merge with main). Docs only: no code changed, so the window still follows the earlier rulebook text.

## What changed in the rulebook

All eighteen changes from the guidelines' Part C, plus the principles as a new §19 (Gestalt, the
laws of thinking and acting, Norman, Nielsen's ten, the 24-line short version). By section:
§0 who we design for and Notion as the reference; §1 red only for problems, sentence case, larger
body text; §2 Decline for Veto, a plain subtitle for each product name; §5 Files, Intelligence and
Governance as header tabs (nothing below the table); §6 ⋯ everywhere, comfortable rows, a click
opens at once, edit by Enter, F2 or a visible control, Estimated and Assumed as words, footer
summaries by type (the Notion set), the metrics strip folded by default, every assistant output a
file; §7 save as you go (Save, Discard and the leave guard gone), Overridden as a neutral chip;
§8 confirm the goal before building; §9 Quick overview and Deep thinking, sources linked, a plan
approved once, Always allow suggested; §13 model choice in Thinks with; §14 star defaults in every
dropdown, comfortable buttons, disabled reasons on focus and click; §15 Notion first, shortcuts;
§16 no tiny-text exceptions; §17 six new fixed rules (19–24); §18 three new checks.

Choices made where the guidelines said "consider": the three sections are separate tabs (not one
grouped tab); the metrics strip is folded by default (not Dashboard-only); "Decline" replaces
"Veto".

## The window against the guidelines

Read from the code (`desktop/src`), not run. ✓ meets, ◐ partly, ✗ fails.

| Guideline | | What the window does now |
|---|---|---|
| 5 One screen, one purpose | ✗ | Files, Intelligence, Governance stacked below the table (`modules/ModulePage.tsx:113`); the metrics strip shown by default (`modules/MetricsStrip.tsx:18`) |
| 13 Calm, spacious | ✗ | Rows compact (`styles/app.css:295`, 6px padding); the comfortable density exists (`:383`) but nothing turns it on; body 14px, table 13px, buttons 12–13px |
| 2 Usable by everyone / readability | ✗ | Tiny 11px uppercase letter-spaced text in table headers, metric labels, eyebrows, header tabs, board columns, Settings labels and ~15 more classes (`app.css:293,313,115,1012,1104`…) |
| 3 Like Notion: ⋯ | ✓ | Only `MoreHorizontal` is drawn; comments still say "⋮ More" (`DataToolbar.tsx:3`) |
| 16 / Doherty: row opens at once | ✗ | 220 ms wait for a double-click (`views/TableView.tsx:20`) |
| Consistent saving | ✗ | Cells save on blur (`views/cells.tsx:63`); record pages need Save, with a leave guard (`RecordPage.tsx:336`) |
| 14 Defaults first: star | ◐ | Only saved lists have a star, set from ⋯ More; `ui/Dropdown.tsx` has no default option |
| Footer summaries | ◐ | Nine options, already filtered by type (`views/engine.ts:141`); no unique, empty, median, range, checked |
| 1 Confirm the goal | ◐ | Question cards with "Or say it your way" exist (`assistant/Cards.tsx:51`); no rule for when they're used |
| 7 Quick first, deeper on request | ✗ | The composer has a model dropdown (`assistant/Composer.tsx:125`); no depth choice |
| 9 Every output is a file | ✗ | A turn carries no file (`core/client.ts:519`) |
| 10 Show the source | ◐ | Provenance line has time and steps; not which records or files (needs the core) |
| 15 Plain words | ◐ | Intelligence and Governance cards have subtitles; Second Brain, Agents, Automations, Skills tabs and Provenance are bare (`shell/Intelligence.tsx:27`, `shell/FactRow.tsx:29`); Veto on `Cards.tsx:44`, `ActionCard.tsx:159` |
| Signifiers: ≈ and ? | ✗ | Bare glyphs in numeric cells (`views/cells.tsx:143`) |
| 19 Greyed out says why | ◐ | Buttons: hover and focus with screen-reader text (`ui/Reason.tsx`); not on click; menu items hover only, keyboard skips them (`ui/ContextMenu.tsx:107`) |
| Red for problems only | ◐ | Red also on the "To check" metric icon (`app.css:1031`), the listening mic and presence dot (`:534`, `:746`) |
| 8 Propose, then act / approval fatigue | ◐ | Plan-level and per-action approval both; Always allow is a static button, never suggested |
| 21 Don't interrupt | ✓ | No toasts; inline `Notice`; a dead `.toast` rule (`app.css:742`) |
| 4 Always show what's happening | ✓ | Loading names its thing; empty states name what comes; errors offer Try again |
| 22 Shortcuts | ◐ | ⌘K and right-click mirroring ⋯ exist; no "/" |
| Accessibility basics | ✓ | Focus ring, labelled icon buttons, reduced motion, aria-live |
| Honest, absolute dates, no native dialogs | ✓ | As the rulebook asks |

## Recommended implementations, in order

Window only (the limits of Q35 hold) unless marked **core**.

1. **Header tabs for Files, Intelligence, Governance.** `ModulePage.tsx`: add three tabs after the
   collections to the `HeaderSwitch`, render one section at a time, delete `.modpage__below`.
   Small; highest impact.
2. **Comfortable by default.** Set `data-density="comfortable"` as the default (or make the
   comfortable values the base rule and compact the option); raise `.btn` and body one step on the
   type scale (`--text-base` 15px, table 14px). One token edit plus a density toggle.
3. **Sentence case, no tiny capitals.** Remove `text-transform: uppercase` and `letter-spacing`
   from every class listed above and lift them to `--text-sm` minimum; add a `tokens.test.ts`
   line that fails on `uppercase` in `app.css`.
4. **Row opens at once.** Drop `OPEN_DELAY_MS`; open on click; edit on Enter/F2 (already wired)
   and a pencil control that appears on cell hover and focus.
5. **Record pages save as you go.** Save each field on blur through the same path as cells;
   a quiet "Saved" beside it; remove Save, Discard and the leave guard; History and ⌘Z stay.
6. **Plain words.** Rename Veto → Decline (`Cards.tsx`, `ActionCard.tsx`); give `HeaderSwitch`
   an optional hint and add the §2 subtitles to Second Brain, Agents, Automations, Skills,
   Provenance and the rail's Intelligence.
7. **Estimated / Assumed chips** in place of ≈ and ? (`cells.tsx:143`), using the grey chip.
8. **Metrics strip folded by default** (`MetricsStrip.tsx:18`, flip the stored default).
9. **Disabled reasons on click and keyboard.** Let `Reason` open on click; render disabled menu
   items as focusable `aria-disabled` items with the reason as their description.
10. **Red only for problems.** Give the "To check" tile, the listening mic and the presence dot
    the amber or accent tone.
11. **Star defaults in `Dropdown`.** An optional `defaultValue` / `onSetDefault`; ★/☆ beside each
    option; stored through the existing preference route. Use it first for saved lists and views.
12. **Footer summaries: the Notion set.** Extend `views/engine.ts` with unique, empty, not empty,
    percent empty, median, range, checked and unchecked, per type.
13. **Depth in the composer.** Replace the model dropdown with Quick overview / Deep thinking;
    move model choice to Settings › Thinks with. Mapping depth to a model tier is **core** (Q32's
    tier alias exists); the window half is a control and a preference.
14. **Suggest Always allow** after the third approval of the same action kind (count in the
    window per kind; the standing permission itself already exists).
15. **"/" to insert** on pages and the add row, mirroring ⌘K's command list.
16. **Core, later:** every assistant output saved as a file and linked from the turn; sources
    (records and files) on each reply; the goal-confirmation rule in the assistant's planning;
    plan-once approval for routine steps.
17. **Tidy:** delete the dead `.toast` and `select` rules and the duplicate
    `.table td.editable:hover`; update the "⋮ More" comments; drop the unused `MoreVertical`.

Items 1–10 are window-only and small; 11–15 are window-only and medium; 16 needs the core.
