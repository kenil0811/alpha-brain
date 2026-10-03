# §4.10 The code read against the docs (2 Oct 2026, evening)

*Moved verbatim from `build-plan.md` §4.10 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.10" mean this file.*


Every file under `core/alpha`, `connectors` and `desktop/src` (+ `src-tauri/src/lib.rs`) was
read in full and set against the design and this plan. The docs were corrected in place (the
italic notes in §3 and §4, the *As built* paragraphs in the design). What follows is what the
read found beyond wording: things the docs claimed that the code does not do, things the code
does that no doc said, and plain faults. Nothing here was fixed; it is the list to decide on.

**Limits that exist although Q18 says none** (all in platform code, none a setting):
automation schedules had a 15-minute floor (`world/automations.py`; **now 30 minutes by
decision, Q22**); a page read waits at most
180 s (×3 when reading to the end) and a sign-in window 30 minutes (`connectors/browser.py`);
the driver gives a page 30 s to load, 6 s to go quiet, at most 400 scrolls and stops after four
rounds with no new links, keeps 5,000 links and returns 800, 60,000 characters of text; files
over 50 MB are skipped, text cut at 400,000 characters, spreadsheets at 20,000 lines; the
pre-pack is cut at 12,000 characters; an automation's last result and the independent answer
are kept to 2,000 characters; a build is sent back at most twice over its trial. The timeouts
and sizes are the hands protecting themselves; the schedule floor was the one product limit,
and Kenil kept it at 30 minutes.

**Site vocabulary in the hands** (against §4.0 of the design, Q17), **removed the same evening
(Q23)**: `browser_session.mjs` treated `/authwall`, `/checkpoint` and `/uas/login` as sign-in
walls and knew "Show more connections" and "Show more jobs" as paging; `entity_resolve` filed a
linkedin.com URL under a `linkedin` key while table rows filed every URL under `url`, so the two
never matched; the browser `SKILL.md` had a Sites section with LinkedIn and We Work Remotely
addresses in every run's prompt. Now: wall paths are `login`, `signin`, `signup`, `auth` plus a
visible password field; paging is any "Show more …" button; `url` is the one address key and a
world folds old `linkedin` keys into it on open (`store._migrate`, tested); the skill says the
hand knows no site. Vendor markers for bot checks (Cloudflare, PerimeterX, DataDome) are
platform-level and stay. Proven by tests only; the real LinkedIn sync has not been rerun since.

**The read-only guard is narrower than §4.0 states.** Requests that would change data are
blocked only while Alpha's script runs inside `page_script`; a plain `page_read` installs no
blocking. The driver never clicks, types, submits, uploads, downloads or screenshots (it
presses "Show more" and scrolls), so a read stays read-only by the driver's behaviour, not by
a mechanism. A sign-in counts as done when the profile holds any cookie for the site.

**Trust mechanisms with holes.** `check.worth_checking` finds a turn's records through journal
entries carrying `data.record`; `records_upsert`, `page_to_table` and `reader_run` journal
counts only, so a turn that only upserted is never second-opinioned and a trial that upserted
leaves its rows behind. `provenance_of` turns an omitted `source` into `estimated`, so a model
that forgets the argument files a stated value as a guess. Rows from pipelines, upserts and
the person's edits carry `by` and `turn` only. The store enforces nothing about provenance.
Facts, notes and entities each record their source in a different format (`turn:<id>`, the
bare id, `record:<table>/<id>`); goals have none.

**The plan-first gate covers creation only.** `_gate` guards `module_create`,
`collection_create`, a new `reader_save`, `automation_create` and `source_add`. Not guarded:
`table_start` (which also creates a module when it names one that doesn't exist),
`collection_add_fields`, replacing an existing reader's script, `automation_update` (schedule,
steps, procedure), `records_upsert`, `page_to_table` outside an automation, and `run_reader`
outside a build creates a source row. `Automations.update` cannot clear `steps` or empty a
procedure.

**Entities.** Same-name candidates are returned by `resolve` and by `/api/entities/{id}` and
shown nowhere; `merge` is reachable only through an API route the app never calls and is
journaled only there; `unmerge` and `delete_note` have no caller; `_index` uses `INSERT OR
IGNORE`, so a key already owned by another entity is silently listed in the new entity's JSON
while `entity_keys` keeps pointing at the old one. `journal.entity_ids` is written by files,
calendar and the merge route, never by the tools. The calendar's first sync journals one line
per event.

**Removal.** `clear_conversation` deletes stream turns physically (the one exception to the
tombstone rule; it also removes the `proposed` rows plans point to). `remove_connection`
inspects an automation's `procedure` for the connection's readers but not its `steps`, and
leaves `sources.reader` and `records.reader` naming deleted readers. Nothing ever purges
`plans`, `threads`, person facts, entities made from tables or `meta`.

**Desktop.** `DataPage` tests field kinds `boolean` and `multiselect` while the core's are
`bool` and `multichoice`: a bool field edits as plain text seeded with "true"/"false", and the
Yes/No select, the ✓ rendering and the multichoice placeholder are unreachable. The
conversation panel sends a message scoped to the page's module but loads the stream unscoped.
`home.brief` is typed and never rendered; `client.modules/people/entity/merge/search` are never
called; `~110` CSS selectors from the old shell are orphaned; the CSP in `index.html` differs
from `tauri.conf.json` (`blob:` in img-src). Launch at login (Q2) is not built. The companion
takes focus when opened. The bundled app runs Python from the checkout it was built in
(`CARGO_MANIFEST_DIR/../..`) with a hard-coded PATH; `ALPHA_HOME` is honoured in debug builds
only; core stdout after readiness goes nowhere. Polling: Home 20 s, Claude status 60 s, the
panel 15 s or 5 s, the companion 30 s, automations 4 s while running; while a thread works the
panel re-fetches every mounted page every 5 s. Fonts come from Google Fonts. Three desktop
tests exist (rail, surface, provenance split); none for DataPage, the panel, Home, Settings,
Intelligence or the companion.

**Dead code.** `threads.session_ref` (never set; nulled on open), `modules.project` (never
read), `Plans.waiting`, `Entities.unmerge`, `Journal.forget`, `Knowledge.delete_note`,
`Browser.signin` (the blocking one), `Browser.sites`, `Browser.read(signed_in=…)`,
`Files.unwatch`, `Calendar.status`, `RunResult.raw`, the `error_max_turns` / `cut_off` /
`OUT_OF_STEPS` path from the max-turns era, `Sources.coverage(None)` (always zero), the driver
job keys `html`, `timeout_ms`, `scroll`, `max_scrolls`, `locale`, `browser` that Python never
sets; in the app `ModulePage.onGo`, `Activity.onChanged`, `initials()`, `TEXT_KINDS`,
`CHOICE_KINDS`, a duplicate `HANDOFF_KEY`.

**Smaller inconsistencies.** Two `site_of` with different meanings (`sources.py`: host minus
`www.`; `browser.py`: registrable domain), bridged by a `LIKE`; note scope by module *name*
while everything else keys on the id; `decide_fact` overwrites `recorded_at`; `record_fact`
returns an existing identical fact without updating `why` or `source`; `Collections.upsert`
ignores tombstoned rows when matching keys, so a deleted row re-synced comes back under a new
id; `_link` runs in its own transaction after the write; `documents_fts` has no delete trigger
(the purge deletes by hand); `automation_views` finds a running automation's steps by the
literal text "Run the automation"; `automation_create` opens a thread and marks it done at
once; only a hash of the rules is kept with a turn, not their text, so `alpha context` cannot
show which rules applied; the `cli.py` and `prepack.py` docstrings and the browser
`connector.yaml` tool list were out of date (fixed in this pass).

**Counts, measured (end of the evening):** 113 core tests in 12 files; 3 desktop tests; 63
tools; ruff clean; mypy strict clean (the 16 errors in three test files fixed); `tsc` clean.
