# §4.2 After slice 2: what was built (1 Oct 2026, 10:13–23:44, 20 commits)

*Moved verbatim from `build-plan.md` §4.2 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.2" mean this file.*


Most of it came from using the app on the two judging journeys and from Kenil's reviews.

- **One conversation, building in it** (`d4fa35d`, `98dd953`). An explicit "I want to build…"
  is researched and built in the same conversation; Alpha's questions are closed by the person's
  next message. The deepen side threads were removed.
- **Automations** (`98dd953`): `automation_create/list/update` tools; schedules "every Nh/Nm",
  "daily HH:MM", "weekly mon HH:MM"; a scheduler in the core (`runtime/automation.py`, checks
  every 30 s, claims a run before starting it); each automation has its own thread and runs with
  AUTOMATION_RULES; "worth telling" lines become `noticed` entries. Intelligence › Automations and
  module Settings show a sentence, a switch and Run now with live steps; a run's note is shown
  only when it failed (`9f561bf`).
- **The capability model** (design §4.0, `1eee620`): the platform builds a few universal *hands*
  and the guardrails, which Alpha can't change; Alpha writes, tests and repairs the *know-how*
  (site readers, app connectors); effects are classed read / write inside Alpha / write outward
  (asks first) / never (passwords, money, permanent deletion), enforced in the process boundary;
  a gap is a hand (system owner for now), access (the person) or know-how (Alpha).
- **Browser hand** (`1c9e60c`, `1f7fccb`, `f5993a0`, `bf2a5e8`, `afa8f11`): `page_script` runs
  Alpha's own JavaScript in a page; reading to the end scrolls until four rounds bring no new
  links; non-GET requests are blocked *only while Alpha's script runs* (LinkedIn pages its list
  with a read-only POST, so blocking by method during loading cut the list to 10). A sign-in
  covers every site its window passed through (gmail.com → google.com), recorded in
  `alpha-signin.json` next to its profile; when a page asks for a sign-in no sign-in covers,
  Alpha first tries the sign-ins it holds and records the one that works.
- **Readers** (`1f7fccb`, `4582db8`, `world/readers.py`): `reader_save`/`reader_run`; a reader is
  health-checked before it writes (no rows; under 0.5× the last good run; under 0.75× the rows
  the table holds; required fields missing on over 20%) and a broken one is repaired by Alpha in
  the automation's run. `page_to_table` is refused inside automations. Connector `SKILL.md`
  bodies now reach the model (`skills_text()`).
- **Workspace from Kenil's review** (`1eee620`, `8aeb7ea`): People & Companies removed (generic
  only), connections only in Intelligence, module Activity shows everything 50 at a time, the
  schedule lives in module Settings, no About-you page, no sample rows in Summary, the "Ask
  Alpha" tab on the right edge.
- **Tables** (`2ac0cf0`, `48c7c90`): the page loads every row (the model still reads 500 at a
  time) and pages them itself; rows per page default to what fits the window, a fixed size can
  be chosen; rows scroll inside the table with the header and totals held; totals and the
  module summary count every row.
- **Companion** (`48c7c90`): the page reports where it is drawn and the host lets clicks
  through everywhere else (its transparent corners covered the workspace's pager).
- **Removal and the audit** (`98ee832`, `bf2a5e8`, `485657d`, `8823e34`; `world/purge.py`):
  `remove_module` and `remove_connection` delete the thing and what exists because of it
  (tables and rows, readers, automations, notes, goals; a sign-in's browser profile on disk,
  documents, events) but **never the journal**: each removal is journaled ("Removed X: …" with
  `data.removed`), threads keep their record but lose the resumable session, open questions
  close, and `Journal.mark_removed` marks history about removed things wherever Alpha reads it
  (search, journal tools, pre-pack), with a rule that the journal is history.
  `clear_conversation` deletes said/replied by design. Connection removal confirms in its own
  row in the same words Activity records.
- **Questions** (`9e444b5`): every Needs-you question can be dismissed; sign-in requests close
  themselves when signed in or asked again.
- **Settings** (`08ad89b`): Claude (status, Install, Sign in through Claude Code's browser
  login, Sign out), companion and appearance (the theme left the rail), your data (folder, Show
  in Finder, Back up now via SQLite's backup), defaults (rows per page); "Connect Claude to
  start" on every page while Claude Code is missing or signed out.
- **Runtime values then**: `--max-turns 80`, timeout 900 s, Sonnet; stream turns stateless,
  automation threads resumed their own session. *(All three superseded on 2 Oct: no step cap, no
  time limit, §4.7; nothing resumed, §4.6.)*
