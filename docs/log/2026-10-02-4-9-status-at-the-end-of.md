# §4.9 Status at the end of 2 October 2026: done, pending, what changed (items 10–11 added 3 Oct; the ordered list from here is the checkpoint's §10)

*Moved verbatim from `build-plan.md` §4.9 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.9" mean this file.*


**What changed today, in one breath.** Alpha went from "builds on a guess, runs, and calls it
done" to: it asks and proposes first, builds only after a yes and in the background, keeps every
place it reads from with a status, writes know-how as pipelines that run without a model, has
no step or time limits (the person stops), knows where every value it writes comes from, and
checks its own answers against an independent one. The three failures that drove it: the blind
ETA build (§4.7), the LinkedIn reader "concluding" a cap from one failed attempt (§4.0 of the
design), and the shake logged as a guess when the label was one search away (§4.8).

**Done (committed, tested, run for real):**
- Memory and data foundations: row history, rows that are people, threads as records, the kept
  context per turn, dated lines, instructions in the person's own words (§4.6).
- Plan first by mechanism; sources with a status and a coverage line in every report; readers
  that mark rows seen and gone and say whether they read every page; pipelines (read steps and
  tell steps) with one repair turn; background builds that continue from the brief, resume
  after a stop, and have no limits; plan cards and the sources list in the app (§4.7).
- Known, assumed or asked; provenance (`source`, `assumed`) on records and in the table page;
  the second opinion after turns Alpha worked values out and by `alpha check`; a trial on every
  plan, sent back up to twice (§4.8).
- Removal: a module's readers go with it; the audit stays.
- The app rebuilt and restarted on this (14:58).

**Pending, in order of how much they matter:**
1. **The suite of real journeys**: done (§4.11); 18 journeys on 3 Oct.
2. **The sleep-time pass and scenario suite** (A). Beliefs still go stale only by being
   overwritten; nothing links people across Gmail and LinkedIn; nothing consolidates.
3. **Proactivity** (B): triage, digest, Inbox. Alpha still never brings anything to the person
   except an automation's "Worth telling".
3a. **The write route, next steps** (§4.13, §4.15): mostly done on 2–3 Oct (send and LinkedIn
   message journeys, upload steps, §4.17–§4.19). Still open: sentences for sends after real
   approvals; saying on the card when a dry run already leaves something behind (autosave).
4. **The old estimates**: the four food rows logged before today stay estimates until the person
   logs or asks about them again; the check only runs on new turns. A sleep-time pass could
   re-check old estimates; not decided.
5. **Cost of the check**: two extra runs on the subscription after every turn where Alpha
   worked values out, and three model runs per trial. Fine for one person; worth measuring over
   a week before anyone else uses it.
6. **Readers still show "not_built" after their reader ran** in one case (the Accounting Biz
   source, 13:50). Cause found on the code read: `sources.ran` updates rows `WHERE reader = ?`,
   and a source added before its reader keeps `reader = NULL`, so the run creates a second
   source row for the reader instead of claiming the first. Fix: claim by URL or site when the
   reader's row is first created. Not fixed.
7. From §4.4, unchanged: LinkedIn reads the whole list daily (reading only what is new would
   be gentler); desktop-control and app-scripting hands not built; `page_to_table` still in the
   platform; the photo-vs-name driver fix in `git stash`; not shippable to anyone else (venv,
   self-signed, subscription login needs Anthropic's approval); the Agent SDK's flag support
   unverified.
8. **Housekeeping**: a stray `alpha serve --port 53911` from an earlier session runs against a
   scratch world (kill it); the calendar's real first read has never been run.
11. **The memory round, what is left (§4.23, §4.24):** skills are one table since §4.24; left:
   the Agent Skills folder export, promotion from repeated reads, fewer tools by principle, a
   routing journey, "move to…" in the panel, measuring the per-turn context, noticing over what
   Alpha reads, readers that declare people, a sleep-time pass.
10. **Daily runs on a sleeping Mac (§4.22, 3 Oct):** fixed in code (awake gate, keep-awake
   while running, side-by-side runs, the broken-reader result says to repair, not rerun); the
   first real check is the next morning's 07:00 runs.
9. **From the code read of 2 Oct evening (§4.10).** Decided and done the same evening: the
   schedule floor is 30 minutes (Q22); the site vocabulary is out of the hands (Q23); `just
   lint` is clean again; the trust holes are closed (§4.12). Still to fix: the dead code list
   and the smaller inconsistencies in §4.10. The app must be
   rebuilt (`just app`) to pick the evening's changes up; Kenil's world folds its old
   `linkedin` keys into `url` on the next open.

**Decisions taken today that bind what follows:** never build on a request, propose and wait
for the yes (by mechanism, not prompt); know-how is code (pipelines, readers), the model is for
repair and judgement; no limits anywhere, the person stops; nothing per use case; a knowable
value is looked up, an unknown is asked about or assumed out loud; "it ran" is not "it works".
