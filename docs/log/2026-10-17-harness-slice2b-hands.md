# 17 October 2026 — harness slice 2b, step 2: the hands

The second of 2b's four steps (`../design/harness-slice-2-proposal.md`,
`../design/harness-slice-2b-proposal.md`). The model's 72 narrow tools become 17 generic hands,
plus the four workflow tools as plan mode. Nothing underneath changed: each hand calls the
operations the code kept.

## What was built

- **`mcp/tools/hands.py`**, the tools the model sees, each docstring its whole instruction:
  `world_query` (one SELECT across the world; Kenil, 17 Oct: "world_query may read across
  tables"), `world_write` (rows in, add or upsert by key, with provenance), `world_change` (one
  row changed or removed by revision), `world_shape` (a table made or grown, rows identified as
  people, a module, a saved list), `world_file` (documents listed, read, fetched; folders
  watched), `world_remember` (a fact, a person or organisation with hard keys, a goal, a note,
  an instruction with the person's quote, a source), `world_search`, `ask_person`,
  `tell_person` (a note in Activity or a proposal for Home), `skill_keep` (a reader or a
  procedure), `skill_run`, `skill_find`, `agent_keep` (made or changed, steps or brief),
  `act_outward` (propose, or the person's yes or no in words), `browser_read`,
  `browser_script`, `connect` (list, a site's sign-in, a folder, the calendar, events). The
  mapping of the 72 onto them is the table below.
- **`world/queries.py`**: the read-only SQL surface. A read-only connection (`mode=ro`: a
  write is refused by the database), a temp view per table (`rows_<name>`, its JSON values as
  columns plus id, revision, the dates, reader, seen_at, gone_at, provenance) and a view per
  kind of thing the world keeps (`tables`, `journal`, `facts`, `people`, `goals`, `notes`,
  `agents`, `runs`, `actions`, `documents`, `events`, `modules`, `threads`, `decisions`,
  `commitments`, `sources`, `record_versions`); one SELECT or WITH only; at most
  `[views] query_rows` rows (200, said when cut) and `query_steps` of work (a longer read is a
  wrong query, stopped and said); a wrong column name answers with the views and their
  columns.
- **`tools/base.py`**: `@tool` keeps a tool's manners on every operation (the agents' write
  wall, problems in plain words) and gains `served`; `@hand` serves one to the model; `all()`
  lists the hands, `operations()` everything. The four `workflow_*` tools and `ask_person` are
  hands too.
- **Prompts and skills rewritten to the hands:** `turn.md` (its rules and a line naming the
  hands), the browser, files and calendar connector `SKILL.md`s, `agent_run.md`,
  `repair_reader.md`, `repair_procedure.md`, `route_trial.md` (and the route's trial sentence),
  the pre-pack's two lines, Doc's one. The window's step words (`plain_tool`) know the new
  names; `world_query` shows its SQL.

## The mapping

| Hand | Operations it stands for |
|---|---|
| `world_query` | `collections_list`, `collection_describe`, `records_query`, `records_aggregate`, `record_history`, `journal_recent`, `journal_read`, `facts_get`, `goals_list`, `notes_list`, `note_read`, `agents_list`, `actions_list`, `sources_list`, `modules_list`, `threads_list`, `documents_list`, `calendar_events` |
| `world_write` | `records_add`, `records_upsert`, `table_start`'s first row |
| `world_change` | `records_update`, `records_delete` |
| `world_shape` | `collection_create`, `collection_add_fields`, `collection_identify`, `module_create`, `module_move`, `list_save`, `table_start`'s table |
| `world_file` | `documents_list`, `document_read`, `page_download`, `folder_watch`, `files_sync` |
| `world_remember` | `fact_record`, `entity_resolve`, `goal_set`, `goal_update`, `note_write`, `instruction_add`, `instruction_remove`, `source_add` |
| `world_search` | `search`, `entities_find`, `entity_read` |
| `tell_person` | `journal_note`, `propose`, `instruction_propose` (as a proposal) |
| `skill_keep` | `reader_save`, `procedure_save` |
| `skill_run` | `reader_run` |
| `skill_find` | `skills_find`, `skill_read` |
| `agent_keep` | `agent_create`, `agent_update`, `thread_brief` (an agent's brief) |
| `act_outward` | `action_propose`, `action_approve`, `action_decline` |
| `browser_read`, `browser_script` | `page_read`, `page_script` |
| `connect` | `connections_list`, `browser_signin`, `folder_watch`, `calendar_connect`, `calendar_sync`, `calendar_events` |
| gone | `page_to_table` (a reader does it), `thread_open`, `thread_update`, `threads_list` (work items are the conversation's) |

## Proven by tests

`core/tests/test_hands.py`: the model sees exactly the 21 names; shape → write → query →
change round trip with sums and ids; a query cut at its limit and saying so; a write refused by
the database; a wrong column answered with the views; fields added, rows identified, a list
kept, a module made and found existing; facts, a person, a goal, a note, an instruction (refused
without the person's own words), a source; a note and a proposal; what each hand refuses when
something is missing; a pipeline agent made and paused; skills found and read; a problem in an
operation answered in words. 324 core tests green; ruff and mypy strict clean. Two existing
tests followed the names (the server's tool list, the connector skills in the prompt); the Doc
test's exact-second stamp comparison became a moment's tolerance (the git commit between the
save and the journal line made it flaky under load).

## Ran for real

The two public first-day sentences on a fresh world with the hands, Sonnet, the real model
(`../journeys/2026-10-17-2150.md`): `track_then_log` passed in 18 s (the table at once in
10.4 s, the row in 7.9 s), `watch_from_words` passed in 58 s (a module, a table, the reader
`wwr_backend_jobs`, two rows, an agent as steps). The same outcomes as on the 72 tools earlier
in the evening, through 17: the model found `world_shape`, `world_write`, `browser_script`,
`skill_keep`, `skill_run` and `agent_keep` from their docstrings alone. The app restarted on it;
Kenil's own turns on the hands are the acceptance still open (and `sync_from_words` on his say).

## Not done in this step

Steps 3 and 4 of 2b: the permission callback as the gate (`act_outward` and the deletes of the
person's own entries reaching `can_use_tool`; the journal line as a hook), the CLI route and
the `skills` tables removed, the SDK's own tools in a turn.
