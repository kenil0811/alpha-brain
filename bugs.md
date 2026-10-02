# Bugs

Bugs found in Alpha (AB), with their status. Newest group first.

Status: **open**, **fixed** (verified), **deferred** (with the reason).

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
