# §4.12 Trust holes closed (2 Oct 2026, evening; §4.9 item 9, §4.10)

*Moved verbatim from `build-plan.md` §4.12 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.12" mean this file.*


- **Tell steps measure from the last run only.** A first run sets the baseline and says so
  ("First run: what is new, changed or gone is reported from the next run"); nothing is journaled
  as `noticed` on it (`runtime/pipeline.py`).
- **Synced rows are known as synced.** `records_upsert` and `page_to_table` mark provenance
  `synced: true` and journal the ids they touched (capped at 500, `records` in the entry's
  data), as reader runs now do too. `check.records_of` reads both `record` and `records`, so a
  trial can remove rows it upserted; `worth_checking` skips synced and reader-written rows (a
  page copied is not a value Alpha worked out) and still checks looked-up and estimated ones.
- **`source` is required on `records_add`.** A forgotten argument is a tool error the model
  sees, never a stated value filed as a guess. `table_start` defaults to `stated` (it logs what
  the person just said); `records_update` keeps "left out means unchanged".
- **The app's field kinds match the core's** (`bool`, `multichoice`): a bool field edits as
  Yes / No again and shows ✓.
- **The conversation panel loads the stream scoped to the page's module**, as it sends.
- **Removing a connection reads pipeline `steps`** as well as procedures for the readers it
  takes, and the sources those readers fed go to `not_built` with "Its reader went with the
  linkedin.com connection", so the module still shows where it reads from.
- Still open from §4.10: the dead code list, `clear_conversation`'s physical delete,
  `Entities._index`'s silent key conflicts, `decide_fact` overwriting `recorded_at`, the
  calendar's first-sync journal flood, the LinkedIn automation's procedure naming the old
  `linkedin` key (Alpha's own know-how; the error now says to use `url`).
