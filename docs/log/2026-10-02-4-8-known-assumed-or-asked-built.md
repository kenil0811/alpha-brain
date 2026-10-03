# §4.8 Known, assumed or asked (built 2 Oct 2026)

*Moved verbatim from `build-plan.md` §4.8 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.8" mean this file.*


Why: "i had a for godness shake 35g protien shake" (2 Oct, 14:33) was logged as 160 kcal, 3 g
carbs, 5 g fat, estimated; the label (one search away) says 215 kcal, 16.8 g carbs, 0.7 g fat.
Every row the Nutrition module had ever written was an estimate, the "≈" mark in a cell was the
only sign, and the build had never tried a branded product. Rule 1 of the turn said "sensible
estimates… No research", my implementation of "plain logging stays instant"; the module Alpha
built had no idea where a number comes from; nothing compared Alpha's answers with reality.
Kenil: "i want alpha to be trusted same as people would trust claude", and the principle: if
Alpha doesn't know, ask, or at least say what it assumed; never just do anything. The build:

- **Rules** (`runtime/turn.py`): a plain action is still done in the turn, but every value is
  stated, looked up (whatever can be known is looked up and its source kept) or estimated and
  said so; an unknown the result depends on is asked about or assumed out loud; replies say where
  each number came from. Plans name their trial. `BUILD_RULES`: a table whose values come from
  outside gets its way of obtaining them built and tried on a real item; fix how a value is
  obtained, never the one row.
- **Provenance** (`mcp/tools.py` `provenance_of`): `records_add`, `records_update` and
  `table_start` take `source` ("stated", "estimated", or where it was read) and `assumed`;
  journal lines say "(from label on ocado.com; assumed the 330 ml bottle)". The table page shows
  "≈" for estimates, "?" for a value resting on an assumption, the source in the cell's title,
  and "4 estimated, 1 on an assumption" beside the row count.
- **The check** (`runtime/check.py`): `TurnRequest.kind` is `turn`, `independent` (web search
  only, no MCP) or `judge` (no tools); `check(world, turn)` journals `checked` and, on a sourced
  difference or an unstated assumption, runs a repair turn whose reply lands in the conversation.
  `Turns` runs it in the background after a turn whose records Alpha worked out
  (`worth_checking`); `alpha check [turn]` runs it by hand.
- **Builds** (`runtime/build.py`): `plans.trial` and `plans.checks`; a finished build runs the
  trial in its thread as the person would say it, checks it, removes the trial's rows, and is
  sent back with the finding while it differs (`TRIAL_REPAIRS = 2`); the report ends with what
  was tried and what the check said.
