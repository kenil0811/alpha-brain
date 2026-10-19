# The prompt and the context, step 2: B2's start layer, B4 on demand, B5 the pack gone (19 Oct 2026, night)

Kenil: "Yes, start step 2 (B2's content, B4, B5) as in the agreed proposal; tell me before
restarting my app." Step 1 is committed (`8d88bbe`). `snapshot` off, also part of step 2, was
brought forward into step 1 with the restored paragraph 3. Nothing here is committed.

## B2: the start layer's content

`context/layers.start_layer`, given when a session is made and again after a compaction:
- **Who the person is:** the profile facts, and the Profile note whole (it was clipped at 800
  characters).
- **Their instructions:** the standing instructions (ALPHA.md, which modfiles keeps both ways
  with the note) and the Permissions note, both whole, never clipped. The gated notes rule
  (`knowledge.GATED_NOTES`) is unchanged.
- **Active goals**, as before.
- **A map:** every module with its tables and their rows, one line each, the module of the
  turn first. No fields; they are one query away (B4).
- **What Alpha can reach** (connections and `grants.describe`), **what it can do** (the
  skills, up to 120, one line each) and **what it knows** (the wiki's index), as before.
- **The module's NOTES.md, whole** (it was clipped at 1,500 characters and 40 lines).
- **An agent's own thread** (brief and history) for a run, as in step 1. B7 makes it the run's
  own start layer.
- **Every open card.**
- **The checkpoint, for a fresh session** (question 5): "WHAT WAS GOING ON HERE BEFORE THIS
  FRESH SESSION". It is no longer put in front of the person's sentence. The sentence the
  model gets is now the person's own.

On a copy of his world the start layer is 4,340 characters (the pre-pack was 6,000–10,000)
and the turn layer 2,757, most of it the work-items roster until section C.

## B4: on demand

- **A `fields` view** beside `tables`: (table_name, field, kind, title, unit, choices,
  relation, required), one row per field of every table, read from the tables' schemas.
  - The spec named the column `table`, but `table` is SQL's own word and `WHERE table = ...`
    is a syntax error in SQLite. So it is `table_name`.
  - It adds unit, choices and relation, which the old fields line carried.
- **`world_query`'s words** name the `fields` view ("a table's fields are SELECT * FROM fields
  WHERE table_name = '...'") and the `journal` view's `at` ("what was said on a day is one
  query on its at"). The `people` line came with Q100.
- `note_read` stays as the way to a wiki page; the index stays in the start layer. No new
  hand.

## B5: the pre-pack and its limits gone

- **Deleted:**
  - `context/prepack.py` (499 lines), with its budgets, shrink order, `_assemble`, `_fit`,
    `MAX_CHARS` and `table_line`;
  - `limits.toml [prepack]` and `[prepack.budget]`;
  - `config.Prepack`.
- **In its place, `context/layers.py`:**
  - `start_layer` and `turn_layer`, plus `given` (both, as a new session gets them);
  - the line builders that survive: clock, `when`, `day_named`, `entities_named`, the map,
    the skills lines, the delta, the matches.
  - The one count left from the pack, an agent thread's history (15), is now
    `limits.toml [views] thread_history`, with its why.
- **Kept under other names, and why:**
  - `section_of` is now `layers.part_of`. Columbo and the suite's judge read what a turn was
    given (`turn_contexts`) by a part's title, so the reader stays. The spec said it goes with
    the pack.
  - `_clip` is now `layers.one_line`, for the lines the spec keeps as they were: a skill's
    description, a match's snippet, a page's summary in the index, a delta line. No section
    and no note is clipped any more; nothing has a budget; the whole has no cap.
- **Codex** (Q32's route, no hooks) now gets the layers in its `AGENTS.md`: the start layer
  when the run is not resumed, the turn layer always. Before, it would have had the fixed
  prompt alone.
- `alpha prepack` is now `alpha layers`. CONTRIBUTING's layout line, `journal_read`'s,
  `skills.index`'s and `grants.describe`'s words no longer name the pre-pack.

## What ran

- **Tests:** core 432 passed; lint and types clean.
  - Rewritten: the map names each table with its rows and no fields; the `fields` view gives
    them; 1,200 characters of standing instructions are given whole; a long index is given as
    it is. The fresh session's checkpoint is read from its start layer; the sentence stays
    the person's.
  - New: Codex is given the layers.
- **New journeys** for B2's and B4's proofs: `standing_instructions_whole`, `said_on_a_day`
  and `fields_from_the_view`. Also a `note` seed kind, and a turn seed `day: tuesday` (the
  last such day before today).
- **Journeys:** every journey that does not act in his accounts, 40, each alone on its world.
  Before the commit, 7 had run:
  - six passed: the three new ones (`docs/journeys/2026-10-19-2326.md`, `-2327.md`,
    `-2328.md`), `track_then_log` (`-2330.md`), `watch_from_words` (`-2331.md`) and
    `reminder_fires`;
  - `remove_asks` (`-2335.md`) failed on its reply's wording alone. The card was asked and the
    yes given, the row went, and the reply said "I took the two eggs ... out", which the
    check's /removed|gone|deleted|taken/ does not match.
  - The other 33 run on a frozen copy of the commit (step 3 being built meanwhile); their
    results are in step 3's log.

## Kenil's look

Restarted on his word ("restart now"): the core came up at 23:33 BST with no errors. His
word: "ok looks good, no need to wait for journeys for now". The journeys were still running
then.

## Numbers (`just stats`)

- 432 core tests, 238 desktop tests; lint and types clean.
- 70 tools; 50 journeys defined.
- Core 29,005 lines (75 fewer than step 1), tests 11,262.
- 298 commits before this one.

## Committed

On his word ("Yes: commit step 2 with its docs, move the remaining journeys to a frozen copy
of that commit, and start step 3"): the commit after `7220475`.
