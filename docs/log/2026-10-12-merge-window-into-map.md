# The window, with main, merged into the Map branch (12 Oct 2026)

Branch `feat/map-view` (PR #6), merging `feat/ui-rulebook` at c0d4f6e (main's Q39–Q40 in,
`log/2026-10-12-merge-main.md`).

- The Map's decision is **Q46** now (it was Q44), in the code comments, the journey, the
  rulebook and the Map's log entry.
- `/api/proposals/{id}/decide`: main removed the plan branch; the place field's yes keeps its
  order (the change first, then the answer, then the journal line).
- The design's §11 and the log index take PR #5's side, plus the Map's entry.

## What ran

- Core: 232 passed; `just lint` clean (ruff, mypy on 115 files).
- Window: tsc clean; vitest 488 passed, 1 skipped.
- `just stats`: 232 core tests; 74 tools; 23 journeys; 206 commits; core 16,062 lines, tests
  5,624, desktop 24,899.
- **Not run:** journeys (`map_places` passed before the merge), `just check-layout`, the Mac
  app. Proven by tests only.
