# §4.24 Skills, the one unit of know-how (built 3 Oct 2026, afternoon; §3.7 point 7)

*Moved verbatim from `build-plan.md` §4.24 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.24" mean this file.*


**One table.** `skills` (`world/skills.py`, `store.py`): name, kind (`read`, `act`, `run`),
site or module, url, description, `when_to_use`, the kind's own body (a read skill's script,
`to_end`, `whole`; an act skill's effect, steps, verify, fields; a run skill's steps), version,
health, how the last run went, and `source` (the turn that wrote it). Readers and procedures
were tables of their own until today: a world opened on this code moves them into `skills`
and drops the old tables; an automation's saved steps become a run skill named after its title
(`run_daily_deal_tracker_read_all_broker`), and `automations.skill` points at it (the old
`steps` column is emptied). `Readers` and `Procedures` stay as the adapters the rest of the code
calls (`world.readers.save/get/ran`, `world.procedures.*`), over the one table, so nothing else
moved; `world.skills` is the whole. A run's outcome lands on its run skill's health too.

**Composition.** A pipeline step may be `{"run": skill}`: another run skill's steps, in place,
at most three deep; a skill cannot call itself, checked when it is saved. Removal takes a
module's run skills with its automations; a sign-in's removal takes its read and act skills.

**Discovery.** WHAT ALPHA CAN DO in every pre-pack: every skill in one line (kind, name, site
or module, version, health when not ok, effect, description, when to use; up to 80), with
the rule to use one before writing another. Tools: `skills_find(text, site, kind)` (by words,
by site matched as a host suffix, by kind) and `skill_read(name)` (script or steps, fields,
verify, health, and its notes) replace `readers_list` and `procedures_list`; `reader_save` and
`procedure_save` take `when_to_use`. **Site notes** are a page of the wiki with scope
`skill:<name>` (`note_write`), shown by `skill_read` and on the Skills tab. The turn's rules
now say: a list read before has a reader, run it; a task done before has a procedure, use it,
generalise it with fields when it was too narrow; `procedure_save` says a procedure is for the
task, never for one recipient (the 2 Oct failure: three Gmail procedures, one of them "the
most recent Barcelona draft to Sania").

**The app.** Intelligence › Skills lists the skills (Reads / Does / Runs, where, version, what
the effect means, last run, when to use, the problem when broken, Alpha's notes) and then the
Hands (the built-in connectors and their tools); the API's `skills` is the one table and the
connectors moved to `hands`.

**Tests** (`test_skills.py`): an older world's readers, procedures and pipelines move into
skills once and the old tables go; a pipeline is a run skill named after its automation, a
second of the same title gets `_2`, an update replaces its steps and raises its version, a
failed run marks it broken; a step may call another run skill but never itself; the index,
find by site, words and kind, the kind lock on a name, site notes, `skills_find` and
`skill_read`, the pre-pack's WHAT ALPHA CAN DO; removing a module takes its run skills.
165 core tests, 3 desktop tests; lint and types clean. The journey suite gained
`no_new_skills` (nothing written or rewritten since the journey began) and a `procedure`
field on the action check.

**Not done.** Promotion from verified runs beyond what exists (a read skill is kept only after
a real run, an act skill's health comes from its runs; nothing promotes a repeated manual
read into a reader by itself). The Agent Skills folder export (one `SKILL.md` per skill that
Claude Code could load natively). Inputs and outputs as declared fields on read and run
skills (a read skill's outputs are its rows' keys; a run skill's inputs none). Fewer tools by
principle: the count is 70, two list tools gone, two skill tools in.

**Journeys** (`docs/journeys/2026-10-03-1338.md`, `2026-10-03-1342.md`). `skill_reuse`: "draft
an email in gmail to kenilrameshshah.krs@gmail.com with the subject 'Skill reuse check'…" —
Alpha answered "Drafted (reused the existing `gmail_draft` procedure)", the action went through
`gmail_draft`, and `no_new_skills` held: nothing written or rewritten (29 s). The first run of
it had the action right but `no_new_skills` listed the three run skills the migration itself
had made, because the copy came from a world the old app had not yet migrated and the check
counted the migration's own work as the journey's; on a migrated world it passes. `eta_daily`,
the deal tracker's pipeline now living in a run skill, ran 15 of 15 sources in 98 s and
reported 3 new, 3 gone: the move changed nothing in how a pipeline runs. **Found on the live
world:** the first naming rule for run skills cut names mid-word
(`run_founding_engineer_listings_yc_wellfo`) and kept schedule words; the rule now keeps the
words that carry meaning, cuts at a word boundary, and renames a run skill named by an earlier
rule on open, with `{"run": …}` references following; Kenil's three pipelines are
`run_deal_tracker_broker_sources_listings`, `run_founding_engineer_listings_yc` and
`run_gmail_emails_vikas_badami`. Intelligence › Skills checked in the browser pane against a
background-free core on a backup copy: 28 skills (3 Does, 22 Reads, 3 Runs) and the three
hands.
