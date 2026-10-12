# Main merged into the window again (12 Oct 2026)

Branch `feat/ui-audit-fixes` (PR #5's `feat/ui-rulebook`), merging `origin/main` with a merge
commit (the owner chose a merge over a rebase, so nothing is force-pushed).

## What changed

- **Q numbers.** Main's Q39 (modules as workflows) and Q40 (the sweep) keep their numbers. The
  window's Q39–Q44 become Q41–Q46 in the design's §11, the rulebook, core-changes, STATE and the
  window's log entries, so a reference still points at the same decision.
- **Main's features in the rulebook's look:**
  - the workflow card ("Your workflow") and grouped questions in the side panel, the Assistant
    page and Home's Needs you, in place of the plan card;
  - a read-only table (built by the module) drops edit, add, duplicate, remove and Add files;
  - under each field on a record page and in the record panel: "Not filled: …" or
    "From {source} · day";
  - a module's parts as buttons on a record page, with "Try again: …" for a failed one.
- **Gone from the window, as in main:** plans, the plan card and its test, the research pass,
  and the Stop buttons that went with them.
- Conflicts: 10 code files and 3 docs; the design's §6 box takes main's rows.

## What ran

- Core: 225 passed; ruff and mypy clean.
- Window: tsc clean; vitest 482 passed, 1 skipped.
- `just stats`: 225 core tests; 73 tools; 22 journeys; 200 commits; core 15,762 lines, tests
  5,486, desktop 24,474; lint clean.
- **Not run:** journeys, `just check-layout`, the Mac app. Proven by tests only.
