# §4.6 Memory and data foundations (built 2 Oct 2026)

*Moved verbatim from `build-plan.md` §4.6 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.6" mean this file.*


Decided with Kenil after his research on memory systems; the design is §3.5–§3.6.

- **Row history** (`250b7b4`): `record_versions` keeps a record's previous values on every
  update, upsert change and delete; `record_history(collection, id)`.
- **Rows that are people** (`250b7b4`): `collection_create(rows_are, identity_field)` and
  `collection_identify`; each write resolves the row's entity by its email or URL (zero model
  calls) into `records.entity_id`; `entity_read` lists every row that is the entity.
- **World identity and migrations** (`250b7b4`): `meta.world_id`; older files gain new columns
  on open (`ADDED_COLUMNS` in `world/store.py`).
- **Threads are records** (`2e41653`): `--no-session-persistence` on every run, never
  `--resume`; `threads.brief` written with `thread_brief`; the pre-pack's THIS THREAD section
  carries the brief and the thread's last 15 entries; AUTOMATION_RULES tell a run to keep the
  brief.
- **What the model saw** (`2e41653`): `turn_contexts` (pre-pack text plus a hash of the rules)
  per turn; `alpha context <turn>`; clearing the conversation drops its contexts.
- **Dates** (`2e41653`): conversation, matches and thread history lines read "Thu 1 Oct 21:21"
  in local time.
- **Instructions** (`2e41653`): `note_write` refuses "Standing instructions" and
  "Permissions"; `instruction_add/remove(sentence, quote)` require the person's own words from
  the turn's message; `instruction_propose` waits for a yes, which adds it with no further
  turn. Notes record their source turn.
- **Real runs** (2 Oct, on a copy of Kenil's world, Sonnet on the subscription): "Every row in
  my LinkedIn connections is a person…" → Alpha called `collection_identify`, 1,548 rows
  linked to 1,548 people by profile URL in 16.9 s; "From now on, always round calories to the
  nearest 10…" → `instruction_add` with the quote, the note's source is that message (8.8 s).
  The kept context showed dated conversation lines. Alpha's first reply overstated ("like it
  already did with Alexander Miller": that earlier answer matched by name, not by key).
- **Next:** the sleep-time pass (idempotent, versioned derivations; hard-key links across
  sources, soft matches proposed) and the scenario suite (our journeys plus a correction, a late
  arrival, a future-dated change and a private fact), then slice 3.
