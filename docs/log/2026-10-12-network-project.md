# Network as a project, the companion answering by default, Second Brain grouped (12 Oct 2026, Q48)

Branch `feat/network-project`, off `feat/dashboard-cards` (PR #9).

## What the owner asked (12 Oct)

- "I asked my LinkedIn to be merged with Network, I don't see it." In the journal, Alpha had
  answered twice that there was no Network module and changed nothing. Network existed only as a
  window page, and People stopped at 500 people.
- When Alpha needs input, answering is the default: no Open or Answer button in the companion's
  bubble, and a click loads the screen Answer opens. In the companion's chat header, left of the
  expand arrows: **Open** with "in platform" beneath.
- In Second Brain's graph: projects and the next layer in them, grouped. For Network, the large
  organisations that hold most people, without clutter.
- A standing rule: a tab to the right is the parent of the tabs to its left (Organizations of
  People). There was none; it is now rulebook rule 32.

## What was built

- **Core:**
  - `Modules.network()`: a real Network module, made once at `alpha serve` start (or taken
    over from one already called Network), known by its id in `meta`. Once the person removes
    it, it is not made again. Nothing can be moved inside it.
  - `module_merge` (`Modules.merge`): everything a module holds (tables, the modules inside
    it, goals, automations, sources, skills, threads, documents, its page) moves into another
    in one transaction, its reads included; the emptied module goes.
    - A page read by both modules stays once.
    - It refuses a program module with its own folder, and two modules that each run a
      workflow.
  - `collection_link` (`Collections.link_field`): a field names the organisations (or people)
    each row's person is related to.
    - Each value becomes an organisation, found by name or made, linked by an accepted
      `related_to`; on every write after that too.
    - A changed or cleared company closes the old link, and so does a deleted row.
  - `/api/people`: no cap and no query per entity (0.13 s for 5,379 entities on the owner's
    copy, from 3.1 s). Each person gets `at`, each organisation `members`.
  - The world map draws every entity: its cap of 2,000 is gone.
- **Window:**
  - The Network page shows the Network project's own tables as tabs left of People and
    Organizations (Connections | People | Organizations).
    - People has an Organization column.
    - Organizations has a People column and opens largest first.
  - Every way into the Network project opens the Network page; the sidebar never shows it
    twice, and Move to never offers it.
  - The companion:
    - The bubble is the answer: a click opens Needs you; it still announces itself.
    - The header has Open / in platform; the arrows make the panel larger or smaller, within
      the screen.
  - Second Brain's graph opens on the overview (`overview()`, `groups()` in
    `shell/brain/model.ts`):
    - each project and what sits in it, drawn as one soft group;
    - collections sized by their rows;
    - people folded into the 24 largest organisations beside the collection their people are
      rows in, and the rest as one "N more organizations" node;
    - names shown as a node is drawn large enough.
    - ⋮ › Show every record and person draws everything.

## The review

An agent that did not build it found 11 defects:
1. a company link never closed when the person changed company;
2. two modules reading the same page couldn't be merged (a unique key);
3. the merged module's page took over the target's;
4. a merge lost a program module's folder and hid one of two workflows;
5. the merge's reads were outside its transaction;
6. a removed Network came back on the next start;
7. the Network project opened as a plain project page from a record's Back, Home, ⌘K and the
   graph;
8. Move to offered the hidden Network;
9. a project's table on the Network page showed organisations in Intelligence;
10. a table named `people` collided with the People tab;
11. the graph counted organisations from a world capped at 2,000 entities.

All 11 were fixed. Lesser points fixed with them:
- the bubble's screen-reader announcement;
- the large panel on short screens;
- a stale table while switching tabs;
- non-text company values;
- an index for `related_to`;
- the "more organizations" node beside the collection most of its people are in.

Not done:
- open questions written in the merged module keep its id;
- its icon preference stays behind;
- the journal keeps the module each entry was written in, so Network's "last" line doesn't
  show LinkedIn's history.

## What ran

- **Journey `network_merge`** (new): passed with the real model in 32 s
  (`docs/journeys/2026-10-12-1821.md`). Alpha merged Old contacts into Network, linked the
  three people to Acme and Globex, and said so.
  - The first run failed the judge: the tool said "2 named" and Alpha read it as two of three
    people. It now says rows and organisations apart.
- **A copy of the owner's world** (SQLite backup):
  - `module_merge` moved LinkedIn connections (1 table, 1 source, 1 thread) into Network;
    `collection_link` made the organisations and linked nearly every person to one.
  - Screenshots of the graph and Network at 1100×560 and 1240×820.
- **Layout check:** on the same copy with the final code: 240 of 240 states clean at 1100×560
  and 1240×820, light and dark (no ordinary project there, so the project states were skipped).
  The run before the last fixes had 248 states, 23 flagged.
  - 16 were the Network Intelligence list's one-line rows, now marked as cut on purpose with
    the full line on hover.
  - The rest were a timeout opening Graph (2 of 8 runs) and the absence of an ordinary
    project in that world.
- Core: 247 passed; `just lint` clean.
- Window: tsc clean; vitest 491 passed, 1 skipped.
- `just stats`: 247 core tests; 79 tools; 26 journeys; 242 commits; core 16,950 lines, tests
  5,918, desktop 25,109; lint clean.
- **Not run:** the Mac app on the owner's own world. The merge there waits for the owner to
  ask Alpha, or to say it may be run.
