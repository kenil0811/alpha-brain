# §4.23 The wiki, noticing, and context by relevance (built 3 Oct 2026, afternoon; §3.7 points 2–4)

*Moved verbatim from `build-plan.md` §4.23 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.23" mean this file.*


**The wiki** (`world/knowledge.py`, `world/store.py`). Notes are pages: scopes `person`,
`module:<name>`, `topic:<slug>` and now `entity:<id>` (a person or company), each with a
one-line `summary` (given, else the page's first line of text) for the index.
`append_to_page(scope, title, heading, line)` adds one line under a heading, makes the heading
or the page when missing, never repeats a line, and never touches the person's own text
elsewhere on the page. `index()` is every page in one line. The model's `note_write` takes
`entity:` pages and a `summary`. `/api/people` carries each page's line; `/api/entities/{id}`
the page; `POST /api/notes` a summary.

**Context by relevance** (`context/prepack.py`). WHAT ALPHA KNOWS: the index, every page in
one line (up to 200), bodies by `note_read`. THIS MODULE'S PAGE in full (40 lines) on a
module's turns. WHO THE SENTENCE NAMES: a card for each person or company the sentence names
(by name, alias or a first name of four letters or more, whole words; retrieval only, never
routing), at most three: keys, page summary, facts with state and source, last seen in the
journal. WHAT WAS SAID <DAY>: a sentence that names a day ("yesterday", "on Tuesday", "3 days
ago", "last week", "today") gets that day's turns and its full-text matches narrowed to the
day (`journal.search(since, until)`, `journal.between`). This is the fix for the one memory
journey that failed in the baseline (§4.20).

**Noticing** (`runtime/noticing.py`; hooked after every person's turn in `Turns.start`, beside
the second opinion, and in line in the journey suite). A no-tools Haiku run (the System One
route, `kind="judge"`) reads one exchange (when, what was said, what Alpha replied, who it
names, KNOWN: the person's facts, the named entities' pages and facts, the module's page) and
answers JSON items: a **fact** (about the person or a named person or company; stated in the
person's words → accepted with the quote as `why`; inferred → suggested for a yes) or a
**note** line (one past-tense sentence, kept dated under "Noticed" on the entity's or module's
page). Nothing already known is kept again; a question's wording is not a fact; standing
instructions and Alpha's own numbers are out. Who an item is about: a named entity by exact
name, alias or first name; several of one name → nothing (the same-name rule); a new full
name whose kind the pass is sure of → a new entity with the turn as source; a first name
alone → nothing. Everything kept is one `noticed` journal entry with the turn, the facts and
pages it touched and the entities it names (the trail; it shows on the person's timeline).
Small turns (a yes, a tap, under four words) are not passed. Not done: a pass at a
conversation's close (per turn covers it), and noticing over what Alpha *read* (pages, mail)
rather than what was said.

**The app.** People & Companies is back on the rail (Home · Activity · People & Companies ·
modules · Intelligence · Settings): the list (people, then companies; each one's page line or
last mention; a search) and a page per entity: the wiki page (Write / Edit, saved as
`entity:<id>`), facts (accepted as a list; suggested with Yes / No), Might be the same (same
name, no shared key; "Same person" merges, the first time the app calls the merge route), and
everything in the journal that names them. `knownSurface` keeps `people` and `entity` places.

**Tests.** `test_noticing.py` (small turns skipped; stated kept and inferred waits; known not
kept again; a line lands on the person's page with the trail and no duplicates; a first name
alone makes nobody, a full name does; two of one name are left alone; a module line; garbage
keeps nothing), `test_memory.py` (a page's index line and growth under a heading; the pre-pack's
index and cards; a sentence naming a day). 159 core tests, 3 desktop tests; lint and types
clean. The background-check test now expects the noticing run beside the check.

**Found while checking the routes on a copy of Kenil's world.** `/api/people` returns 13
entities (7 documents, 13 people; none of the 1,551 LinkedIn connections). The "rows are
people" identity (§4.6) is a mechanism no live table uses: `records.entity_id` is null on every
row, and the connections, emails and listings tables carry no identity, so the People page
shows only who Alpha resolved by hand (`entity_resolve` in turns and automations). The §4.3
line that said 1,548 connections were people was true of a test world, not his; corrected. What
follows from it: a person named in a sentence gets a card only if Alpha ever resolved them, and
Vikas Badami, with a table of his emails, has no card. The fix belongs with the skills slice
(a reader that writes people declares it) or a sleep-time pass; not done today. Also fixed on
the way: a page scope `entity:` with no id was accepted by `POST /api/notes`; a page's entity
must now exist.

**A mistake made while checking, recorded so it is not made again.** The route and
browser-pane checks ran a second core on a copy of Kenil's world made with `cp` of
`world.sqlite` alone. The world is in WAL mode and the day's commits (4.7 MB) were still in
`world.sqlite-wal`, so the copy was hours stale: in it two automations were still due, and the
copy's scheduler ran them for real through the browser hands (Gmail and LinkedIn read in Kenil's
signed-in profiles, a reader repair turn on the subscription), twice, each leaving an orphaned
model run when the temporary core was stopped; both were killed. Nothing was sent or written
outward (automations cannot), and nothing touched his live world. Rules from it: a copy of the
world is made with SQLite's backup (`backup.py`, the suite's `copy_home` already do), never
`cp`; and a core started for a check runs with `alpha serve --no-background`, which keeps the
scheduler, the second opinion and noticing off (added). The web check itself lives in
`.claude/launch.json` as `alpha-brain-web-check` (Vite on 1430 against a core on 53820).

**Journeys** (`docs/journeys/2026-10-03-1256.md`, then `2026-10-03-1306.md`). The seven
memory journeys after the slice: **6 of 7**. Yesterday (the baseline's one failure) **passes**:
"Yesterday (Friday 2 Oct), you said one thing specifically about Vikas: 1:02 PM, remind me that
I promised Vikas the financial model by Friday", 21 s; the WHAT WAS SAID YESTERDAY section did
it. The new noticing journey passes (95 s): coffee with Vikas Badami, then "what's going on
with vikas these days?" answered with the move to Bangalore and the fintech plan beside his
emails and advisory context; the report cannot tell whether the page line came from noticing or
from the turn's own model, which also said it had "linked it to Vikas Badami's profile" (the
scratch world is not kept), and the answer added "with you" to the co-founding, which the person
had not said. Old fact (16 s), correction (42 s), two sources (76 s) and the follow-up (78 s)
pass as before. **Failed once: who emailed** (Sara Ramos), which the baseline had passed. Checked
on a copy of the world: the pre-pack for that sentence held nothing about her in either run,
because the world holds nothing about her (reading Gmail wrote no rows; her only trace is one
reply in the journal), and the baseline's answer came from the model choosing to open Gmail and
the calendar live. What the pack did show was that the full-text matches for the sentence were
noise ("deal", "with", "last", "her" matched deal listings and connections): `fts_query` now
leaves function words out (test added), and the day section is trimmed (14 turns, 220
characters) so it cannot push the matches past the 12,000-character cap (that pack was 11,884).
Rerun after the change: who emailed and yesterday **both pass** (52 s, 36 s). Across the two
runs every memory journey has passed once; the who-emailed case varies with the model's choice
to look, which no pack fixes until Alpha keeps what it reads about people (noticing over what
Alpha reads, or readers that declare people: §4.9/11).
