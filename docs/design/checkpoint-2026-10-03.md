# Checkpoint, 3 October 2026

Kenil: "take a step back and reassess: where we stand, how aligned with the vision, is
everything in good shape, are docs aligned, are we really building a good and usable
product, is it scalable and maintainable." This is that assessment, measured on the repo and
on Kenil's live world at 14:00, with three independent code reviews (core, docs, desktop)
behind it. It is blunt where the evidence is; where I could not measure, it says so.

## 1. The verdict in one paragraph

Three days of building (63 commits since 1 Oct) have produced a system that holds together:
one world store, one way in, a real write route with approvals, know-how Alpha writes and
repairs itself, automations that run without a model, a memory layer that passes 6 of 7 of its
own benchmarks, and an app Kenil uses daily. It is aligned with the vision on the things the
vision calls fundamental (generic, one world, one way in, no knobs, local, evidence, known or
asked). It is **not yet the product the vision describes**: the companion is a window, not a
mouth that speaks up; nothing proactive exists beyond an automation's "worth telling"; people
are barely a thing in the live world (20 entities against 1,551 connections); a turn takes
30 s at the median. The code is sound but lopsided: two files hold 2,300 of 11,000 lines, the
desktop has three tests, and the documentation has become a 17,600-word diary that no new
developer could use to find the current state in under an hour. None of this is a crisis.
All of it is the kind of debt that decides, over the next month, whether this stays buildable
by one person with agents.

## 2. Measured

| What | Number |
|---|---|
| Core Python | 10,954 lines (tools.py 1,240; server.py 1,062; collections.py 719; store.py 581; suite.py 558) |
| Tests | 165 core (3,693 lines), 3 desktop; lint and types clean |
| Desktop | 4,973 lines TS/TSX, 748 CSS, 565 Rust; driver 559 JS |
| Tools the model sees | 70 |
| Journeys | 18 defined; latest runs 6/7, 2/2, 1/1 |
| Commits | 74 total; 14 / 38 / 11 on 1 / 2 / 3 Oct |
| Smells | 35 `except Exception`, 5 `type: ignore`, 0 TODO |
| Docs | design 588 lines; build-plan 1,485 lines, 17,622 words; 10 journey reports |
| Live world | 4.7 MB + 4.7 MB write-ahead log; 53 MB browser profiles; 6.7 MB action screenshots |
| Journal | 1,044 entries; 2 Oct alone: 392 reads, 163 did, 77 replies, 40 sentences from Kenil |
| Records | 2,557 (connections 1,551; deals 837; jobs 118; the rest under 30) |
| Knowledge | 20 entities, 6 facts, 6 pages (all module pages), 7 documents |
| Know-how | 28 skills (22 read, 3 act, 3 run), 5 automations (4 on), 34 sources (22 working) |
| Work | 8 plans (6 done), 12 actions (10 done, 2 declined), 0 open questions |
| Turn latency | 1 Oct median 26 s, p90 192 s; 2 Oct median 34 s, p90 186 s, max 1,354 s |
| Context per turn | 9.1k–11.7k characters (2.3k–2.9k tokens) after today's fix; before it, every pack on this world was cut at the 12,000 cap |
| Model runs per turn | up to 5: the turn, the second opinion (two), noticing (one), routing (one) |

What I could not measure: how much of Kenil's use goes through the companion versus the
panel (turns do not record their origin); subscription usage and rate-limit headroom; how
often a real daily run breaks once the sleep fix (§4.22) has had a week.

## 3. Against the vision, principle by principle

The design's ten principles (§1) and what the code does:

| Principle | Holds? | Evidence |
|---|---|---|
| 1 Generic | **Yes** | No domain in the platform; site vocabulary out of the hands (Q23); skills are Alpha's. |
| 2 One world | **Yes** | One SQLite file; cross-links by entity. But 0 of 2,557 rows link to an entity: the cross-linking exists as a mechanism no table in the live world uses. |
| 3 One way in | **Yes** | `turn.ask` for every sentence; conversations and routing since 3 Oct. |
| 4 Do now, deepen later | **Yes** | Plain actions at once; anything standing goes plan → yes → build (Q19). |
| 5 Reads free, writes ask | **Yes** | Actions with dry-run previews; prepare-level standing sentences (Q24). |
| 6 Quiet by default, proactive while away | **No** | Nothing proactive exists: no triage, no digest, no sleep-time pass, no notifications. "Worth telling" from automations is the only unprompted line. |
| 7 No knobs | **Yes** | One floor (30 min between runs, Q22); everything else behaviour. |
| 8 Local-first | **Yes** | Only the model route leaves the Mac. Browser profiles with session cookies sit unencrypted under Application Support (53 MB). |
| 9 Evidence over cleverness | **Yes** | Verbatim journal, FTS, fixed schedules, readers kept only after a real run. |
| 10 Known, assumed or asked | **Yes** | Provenance on rows; second opinion; build trials. |

**The gap, in one sentence:** the vision's product is "a companion that becomes more useful
the longer it runs, quiet, proactive while you are away"; what exists is a very capable
workspace with a chat that answers when asked. §5's four entries: 1 built, 2 partly, 3 and 4
not started. §8's Today lane with a digest, the person page with keep-in-touch, decide-once
on recurring senders, ⌘K, Undo: not built. The memory round (§3.7) closed most of the memory
gap this week; the proactivity gap is untouched since 30 September.

## 4. Is it a good, usable product today?

**What works, for real, every day.** Four daily automations (LinkedIn connections, 15 deal
sites, 4 job boards, Gmail from one sender) run without a model and report what changed. Kenil
asks questions about his tables and gets answers from the data. Drafts and sends go out through
procedures with previews (9 sends done). Files come in and out. Builds happen in the background
with a plan first. The second opinion caught a wrong calorie count on day one.

**What makes it feel slow or brittle.**

1. **Latency.** A median turn of 30 s, a p90 of three minutes. Resumed conversations answer
   in 6 s where fresh ones take 18 s, which shows where the time goes: a fresh `claude -p`
   with a 3k-token pack and 70 tools. A second brain that takes 30 s to say how much protein
   is left will be used less than one that takes 3 s. The fix is not one thing: fewer tools in
   the manifest (70 is a lot for the model to read every turn), a smaller pack for small
   questions, the judge answering table questions without the full model, and keeping the
   session warm.
2. **Cost per turn.** Up to five model runs per sentence. On a subscription this is "free"
   until it hits the rate limit; nobody has measured when. The second opinion and noticing are
   the right ideas; they need a budget-free throttle by behaviour (noticing only when the turn
   had new content; the opinion only when a value was worked out, which is already so).
3. **The first-run experience is unknown.** Install, sign in to Claude, connect a site: proven
   by tests only (build-plan §4.3). Nobody but Kenil has run it.
4. **Breakage is visible but not always understood.** Yesterday's run shows the pattern:
   a sleeping Mac made a sound reader look broken, and Alpha rewrote it. Activity showed three
   failures and no cause. The system now avoids that one cause; the general case (Alpha
   explaining *why* something failed, in the person's terms) is weak.
5. **People are not first-class in practice.** 20 entities, 6 facts, no page about any
   person. The People page is correct and nearly empty. Nothing links Kenil's 1,551 connections
   or the senders of his mail to people, because no reader declares its rows as people and no
   pass does it afterwards.

**The honest usability score:** a strong internal tool for its builder; not yet something to
hand to a second person.

## 5. Is it scalable?

For its stated scope (one person, one Mac) the store is not a concern: SQLite with FTS at
1,000 journal rows a day is 365k a year, well under where it slows. What will not scale as is:

- **One Chrome profile per site, one run at a time.** Every LinkedIn read takes the lock;
  a 2.5-minute scroll of 1,551 connections daily is already the slowest thing in the system
  (§4.9/7: read only what is new). Ten sites with daily reads at human pace is an hour of
  browser time a day.
- **The pre-pack cap.** 12,000 characters was right with 12 sections; today's index sections
  filled it and cut the matches. Fixed by compacting, but the budget is now spent: the next
  section added will cut something again. A per-turn budget by section, or a cap by what the
  sentence needs, is due.
- **Threads in one process.** Builds, automations, turns, checks and noticing are Python
  threads sharing one SQLite connection behind a lock; a slow model run blocks nothing, but a
  crash takes everything, and `caffeinate` plus a daemon thread pool is not a job system.
  Fine for one person; the first thing to change for a second.
- **The desktop polls.** Several components refresh on timers (see the desktop audit); at
  idle this is cheap, with a turn running it is several requests a second.
- **Shipping.** The app runs Python from the repo's `.venv`, is self-signed, and signs in to
  Claude through a route that needs Anthropic's approval for a third-party app. None of this
  is a surprise (Q1, §4.3); all of it stands between "works for Kenil" and "works for anyone".

## 6. Is it maintainable?

**Good:** types and lint clean; 165 tests that run in 7 s; every slice has a journey; a
removal story (purge) that tests prove; the rule that docs and code move together; small
modules for most things; docstrings that explain why.

**Not good:**

- **Two giants.** `mcp/tools.py` (1,240 lines, 70 tools, one class) and `api/server.py`
  (1,062 lines, routes plus `Turns` plus views plus a module-level `_WORLD_FOR_VIEW` global).
  Every slice this week touched both. They should be packages: tools by kind of thing,
  routes by surface.
- **Broad excepts.** 35 `except Exception`; most log and carry on, which is right for
  background work and wrong when the person is waiting for an answer that then never comes.
- **Three audits' findings** are in §8; the core review, the docs review and the desktop
  review each name what they would fix first.
- **The desktop has three tests** for 5,000 lines. The assistant panel and the module page
  carry the most state and have none.
- **Documentation.** The design doc interleaves intent with *As built* paragraphs that have
  grown to half its length; the build plan is a dated diary with the state table (§4.3) and
  the pending list (§4.9) buried at lines 438 and 648 of 1,485. The rule in `CLAUDE.md`
  keeps them true but not usable. See §7.

## 7. Are the docs aligned?

Aligned in substance: every slice this week ended with its As built paragraph and its build-plan
section, and the docs review (§8) found only small drift. Not aligned in form: a new session
reads README → As built paragraphs → §4.3 → §4.5 → §4.9 → git log, as `CLAUDE.md` says, and
that is 40 minutes before the first line of code. Three changes would fix it without losing
anything:

1. **`docs/state.md`**, one page, regenerated every session: what is built, what runs for
   real, the counts, the pending list in order. The thing a new session reads first.
2. **The design doc holds intent only**, with one status line per section pointing at
   `state.md`; the As built paragraphs move into the dated log.
3. **The build plan becomes `docs/log/`**, one file per day; §4.3/§4.5/§4.9 stop existing as
   sections and live in `state.md`.

This is a decision for Kenil (it changes the rule in `CLAUDE.md`); recommended.

## 8. The three reviews

AUDITS_PENDING

## 9. Found and fixed during the checkpoint

- The pre-pack was being cut at the cap on every sentence on Kenil's world: the skills index
  added today took 4,335 characters and the module page up to 4,121, and the matches went.
  Read skills are now one list by site; the module page is capped at 1,500 characters; packs
  measure 9.1k–11.7k, none cut (`5a0c918`). The cap itself is the next thing to decide.

## 10. What I would do next, in order

1. **Decide the docs' shape** (§7) and do it in one session: `state.md`, the log, the design
   as intent. Every later session gets faster.
2. **Split the two giants** (`tools.py`, `server.py`) into packages with no behaviour change,
   under the tests that exist.
3. **Make turns fast.** Measure where the 30 s goes (CLI start, tool manifest, pack, model);
   cut the tool manifest the model sees per turn (by principle: fewer, composable); keep
   sessions warm; answer table questions through the judge where a rule plus Haiku can.
4. **People for real.** Readers declare their rows as people (connections, senders); a pass
   links existing rows; the People page fills; cards appear for whoever is named.
5. **Proactivity, the smallest honest version.** A digest at two fixed times from what
   automations and noticing found, as cards on Home. No notifications yet (Q7).
6. **Then** the rest of the memory round's leftovers (routing journey, "move to…", noticing
   over reads), and the first-run experience on a clean Mac.
