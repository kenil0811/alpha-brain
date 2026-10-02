# Bugs

Bugs found in Alpha (AB), with their status. Newest group first.

Status: **open**, **fixed** (verified), **deferred** (with the reason).

## 2026-10-02: Bridge and Alpha bug-class review

| # | Bug | Status |
|---|---|---|
| 8 | A calendar sync that throws only reached the log: the connection stayed "connected" and nothing showed in Activity (Bridge's success-shaped failure). | fixed (test seen failing first): `Connections.synced` journals a new problem once, and the recovery |
| 9 | `turn.ask`, `automation.run` and `Scheduler` defaulted to `claude_cli.run`, so `alpha ask` ran on the `claude` CLI's own login, not the chosen model (Alpha #45). | fixed: no default runner; `alpha ask` uses the Router |
| 10 | The companion window received the main window's core token, so a script in it could approve actions or change settings (Bridge TASK-027). | fixed (test seen failing first): the companion gets its own token for home, conversation, ask, turns and transcribe only |
| 11 | `alpha serve` without a token ran any web page's simple POST (no CORS preflight), e.g. an approve. | fixed (test seen failing first): requests from any other Origin are refused |
| 12 | No single gate and no CI: Python and desktop checks ran separately, by hand. | fixed: `just verify` and `.github/workflows/verify.yml` |
| 13 | The layout check is a console script, so no gate runs it. | fixed: `just layout` runs it over every page, seeded, inside `just verify` |
| 14 | At 1100x760 with the Chief of Staff panel open the main column is 496px: the Intelligence tabs need 522px of 440, so "Knowledge" is cut off (#1 came back). | open (found by `just layout`) |
| 15 | At 1100x760 Knowledge's "Facts about you" table needs 782px of 438: Where from, Since and Add run under the Chief of Staff panel. | open (found by `just layout`) |

## 2026-10-02: Alpha UI port (layout check and live review)

| # | Bug | Status |
|---|---|---|
| 1 | Intelligence tabs overflowed the page at 1100x760 and "Second brain" wrapped to two lines. | fixed (layout check) |
| 2 | The Activity search placeholder was cut off at 1100x760. | fixed (layout check) |
| 3 | Two StandardDropdown tests failed: the test setup never unmounted between tests. | fixed (tests) |
| 4 | The crash screen showed a stack trace to the person. | fixed (one line; stack in the console) |
| 5 | At 768x560 the collapsed rail cuts "Job Search" and "Intelligence" with an ellipsis (full name on hover). | open (768x560 is reported, not a target) |
| 6 | Settings shows an error with an inline `fontSize: 12` (`desktop/src/shell/Settings.tsx`). | open (Settings is another stream's) |
| 7 | Second brain labels are small when there are few nodes: the graph scales to fit the egg. | open |
