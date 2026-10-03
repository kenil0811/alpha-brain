# Alpha as a second brain — design proposal

30 September 2026, revised the same evening after discussion (sessions → one stream with threads; modules stay first-class; Intelligence stays; interrupts at boundaries, not idleness; explicit asks skip the ladder). **Intent only since 3 October 2026:** each section ends with a status box (built / differs / not built); the current state is `../STATE.md`, the dated history `../log/`. Until 3 October every section ends with an *As built* paragraph that says what exists, what differs from the text above it and why, and what is not built. Where the two disagree, *As built* is current; the original text is kept as the intent. Decisions taken since 30 September are in §11 (Q17–Q26).

**How to read.** Numbered principles are the test for every later decision. Evidence is cited inline (arXiv ids, product docs); the research reports behind it and the Jev notes are in `design/research/`. **Q1–Q26** at the end are the decisions, each with the recommendation and what was decided. The engineering side (what ran, commits, tests, what is pending) is `build-plan.md`.

---

## 1. What we are building

Alpha is an agent that lives on a person's Mac, learns their world from what they say and what it can reach, holds that world in a structure it owns, acts for them through connectors, and becomes more useful the longer it runs — without the person ever designing anything. The companion is the product; the workspace is the window onto what Alpha holds and does.

Principles:

1. **Generic.** Nothing in the system knows what a calorie or a job is. Domains are data Alpha designs; the loop is the same for all of them.
2. **One world per person.** All data in one store, cross-linked. No islands, no declared bridges between modules.
3. **One way in.** You say what you want; Alpha works out whether it is an answer, an action, a change, or something worth keeping.
4. **Do now, deepen later.** A bare ask is never blocked by research or building. *Revised 2 October:* a plain action is done at once; anything that would set something up is understood, researched and proposed first, and built after the person's yes (§6).
5. **Reads are free once connected; anything that leaves the machine asks first** (automation of writes comes later, per kind, learned from your answers).
6. **Quiet by default.** Most proactive work happens while you are away and is shown at a good moment. Interrupting is the exception.
7. **No knobs.** Cost and risk are bounded by behaviour, never by a setting the person meets.
8. **Local-first.** The store is on the device. Where a model or a token must leave the device, Alpha says so.
9. **Evidence over cleverness.** Verbatim over extraction; fixed rhythms over adaptive timing; verify before keeping.
10. **Known, assumed or asked** (2 October). Every value Alpha writes or says is stated by the person, looked up from a source it names, or estimated and said so; an unknown the result depends on is asked about or assumed out loud. "It ran" is not "it works": answers and builds are checked against an independent one (§7).

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | 1, 2, 3, 4, 5, 7, 8, 9 and 10 hold in the code; 5 by mechanism (actions with the person's yes; automations cannot act outward, a code guard since the checkpoint). |
| Differs | 7 has one floor, 30 minutes between an automation's runs (Q22), and mechanism thresholds that are not settings (the pack's 12,000 characters, a conversation idle 30 minutes, a Mac awake 60 s). 2's cross-linking is a mechanism no live table uses yet. |
| Not built | 6: nothing proactive exists (§5, entries 3 and 4). |

---

## 2. Vocabulary

| Internal | What the person sees |
|---|---|
| World (the store) | "What Alpha knows" |
| Journal | Activity |
| Entities: people, organisations, places, documents, messages, calendar events | People & Companies |
| Collections | Tables (pages) |
| Modules | Modules: a bundle of tables, skills, automations and a note around a goal |
| Facts, standing instructions and permissions, notes, goals | Knowledge (in Intelligence) |
| Connectors | Connections (in Intelligence) |
| Skills, workflows, automations | Skills and Automations (in Intelligence) |
| Notices, asks, digest | Today |
| Stream and threads | The conversation |
| Plans | Plan cards in the conversation (Build it / Not now / Continue building) |
| Sources | "Where this reads from" on the module page, with a status |
| Readers | Skills (in Intelligence) |

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Home stands for Today (Needs you, Alpha is working on, Coming up, Your modules); People & Companies with a page per person or company; Intelligence (Skills, Automations, Connections, Knowledge); Activity; Settings. |
| Differs | Skills are one table of kinds read, act and run (readers, procedures, pipelines). Entities are shown only where Alpha resolved them. |
| Not built | Today's digest; ⌘K. |

---

## 3. The world model (memory and context)

This is the layer you called make-or-break. The research ranked three options; the recommendation is the middle one: a **verbatim-first typed world model in SQLite**, with the simpler "notes + full-text search" design as its first milestone rather than its destination, and embeddings only if a measured need appears.

### 3.1 Six layers

1. **Journal** — an append-only verbatim log. Every turn (what you said, what Alpha said), every source item as received (an email, a calendar event, a page read, a file change), every action Alpha took (connector, input, output, who approved it), every notice or proposal and its fate. Immutable, provenance on every row, FTS5 over the text. **This is the source of truth; every other layer is derivable from it.** Deleting something means a tombstone and a re-projection, so the clean-removal rule still holds.
2. **Entities** — a registry of people, organisations, places, documents, messages and calendar events, with canonical name, aliases and hard keys (email address, LinkedIn URL, phone, file path, calendar UID). Resolution: auto-merge on hard keys only, zero model calls; soft candidates (same name and company) go through a three-way judgement — same / needs you / different — and only "same" merges (the asymmetry: a wrong merge poisons linked facts, a missed one only leaves a duplicate). Wrong merges are undoable because the journal keeps the sources. These kinds are generic — the primitives of anyone's world, not use cases.
3. **Facts** — claims about you and about entities: subject, predicate, value, valid-from/valid-to (world time), recorded-at/superseded-by (system time), the journal row they came from, confidence, state (accepted / suggested / rejected). **Update-on-write:** a new hard-key fact supersedes the old one, so "works at A" → "works at B" keeps history and never has both live. Genuinely conflicting soft facts are kept side by side and Alpha asks. This is today's `profile.py` idea, generalised from "the person" to every entity.
4. **Collections** — tables Alpha designs per topic (food entries, targets, openings, applications, cold calls): typed fields, relation fields to entities and to other collections, drawn by the derived pages we already have. Owned by you, grouped into modules only for display. Creating or editing a record is itself a journal event.
5. **Notes** — Markdown Alpha writes and maintains: a profile summary, your standing instructions, one page per module ("what this is for, what is in it, what I have tried, what is open"). A bounded index (the Claude Code pattern: about 200 lines) is loaded on every turn; pages are read on demand. You can read, edit and delete every note.
6. **Goals** — durable intentions with state ("a backend job in London by December", "under 2,000 kcal on weekdays"). Proactivity is organised around active goals; an ask that attaches to a goal is standing by default.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | All six as tables (`world/store.py`): the journal verbatim with FTS, tombstones and what the model saw per turn; entities with hard keys, merge and unmerge; bi-temporal facts; collections with per-row provenance and versions; notes as wiki pages (person, module, topic, entity, skill scopes; a summary each; an index); goals. Around them modules, threads, plans, sources, skills, actions, permissions, automations, documents, events, connections. |
| Differs | Removal is a purge that keeps the journal, not a re-projection. The index is every page in one line inside each pre-pack, not a 200-line file. |
| Not built | The same-person judgement for soft candidates (same-name people are shown with "Same person"); unmerge from the app; linking across sources by itself (no live table declares its rows as people); deleting a page. |

**Why this shape.** Verbatim text beats extracted facts by 16–22 points, and extraction should be added beside text, never substituted for it (arXiv 2601.00821). Mutable facts need update-on-write: on changed facts, embedding retrieval scored 0.30–0.95 across seeds, a structured fact store 0.75–1.00, and hybrids were *worse* than the fact store alone (MERIT, 2609.05441); Mem0's own tracker shows an accumulate-only store keeping "works at A" and "works at B" both live (mem0 #4956). Notes-only memory decays with tenure — 96% at three weeks, 72% at nine — while provenance-typed structure rises (2607.21962). A compact behavioural spec kept apart from facts beat four memory products on interpretation at 25× less context (2605.28969). The products that survived (Claude Code, OpenClaw, ChatGPT's profile) all pair a small always-loaded index with on-demand reads and idle-time consolidation. And the signature move — a recruiter's email → the application it concerns → the contact at that company — is a two-hop join on an entity registry with hard keys: relational, no graph database (graphs only pay off for multi-hop synthesis; GraphRAG-Bench 2506.05690).

### 3.2 How context reaches the model

Two mechanisms, in this order:

1. **Pre-pack** — deterministic, zero model calls, two to four thousand tokens: who you are and your standing instructions (capped); active goals; the notes index; entity cards for anything the sentence or the event names (matched by key or name); the last N journal lines; full-text hits for the sentence's terms; today's calendar; pending asks and notices; connection state. Every line names its source.
2. **Agentic retrieval** — the model has tools: search the journal (FTS5 with time and kind filters), query collections, look up an entity and its facts, read a note or a document, read a source item verbatim. It decides what else it needs, in as many steps as it needs. Results come back inline, not as files: grep beat vector search on every harness when results were inline and lost when they were delivered as files (2605.15184).

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | The deterministic pre-pack (`context/prepack.py`), capped at 12,000 characters: NOW · WHO THE PERSON IS · THEIR INSTRUCTIONS · ACTIVE GOALS · WHAT ALPHA HOLDS · WHAT ALPHA CAN REACH · WHAT ALPHA CAN DO · TODAY'S CALENDAR · WHAT ALPHA KNOWS · THIS MODULE'S PAGE · WHO THE SENTENCE NAMES · THIS CONVERSATION · SINCE YOUR LAST TURN HERE · WHAT WAS SAID <DAY> · MATCHES FOR THIS SENTENCE · THIS THREAD · OPEN. Agentic retrieval through 70 tools. |
| Differs | The cap is a blind tail cut (the conversation, matches and a build's brief come last); record and document match lines carry no date. |
| Not built | A budget per section; "so far today" totals in the pack (the module page works them out). |

**Embeddings: not at launch.** The journal's chunk ids and a fusion hook are designed now so an embedding column (sqlite-vec plus a small local MLX/ONNX model) can be added as one more signal later — but only after a personal evaluation (tasks that succeed with history and fail without) shows full-text plus structured recall is the bottleneck. Published rankings flip on the embedding model alone (±6 points, 2606.29914); vendor numbers should not drive this.

### 3.3 When memory changes

- **At write:** hard-key facts supersede; entities resolve on hard keys; structured sources (calendar, LinkedIn rows, email headers) need no model at all.
- **Per turn:** nothing is rewritten. The turn is journaled; anything Alpha learned about you is recorded as a suggested fact.
- **Sleep time** (nightly, and after a long idle): one bounded pass reads the journal since last time; updates module notes and the profile summary; promotes suggested facts that have enough evidence; writes "tried / failed"; links entities across sources; looks for patterns across modules (this is where "you started running, so your protein target should move" is found); prepares tomorrow (meetings, due follow-ups); assembles the digest; and retires what has gone unused. Generative Agents' reflection and OpenClaw's "dreaming", with a cap.
- **Before compaction** of a long session: flush facts and notes first, then summarise.
- **Recall is not use.** Agents acted on a correctly retrieved value only 55% of the time (MERIT), and sixteen systems passed recall tests while failing the matching behaviour tests (2607.29433). So the pre-pack states the facts that matter as instructions in context ("calorie target 2,000; 1,450 so far today"), and every action's result is checked against them.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | At write: hard-key facts supersede, rows link to entities by key, no model call. Per turn: stated facts kept, inferred ones suggested; noticing after every turn (§3.7). |
| Differs | A live conversation's model session is resumed, with a world delta so current facts outrank what it remembers (§3.7). |
| Not built | The sleep-time pass, consolidation, the digest. |

### 3.4 Size and locality

Tens of thousands of journal rows and records are small for SQLite and FTS5 (milliseconds at millions of rows). One database per person, on the device; encryption at rest later.

---

### 3.5 How the data is organised (decided and built 2 October 2026)

After reviewing Kenil's research on memory systems (`context_memory_mgmt.docx`: Mem0, past.dev,
Supermemory, Claude Code, DeepSeek Harness, Graphiti, Letta, Hindsight, OpenClaw and others).
Its central lesson matches this design: keep evidence apart from every interpretation of it,
build a bounded context for each run, and make every change traceable. Five rules:

1. **Rows, entities, facts.** Rows are the person's working data, shaped per module. Entities
   exist only for the world's primitives (people, organisations, documents, messages, events).
   A table whose rows are people or organisations says so (`rows_are`, `identity_field`) and
   every write links each row to its entity by hard key (an email address or a profile URL),
   never by name, with no model call. Facts are only claims that have validity and matter
   across modules (works_at, email, lives_in), not every column. Cross-module answers come from
   a join through entities, not from the model's cleverness in the moment.
2. **History is kept.** Every change to a record keeps its previous values
   (`record_versions`): the world changed, and "what was their title before" stays
   answerable. The journal records the change; the old values live beside the record.
3. **Modules are what was asked for, with what it needs**: a goal, tables, a note,
   automations. Links between modules go through entities, never by moving tables. One note
   per module, one for the person, topic notes only for what fits neither.
4. **One world per person.** Each world file carries its own id (`meta.world_id`). Sharing,
   later, means syncing explicit records with their provenance, never a shared database or
   scope columns added to everything.
5. **Everything derived says where it came from.** Facts, notes and entities record the turn
   or record that produced them, so a claim can be traced to its source and invalidated or
   regenerated when that source turns out wrong. Search indexes are rebuildable views.

### 3.6 Sessions, context and memory (decided and built 2 October 2026)

- **No remembered model sessions.** Every run, conversation or automation, starts fresh from
  the world. A thread is a record: its run starts from the thread's **brief** (what the work
  is for, what was decided and why, what didn't work and why, what is open, what comes next;
  Alpha keeps it short and current with `thread_brief`) and the thread's own recent history.
  A belief from an old run can't return unseen: it is in the brief or the journal, visible and
  correctable, or it is gone.
- **What the model saw is kept** with every turn (`turn_contexts`), so a wrong answer can be
  traced to retrieval or to reasoning. Every line of conversation, history and matches carries
  its local date and time.
- **The person's instructions are the person's.** Standing instructions change only on the
  person's own words in that message (`instruction_add` checks a quote against what they
  said); anything else Alpha would make an instruction is proposed and becomes one on a yes.
  Learned memory is never automatically an instruction.
- **Remembering:** stated facts are kept at once with their source; inferred ones wait as
  suggestions (Q5). The sleep-time pass (§3.3) will consolidate with a version on every
  derivation so a rerun never duplicates or strengthens a belief, linking entities on hard
  keys and proposing soft matches, every write visible in Activity.
- **Not yet, by the research's own advice:** embeddings, a graph store, a profile service,
  reflection. Each waits for a logged failure that needs it.

### 3.7 The memory round (decided 3 October 2026, early; Q26)

Kenil, after the write route: "still not convinced about our design around memory / knowledge /
context / threads… the most important part of alpha". A long discussion, grounded in what the
day had shown (no fact that Sania is his partner among 1,551 connections and hundreds of
emails; a Gmail × LinkedIn answer from the model's cleverness; 34–40 s for a question about a
table; three Gmail procedures because nothing composed the first two; nothing measured). The
shape agreed, each piece built in order and judged by the memory journeys before the next:

1. **Evidence stays verbatim** (journal, rows, documents).
2. **Knowledge is a wiki with an index.** Markdown pages Alpha writes and the person can edit,
   each with provenance to the journal: a page per person and company, per module, per topic.
   Facts stay structured under the pages (validity, update-on-write). An index of names and
   one-liners is always in context; bodies load on demand. People & Companies return to the
   rail.
3. **Noticing.** After every turn and at a conversation's close, a cheap structured pass over
   what was said and read proposes facts and page edits, as suggestions with the journal line
   they rest on; low-stakes ones silently with a trail (Q5). Beside verbatim, never instead.
4. **Context by relevance.** Entity cards for anyone named, the scope's page, the turns of the
   same conversation, matches, the skills for the sites and modules involved; and fewer,
   composable tools (one per kind of thing with an operation; no fixed number).
5. **Conversations, first-class and parallel.** A conversation has a scope (a module or
   General), a title Alpha gives it, a state (working / needs you / idle / done), its own stream
   and its own model session resumed while live (a *world delta* in every resumed turn, so
   current facts outrank what the session remembers); fresh on close. Several run at once; a
   strip on the panel and on Home switches between live ones; closed ones stay in the module's
   history. Builds and automation runs are conversations too and never resume across runs (the
   brief is their memory). Ends on Done, when a build finishes, or after a long gap; no automatic
   topic splitting; no picker before speaking; no projects above modules. **Memory is shared
   only through the world.** This revises Q21 (threads as records) for live conversations and
   the "one stream" of 30 September: many conversations, one world. Kenil's driver: working on
   several modules at once with to-and-fro in each.
6. **The companion is a mouth onto the same conversations.** It holds one focus; a sentence is
   routed by rules (a reply to an open question → the conversation that asked; a sentence naming
   a module, table or person → where they live; a new request naming a module → a new one
   there; else the focus; else General), the bubble says where it went, a wrong one is one tap
   to move; when two live conversations could take it, a System One question decides or asks
   with choices. Questions come back as choice pills and primary decisions (Build it, Send it,
   Yes/No) are in the bubble; Open hands off to the workspace with that conversation open.
7. **Skills are the one unit of know-how.** Readers, procedures and pipelines become skills of
   kinds read / act / run in one table and one folder format: name, kind, site or module,
   description, when to use, inputs, outputs, steps or script, examples, health, provenance, a
   test, site notes. Discovery: the always-loaded index, search over descriptions, site and
   module matching. Composition: a step may call a skill. Promotion from verified runs.
8. **The System One seam is built now**: (state, typed question) → answer with confidence;
   rules first, a no-tools cheap run (Haiku on the subscription) otherwise, Jev or Laya later.
   First uses: routing, noticing, same-person, rerank, skill choice, permission gating, triage.
9. **Benchmark first.** Memory journeys on a copy of the world: yesterday; an old fact; a
   correction overriding a belief; two sources for one person; who emailed; a follow-up that
   needs what the model saw.

Risks accepted: routing errors (ask when ambiguous, one tap to move); a one-turn lag between
conversations (noticing after every turn); contention on one sign-in must be shown as waiting;
Claude Code's session files live under the home folder, outside Alpha's data directory.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Points 2, 3, 5, 6, 7 and 8 (the wiki with its index; noticing; conversations first-class and parallel with resumed sessions; the companion's focus with rule-then-judge routing; skills as one table with composition; the System One seam), and the retrieval half of 4 (entity cards, the module's page, day-scoped matches). Memory journeys 6 of 7 after, 5 of 6 before (`../log/2026-10-03-4-23-*`). |
| Differs | Routing never matches names: structure where certain, the judge otherwise. Noticing runs per turn, not at a conversation's close. Run skills are named from an automation's title. |
| Not built | Fewer, composable tools; the Agent Skills folder export; promotion from repetition; noticing over what Alpha reads; a routing journey; "move to…" in the panel. |

## 4. Capabilities — the code Alpha owns

Four kinds. Each is a first-class object with provenance (which runs made it), a test, a description written to trigger well, and a usage record; each is visible in the workspace and removable cleanly.

**Connector** — reaches an outside system. The shape the industry has converged on: a skill directory with a manifest.

```
connectors/<name>/
  connector.yaml   identity (origin: builtin | leveraged | alpha-built)
                   transport: mcp | native-macos | http-api | browser
                   auth: none | tcc:<service> | oauth{provider, scopes, custody} | browser-session | api-key, + status
                   tools[]:     name, input schema, effect: read | write   (write ⇒ ask first)
                   resources[]: views Alpha syncs into collections, with cursor and freshness
                   triggers[]:  poll | webhook | fsevents | browser-observe
                   health:      last success, failures, repair policy
  SKILL.md         how to use it: quirks of the site or service, recorded procedures
  scripts/         tool implementations or recorded steps
  references/      API notes, selectors, samples
```

An MCP server maps one-to-one; a native macOS framework is tools and resources with `auth: tcc`; an Alpha-built site connector is `transport: browser` with recorded steps in `scripts/` and, once discovered, the site's underlying request cached as an `http-api` tool (the Browser Use "money request" pattern). This is the Agent Skills format that Claude Code loads natively, so on the subscription route connectors and skills need no loader of ours.

**Skill** — a reusable procedure: instructions plus the tools it uses (model-driven), or code (deterministic). Alpha writes them only from verified successful runs (§6).

**Automation** — a skill plus a trigger (schedule, source event, data condition) plus approval gates set at creation. OpenClaw's "standing order" fields: scope, trigger, gates, escalation.

**Module** — a named bundle of collections, skills, automations, connections and a note, around a goal. Made in seconds; no code, no build, no versions. The tool the person works in; first-class in the workspace.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Connectors as Agent Skills directories (browser, files, calendar: `connector.yaml`, `SKILL.md`, `scripts/`). Skills as one table (read, act, run) with health, provenance, when-to-use, site notes and an index in every turn. Automations as a schedule plus a pipeline (a run skill, no model) or a procedure, run by the scheduler in their own threads once the Mac is properly awake, held awake while they run. Modules with their sources and plans. |
| Differs | Triggers are schedules only (30-minute floor, Q22). Approval gates are not needed: an automation cannot act outward, by code. |
| Not built | Alpha-built connectors; source-event and data-condition triggers; Stop on an automation run. |

### 4.0 The capability model: hands, know-how, access (agreed 1 October 2026)

The split between what the platform provides and what Alpha makes. It was settled after the first LinkedIn sync went wrong (20 of 1,574 connections, names read from photo labels) and a platform reader was patched by hand. The fault was that site knowledge had been built into the platform, where Alpha could neither see nor repair it.

**Principle: anything inside Alpha's own space; consent at the boundary; never for the forbidden list.** Alpha's power is not limited by narrow tools. What it is allowed to *cause* is enforced where an effect leaves its space, by mechanism rather than by instructions in a prompt.

**Hands: universal, few, built by the platform, never changed by Alpha.** Generic primitives that know no particular site or app:

1. **Browser** — any web app in the person's session: open, read (text, links, structure), run Alpha's own script in the page, scroll until a condition holds, screenshot; click, type, upload and download exist but are writes.
2. **Desktop control** — any Mac app: see its window (screenshot and the accessibility tree), click, type, use menus. Reaches apps with no API. The road to screen observation later. *(Not built yet.)*
3. **App scripting** — AppleScript / JavaScript for Automation / Shortcuts, for apps that can be driven that way: faster and more reliable than clicking. *(Not built yet.)*
4. **Files** — read folders the person shared; write freely in Alpha's own space.
5. **Web APIs** — with the person's own key or sign-in.
6. **Plug-ins** — third-party MCP servers that vendors ship for their products.

Plus the world itself (tables, journal, notes, automations) and **sandboxed code**: Alpha writes and runs its own Python or JavaScript with no network of its own; it reaches outside only through the hands.

**Know-how: Alpha builds it, on the hands.** Site readers and app connectors ("read LinkedIn connections into rows", "export the open Illustrator file as PDF") are Alpha's own: a procedure, a script where one helps, a test, a health record. Each is tested on a real run before it is kept (Voyager's rule) and run without a model call by automations where possible. When a run's result is wrong (zero rows, a large drop, empty fields), Alpha looks again and repairs it itself, telling the person only if it can't. Everything lives in Alpha's space: versioned, visible in Intelligence, removable. Alpha never edits platform code; generic "read anything" heuristics do not belong in the hands. `page_to_table` is at most a rough first look; a site's reader is Alpha's.

**Guardrails classify effects, not tools.** The same click can be "Show more" or "Send".

| Effect | Example | Rule |
|---|---|---|
| Read | open a page, run a read-only script, read a file or an app's window | free once the source is granted; journaled |
| Write inside Alpha | its tables, notes, scripts, connectors | free; journaled; undoable |
| Write outward | send, submit, post, change a calendar, act in an app, write to the person's folders | asks first, per kind of step; later a standing permission the person can read and revoke |
| Never | entering passwords or card numbers, moving money, permanent deletion | refused, whatever Alpha or a page says |

Enforcement is in the process boundary: Alpha's code runs sandboxed; a browser read session blocks requests that would change data on the site (form submissions and similar), so neither Alpha's script nor text planted on a page can send anything while reading; a write runs only as the one action the person approved, and is journaled. Acting in an app is a write by default: the first consequential step of a kind (export, save over, send, delete) is approved once for that skill. Installing a plug-in always asks (someone else's code), and it then runs under the same walls; its own read-only/destructive labels are hints, unlabelled tools are treated as writes.

**Gaps, and who closes them.** When Alpha cannot do something it says so plainly and records the gap as one of three kinds:

- **hand** — a primitive is missing (desktop control and app scripting today): a platform release, closed by the system owner;
- **access** — a grant, a key, a sign-in, a plug-in install: the person decides;
- **know-how** — the common case: Alpha builds it.

For now the system owner (developer) handles hands, listed in Intelligence. Open: as people ask Alpha to reach their own applications (Adobe and the like), the platform cannot build per-app integrations, and doesn't need to; the open question is how hand gaps are collected and prioritised across many people, and whether vetted, shared know-how (readers for common sites) ships with Alpha.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | The browser (reads read-only by mechanism; acting, downloads and uploads only inside an approved action), files (folders the person names, read-only) and the calendar (read-only); readers with the real-run rule, health against their own last good run and repair by Alpha; site vocabulary out of the hands (Q23). |
| Differs | Gaps are a module's source statuses (needs sign-in, blocked, broken, not built, unavailable, skipped), not objects. `page_to_table` exists as a first look and is refused inside automations. |
| Not built | Desktop control, app scripting, sandboxed code of Alpha's own, plug-in install. |

### 4.1 First sources, as the research ranked them

- **Browser.** Leverage Claude in Chrome through `claude --chrome` now: the real signed-in profile, per-site permissions, pauses on login and CAPTCHA, zero build — subscription-only. Later, a thin fallback on Google's sanctioned Chrome 144 remote-debugging route (reuse `chrome-devtools-mcp`, Apache-2.0) so the API route also has a browser. Site procedures are recorded as connector skills after a successful run, so the second run is cheap and deterministic with the agent as fallback. Never raw CDP on the real profile (blocked since Chrome 136) and never a copied profile.
- **Files.** Build: an FSEvents watcher plus MarkItDown for Office files and pypdf/pdfplumber (or Docling) for PDF, into the journal and FTS5. No AGPL parsers in a closed product.
- **Calendar.** EventKit, natively: Google, iCloud and Exchange calendars all appear once synced into macOS Calendar; no OAuth, no Google verification, nothing leaves the device. Requires the app bundle to carry the Calendar usage key, a stable code signature, and the Python core running as a child of the app (macOS attributes permission to the responsible process).
- **Email.** Since 2 Oct, Gmail is read through Alpha's signed-in browser (read-only, Kenil's decision revising Q4). Later options: Mail.app locally (its SQLite index and `.emlx` files, Full Disk Access) for Apple Mail users; Anthropic's Gmail connector while on the subscription (available in Claude Code sessions with a claude.ai login; the token lives with Anthropic); our own Google app plus a CASA assessment (about $1k a year, weeks of process) when we move to the API. Gmail read is a Google "restricted" scope; Calendar and Contacts are only "sensitive". Unverified apps hit a permanent 100-user cap, so shipping unverified is not a bridge.
- **Contacts, Notes, Messages.** Native, cheap, later.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Browser: Alpha's own Chrome through Playwright, a profile per signed-in site, the person signs in themselves in a window Alpha opens, a sign-in covers the sites it passed through. Files: watchdog plus pypdf, python-docx, openpyxl, python-pptx and plain-text kinds into documents with FTS (50 MB and 400k-character limits). Calendar: EventKit, 30 days back and 60 ahead, every five minutes. |
| Differs | Not Claude in Chrome. A sign-in counts as done when any cookie is set (a heuristic). The file watcher runs only while the core runs. Gmail is read in the browser (Q4 revised). |
| Not built | Reading only what is new on a list read daily. |
- **Screen capture.** Not in v1. Every consumer product that shipped continuous capture was killed or forced opt-in (Rewind's capture ended December 2025, Limitless was sold, Recall was redesigned); the one research system that made it work (GUM) did so for five people behind a strict utility gate. Revisit once the connector-only brain is trusted.

### 4.2 Leverage, build, avoid

- **Leverage:** Claude in Chrome; Anthropic's connectors on the subscription; the Agent Skills format; the MCP Filesystem server; `chrome-devtools-mcp` later; pyobjc; MarkItDown and pypdf.
- **Build:** the connector manifest and registry; the native macOS connectors as one signed, permission-correct bundle (nobody ships these); the procedure-recording layer; the repair hook.
- **Avoid as the auth layer:** Composio, Nango, Pipedream, Arcade (tokens held in their clouds, no production escape from Google's verification, per-call metering); Zapier MCP (task-metered); Merge, Unified, Paragon (B2B pricing); Unipile (unofficial LinkedIn access).
- **LinkedIn.** The official API exposes no connections, jobs or messaging. §8.2 of the user agreement forbids bots that download contacts or send messages, and vendors report about 40% of accounts on non-compliant tools restricted in Q1 2026. The lowest-risk posture is: Alpha reads pages in your own Chrome at human pace, proposes outreach, and you send. (Q3)

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Leveraged: the Claude Code CLI, the Agent Skills shape, Playwright, pyobjc, the document parsers, watchdog. |
| Differs | Not used: Claude in Chrome, Anthropic's connectors, the MCP filesystem server, MarkItDown, `chrome-devtools-mcp`. |
| Not built | — |

---

## 5. The agent

One loop with four entry points, each strictly cheaper than the one above it.

**Entry 1 — a turn** (companion or workspace). Pre-pack → the model acts with tools (query the world, run a skill, use a connector, make a collection or module, record a fact, propose, ask) → reply → journal.

The person sees **one stream**; the model's context is not one. A **thread** opens automatically the moment Alpha starts making something — a module, a skill, an automation, a connector, a research pass, any long-running job — and all the to-and-fro about that work lives in the thread with its **own model context** (its own Claude Code session on the subscription route). The stream only holds the ask, a card, and the outcome. A message about an open piece of work, wherever it is typed, is routed into its thread (a System One choice over the open threads) and the reply shows where it went ("in: Job tracker build"). A thread can also be opened deliberately for a long to-and-fro that is not a build. The stream's own context is the pre-pack plus the recent stream turns relevant to the ask — never everything since morning. Nobody chooses a session before speaking, and no session holds memory: the world does. Forty turns of building a flow never sit in the prompt when the next ask is how much protein is left.

**Entry 2 — sensors** (no model). Connector deltas (a new email, a calendar change, a file change, a page visited), schedule ticks, collection changes (a value crossing a target), person-context signals (idle start, app switch, a gap in the calendar, day start and end). Each becomes a typed journal event.

**Entry 3 — triage, then deliberation.** Triage runs rules first and then the System One seam (below), bounded to about two thousand tokens per event, and answers *discard*, *record silently* or *escalate*. Standing intents (keyword or structural matches; no model) live here. Only an escalation reaches deliberation: an isolated model run with a compact situation packet — the event, the standing things that care, the relevant goals and facts, the last digest — never a whole conversation. OpenClaw resends about 100k tokens of context per heartbeat and one idle session burned 47.6M tokens in a day (openclaw #21597). Hard caps on tool calls and wall-clock; a run never schedules another run.

**Entry 4 — sleep time** (nightly; after long idle). The consolidation in §3.3, the deepen work queued during the day (research a new module and propose what else it should track; build a skill from a verified run), and the digest.

**The System One seam.** Every small judgement — is this urgent; which module does it belong to; which of these forty records is it about; is this the same person; is this action within a standing permission; is this the same kind of task as last week; which of two hundred candidate memories matter here — is expressed as `(state, typed questions) → answers with confidence`, never as free text. It is answered by rules where rules suffice, by Claude (batched, structured) on the subscription route, and later by Jev (cloud, ~100 ms, $0.04 per million input tokens) or Laya (local, Apache-2.0). Nothing else changes when the answerer changes. Two rules from Jev's own weakness list apply whoever answers: send only filtered state (irrelevant state distracts), and treat source content as untrusted (injected text steers).

**Speaking up is an expected-utility gate, not a vibe.** Every candidate carries a confidence, a benefit, an interruption cost and a decay horizon, and is placed on a ladder relative to the next scheduled digest:

- *prepare* — silent: draft it, precompute it, update a page;
- *digest* — two fixed times a day;
- *workspace card* — shown the next time you are at a breakpoint;
- *notification* — only when it would expire before the next digest, confidence is high and missing it is costly; delivered at a **task boundary** (an app switch, a calendar gap, the end of a piece of work — not idleness: idleness-triggered interventions were ineffective while boundary ones were engaged 53% of the time, CHI 2025, 2502.18658) and limited by a small daily bucket.

Evidence: 97.8% of people accepted imperfect help done while they were away versus 26.7% for correct-but-intrusive help, and one misaligned interruption cost more trust than several good ones won back (Proactivity-Gym, 2609.37267, 29 Sept 2026); acceptance was 52% at workflow boundaries against 38% mid-task (2601.10253); a consistent, predictable agent was rated a better partner than an adaptive one (CUI 2024). Feedback is implicit: dismissed or ignored means rejected, and a miss raises the bar for that class of notice more than a hit lowers it.

**Cost without knobs.** No model call without an event or a scheduled slot (a heartbeat is a deterministic health check, never a model turn); tiered answerers by layer; isolated, packet-sized runs; per-run caps; an internal daily budget that degrades behaviour (batch more, speculate less) instead of alerting anyone; a scheduled run is skipped when nothing changed.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Entry 1 (`runtime/turn.py`: the sentence, the pre-pack, one run with the world as tools, the reply and what the model saw, journaled); conversations with routing by structure then the judge (§3.7). Entry 2 in part: file changes, the calendar, the scheduler's tick, the plan queue, each journaled as `saw`. The System One seam (`runtime/judge.py`), used for routing and noticing on Haiku. |
| Differs | Cost has no limits or budget (Q18); the person stops a run. Builds, automations and trials run in their own threads with no resumed session. |
| Not built | Entries 3 and 4: triage, deliberation, sleep time, the digest; the speaking-up ladder; same-person, triage and rerank through the seam; collection-change and person-context signals. |

---

## 6. When something becomes standing

**Revised 2 October 2026 (Kenil): understand and propose before building.** After Alpha built nine tables and eight readers blind for a vague ask and ran out of time, the rule is: Alpha never builds on a request straight away, however it is worded. Plain actions ("log two eggs", "what did I eat today") are still done at once, and a log with no home still gets the simplest table on the spot (Level 0, one table, one row). Anything else that would set something up goes through three steps, the same for every kind of request:

1. **Understand and propose** (reading only). Work out what the person means, using what Alpha already knows (their files, facts, modules); research how it is best done; look at the actual sources (what is readable, what needs a sign-in, what blocks automated reading); decide what is worth tracking and how. Reply with a **plan**: what was understood, what was found (every source and whether it is reachable), what would be set up and why, what can't be reached and what to do about it, and the questions that genuinely depend on the person, numbered.
2. **The person's yes.** In the conversation (Alpha records it with the person's own words, which must come after the plan) or with the plan's button. Until then the tools that make lasting things (modules, tables, readers, automations, sources) refuse: the gate is in code, not in instructions.
3. **Build in the background.** The approved plan becomes the brief of a build thread (§3.6). The build runs to completion however long it takes: there is no limit on a run or a build (Kenil, 2 Oct: "it's impossible to set limits for these things"); a run that ends before its work does is continued from the brief and the thread's history, and the person can **stop** a build, or any turn, when it isn't going anywhere. A stopped build says what it made so far and carries on from its brief when the person says continue. Progress shows on the thread's card. The report comes back into the conversation and always ends with what the platform knows about coverage: sources working, needing a sign-in, blocked.

**Sources with a status.** Everything a module reads from outside Alpha (a page, a folder, a calendar, an inbox) is a source the platform keeps, with a status: *working* (rows, last read), *needs sign-in* (Alpha opens the sign-in window and asks once; the source carries on once signed in), *blocked* (a bot check or captcha: stated plainly, another route proposed; Alpha never tries to get past it), *broken* (Alpha repairs it), *not built* (shown, so nothing falls off silently). The browser tells sign-in walls and bot checks apart by itself and updates the sources of that site. Modules show their sources; anything needing the person is in Needs you.

**Know-how as code; AI only for repair and judgement.** A reader is code Alpha writes, tries on a real run, keeps and repairs. An automation that only reads and stores is a **pipeline** of saved steps the scheduler runs with no model: run these readers into this table (with saved value mappings), then tell the person what changed. The platform keeps, for any table fed by readers, when each row was first seen, last seen, and gone (not returned by the reader that found it), so "what's new, what changed, what's gone" is a query, not a model's guess. The model is called only when a step breaks (repair the reader, rerun once) or a step needs judgement. AI-run procedures remain for work that is judgement throughout.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | `plan_propose` with a trial, `plan_approve` on the person's words or the card, `plan_resume`, `plan_decline`; the gate (`Tools._gate`) refuses making modules, tables, readers and automations outside a building plan; builds in the background from the brief with no limit, a stop, a resume, a trial and a coverage line; sources with statuses; pipelines. |
| Differs | `table_start` (Level 0) and edits to existing things are not gated. A build has no cap; the only counter is two trial send-backs. |
| Not built | The three origins, the signals, Levels 1 and 2, promotion from repetition, deepen-in-background, the junk rules. |

### 6.1 Acting outward (decided and built 2 October 2026, evening; Q24)

Kenil asked Alpha to draft an email and was refused, and then asked for the write route to open
generically: a draft in Gmail, a sent email, a LinkedIn message, anything, "with proper
guardrails and governance and approvals". The split of §4.0 decides the shape.

- **One more hand: act in a web app.** The browser driver gains the write operations it never
  had (click, fill, type, press, wait, expect), generic, knowing no site, used only through a
  procedure Alpha wrote. Later the same shape for Mac apps.
- **Procedures are Alpha's know-how for acting**, as readers are for reading: declarative
  steps for one task on one site, written from the real page, kept with `procedure_save`,
  versioned, health-checked by their runs, repaired by Alpha when a run fails. A procedure
  declares its **effect**: *prepare* (the result stays in the person's account and reaches
  nobody: a draft, an unsent message) or *send* (it reaches someone or something). Its last
  step is the commit.
- **An action is the object the person decides on**: the procedure, the exact payload (every
  field as it will be typed), what it rests on, what cannot be undone. It is a card in Needs
  you and in the conversation, editable before the yes, with Do it / Always allow (prepare
  only) / Change / Not now, and one line on the companion. Approval is per action, in the app
  or in the person's own words after the card (`action_approve`), the same mechanism as plans.
- **The walls, where the effect leaves Alpha's space:** only an approved action starts an
  acting session, and only in the person's own session on a site they connected; fills and
  typing take only fields of the payload, never words of the procedure's own, so what reaches
  a site is what was on the card; a **dry run** performs every step but the commit and the
  card shows the screenshot; the run performs them all, screenshots before and after, and runs
  the procedure's read-only `verify` checks before it counts as done; the hand refuses password
  and payment fields by their own attributes, whatever a step says; **once the commit step has
  run, the effect is treated as having happened**: a failed check afterwards makes the action
  "sent, not confirmed" and repairs only the check, never a second send; every step, screenshot and
  decision is journaled and shows in Activity.
- **Approvals grow with use:** a prepare-level action may be approved "always", which makes a
  standing permission sentence ("Alpha may make a draft email in Gmail on google.com without
  asking") that runs the next such action without a card and can be revoked in Intelligence ›
  Knowledge. A send asks every time, for now (Q12's sentences for sends come after real
  approvals). Nothing proactive sends.
- **Fragility is Alpha's to own**: a failed action marks its procedure broken, journals why,
  and Alpha looks at the page again, repairs the procedure and proposes the action afresh
  with a new preview.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Procedures (act skills) with steps, fields, verify checks and placeholders filled from the payload; actions with a dry-run preview card, the person's yes in the app or in their words, decline; prepare-level standing permissions as sentences with Revoke; repair after a failure; "Sent, not confirmed" when only the check after the commit failed; upload steps restricted to Alpha's own folder; automations refused. |
| Differs | A send is never standing. A repair never re-proposes an action that committed. |
| Not built | Undo; sentences for sends; saying on the card when a dry run already leaves something behind (autosave). |
`action_approve`, `action_decline`, `actions_list`; routes for the card, edit, approve,
decline, screenshots and permissions; the action card in Home and the conversation; standing
permissions in Knowledge; removal of a connection takes its procedures, declines pending
actions and revokes their permissions; the scheduler performs approved actions the app missed.
Rule 9 of the turn and the browser skill say how. Journey `gmail_draft`: the first real
procedure is Alpha's own, written against Kenil's Gmail in about two minutes; the dry run
filled a real compose window, the yes made the draft (Drafts 1 → 2), and Alpha's own verify
check then failed because its text had gone, so the platform called it failed and the
procedure broken, for Alpha to repair (build-plan §4.13).
**Real (2 Oct, 18:43–18:54, in the app):** the draft was made and then, on "send it as well now", Alpha wrote a send procedure and the email went to Sania with the verify passing. The trace found a false "Sent" on a thrown error, cards approvable before their preview, and two Chromes colliding on one profile; all three fixed the same evening (build-plan §4.15): any error is a failure, a card waits for its preview, one job per profile at a time. Built since §6.2: upload steps, acting in Mac apps, sentences for sends, undo of a draft.

### 6.2 Files in and out (decided and built 2 October 2026, late evening; Q25)

- **In, from a connection.** `page_download` fetches a file through the person's session (a
  direct address with the site's cookies, or what a page hands back when a control is pressed)
  into Alpha's own folder for the module (`files/<module>` under the data directory, never the
  person's folders). It becomes a document (text extracted where Alpha reads the kind; the
  file itself is never run), searchable and readable in pages, and a table's new `file` field
  keeps its id; the page shows the file's name, Open and Show in Finder. A read: free once the
  connection is granted, journaled. Whether a module keeps such files is a sentence in the plan
  the person approves, or an ask; never silent growth. Removing the module removes its files.
- **In, from the person.** Files dropped onto a module page or added to a row's file field go
  into the module's folder, become documents, and (for a module drop) Alpha reads them into the
  module's tables in a turn of its own, journaled as the person's addition and Alpha's reading.
- **Out, by a procedure.** An `upload` step names a payload field whose value is a document
  Alpha keeps; the hand refuses any other path. Sending a file reaches someone, so the action is
  a send: a card with the file's name and size, a fresh yes every time.
- **Out, by the person.** A table downloads as CSV or Excel into Alpha's exports folder,
  revealed in Finder.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | `page_download` into Alpha's folder per module, documents with module and origin, drag-and-drop onto a module or a row arriving as a turn, `file` fields, CSV and Excel export, upload steps. |
| Differs | An upload by Alpha asks every time; the plan decides what is kept. |
| Not built | — |

*The text below is the original design of 30 September; where it says an explicit ask is built at once, the revision above applies.*

Your point 3: the decision of when a one-off is worth turning into a tracker, a watcher, a connector or a workflow. Designed as a mechanism, not a heuristic.

**Three origins.** An **explicit ask** ("I want a calorie and nutrition tracker", "build me a…") *is* the decision and skips the ladder below: the module, a goal and the first tables exist within seconds and the first entry works at once; a deepen thread starts immediately in the background — research what such a thing usually does, combine it with what Alpha already knows (facts, other modules — a workouts module gets linked), build to the product-person bar (sources resolved by name, a page per thing, targets, freshness, filters) — and asks only where an answer changes the shape and is not already known (height and weight for targets, say). The result is shown with a remove affordance: "I added protein, fibre and a weekly view." A **goal-attached or recurrence-worded ask** ("keep an eye on", "every week", "track") is standing at once and deepened in the background. Only a need **inferred from repetition** goes through the ladder and ends in a proposal.

**Signals**, all cheap and journaled per request: (1) the ask's own words — recurrence ("every", "keep", "whenever", "track", "watch"), targets, scope; (2) repetition — count and periodicity of the same intent class (verb + object kind + connector); (3) hand cost — Alpha's effort on the last run (tool calls, seconds) and yours if observed; (4) substrate — does a connector exist, was the last run deterministic or exploratory; (5) goal attachment; (6) risk — outbound writes, money, third parties; (7) outcome — did the last run verifiably succeed, did you correct it.

**The ladder.**

- **Level 0 — do it.** First occurrence, no recurrence language, no goal: do it in the simplest durable form (a row in a collection Alpha creates on the spot — never a loose note) and journal the trajectory. "Log two eggs" with no diet module anywhere → a food-log table exists two seconds later with one row, and nothing else.
- **Level 1 — candidate.** Recurrence language, or a second occurrence, or a goal attachment: the run is recorded as a parametrised template with its variable slots identified. Nothing is visible.
- **Level 2 — standing.** Promote when (a) expected occurrences × hand cost clearly exceeds build plus upkeep, (b) at least one verified successful run exists — Voyager's rule, verify before you store — and (c) the abstraction is supported by two instances or an explicit recurrence ask. Procedures mined from behaviour without outcome verification transfer *negatively* (44.2% against 55.8% zero-shot, 2606.20363), so Alpha never keeps anything it has not seen work.
  The kind follows the substrate: a repeated conversational procedure → **Skill**; deterministic steps across apps → **Workflow** (deterministic replay with the agent as fallback and self-repair — the workflow-use / Stagehand pattern, about 10× faster and 90% cheaper than re-running the agent); ownerless recurring work with a trigger → **Automation**; data that must persist and be seen → **Module** with collections and targets.
- **Propose or just do.** A standing ask that only reads ("watch LinkedIn for backend jobs") → build it and show it, with one line and a remove affordance. Derived from repetition → propose in the digest or at a breakpoint, with the evidence ("you have logged meals six times this week — want targets and a weekly view?"). Anything that will write outbound → always propose, gates set at creation.
- **Deepen.** When a module comes from a standing ask, a background pass researches what such a thing usually does and proposes the additions — never blocking the first entry. This is your diet example end to end: the table now; "protein, fibre, targets from height and weight?" later, as a card; and, weeks on, the sleep-time pass noticing workout entries in another module and proposing a target change.
- **Junk avoidance.** Create only from verified runs; abstract, never clone (dedupe by behavioural equivalence); every artifact carries provenance, a test and a triggering description; unused for N cycles → demoted to candidate; failing twice → fallback and a repair task, never silent retries; a rejected proposal suppresses that class for a long cooldown; removal deletes everything related.

---

## 7. Trust and governance

- Every action is journaled: connector, tool, input, output, who approved, what changed. That *is* Activity, and it is the audit.
- Outbound writes are pending actions the companion shows; your yes runs them. Standing permissions arrive later, per kind ("you can always update an application's status"), learned from your answers and gated by confidence through the System One seam.
- Undo where the connector allows; where it does not, the journal shows exactly what was sent.
- An Access page: every connection, what it reaches and at what level, every grant to a skill.
- Source content is data, never instruction: an email cannot tell Alpha what to do.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | The journal as Activity (day groups, All / Alpha / You / Failed, a row opens to what was done and why); actions with cards and standing sentences with Revoke; known, assumed or asked with provenance on every value; the second opinion; a trial on every build; automations cannot act outward; an action's state moves atomically. |
| Differs | Connections in Intelligence says what each connection reaches; there is no Access page. |
| Not built | Undo; the Access page; the checklist view (asked / done / assumed) in Activity. |
- **Known, assumed or asked (decided and built 2 October 2026).** Every value Alpha writes or says is one of
  three things, and Alpha knows which: *stated* by the person; *looked up* from a source it can
  name (a label, a listing, a document, a page), which is what happens to anything that can be
  known that way, never a guess; or *estimated*, only for what cannot be known, and said so. When
  the result depends on something unknown that cannot be found out (which bottle size, which of
  two people), Alpha asks before acting when the readings differ a lot, or acts on the likeliest
  reading and says what it assumed, in the reply and on the record. Never a silent pick. Records
  carry this as provenance (`source`, `estimated`, `assumed`); the table page shows which numbers
  are known and which are guesses. The bar is the one a person holds Claude to in a chat: the
  exact number with its source, or an honest "I assumed" or "which did you mean?".
- **A second opinion.** After a turn in which Alpha wrote values it worked out itself, the same
  sentence is answered again by the same model with web search and nothing of Alpha's, a judging
  run compares the two, and the verdict is journaled (`checked`). A difference the independent
  answer can source goes back to Alpha as a turn: it corrects the records from the source and
  says so in the conversation, or says why it stands by its own. Every finished build tries the
  plan's *trial* (the first thing the person will do with it, in their words) and is sent back
  while the trial's answer differs from an independent one, up to twice; then the report says so.
  "It ran" is not "it works".

---

## 8. Workspace and companion

The workspace is where the person *works* — their tables, their flows, their connected apps in one place — with the companion beside it; it is also where they check what Alpha did. Alpha is a work tool with a companion, not a personal assistant with a window. Every surface answers one of three questions: what needs me, what do I have, what did Alpha do and why. (Research: `design/research/workspace-ui.md`.)

**Rail:** Today · Modules (listed directly, grouped by project when there is one) · People & Companies · Intelligence · Activity. Search everything with ⌘K. Gone: the Home wizard, the technical Settings groups, the session switcher.

- **Today** — two lanes. *Needs you*: outbound actions, questions, drafts — each card is the action in plain words, the evidence it rests on, one line of "because…", and Yes / Change / Not now; decide-once for recurring senders and sources. Approval is per action; a plan preview exists only for multi-step work and still gates the consequential step — plan approval was found to lower scrutiny during execution: of problematic actions that reached execution, users blocked only 21% (2604.04918). *Digest*: the twice-daily brief as sectioned cards (top actions, calendar, follow-ups, noticed), each with thumbs and "why am I seeing this", expiring at the next digest unless kept — a destination that resets, never a feed (the one proactive UI that survived with users, ChatGPT Pulse). Badge only for Needs-you. Onboarding is Today's empty state.
- **Module** — 2–4 summary cards Alpha chose; the derived views we already have (table, board, list, calendar, chart; inline edit; record panel; saved lists as named filters); "What runs here" (its automations as sentences with next run) and "Recent changes" (Alpha's edits, each undoable); the conversation scoped to it, with its threads.
- **Person / Company** — facts with a provenance popover (source, date seen, valid from/until) and an inline "wrong?"; a cross-source timeline (emails, meetings, messages, pages read, turns that mention them, Alpha's actions about them — the personal-CRM pattern of Clay, Folk and Attio); related records and modules; keep-in-touch as a card, never a setting.
- **Intelligence** — *Skills*: what Alpha can do, each a plain description, runnable from there, with its runs and evidence; "remember how I do this" makes one. *Automations*: every flow across modules as a sentence with its trigger and next run, on/off. *Connections*: every app and site — connected / needs your OK / broken, fixing — what each can reach and which modules use it. *Knowledge*: facts with provenance, standing instructions and standing permissions as editable sentences, goals, Alpha's notes. Everything here is a sentence that can be switched or corrected in plain words; no configuration forms.
- **Activity** — what Alpha did, chronological, filterable by module or person; statuses only Done / Waiting for you / Stopped / Failed; each row: what, because of which instruction, evidence, Undo with a stated window or "cannot be undone" said before the yes. Opening a row shows *what was asked, what was done, what was assumed* as a checklist (✓ done / ? unknown / ✗ contradicted) before any trace: reviewers shown action traces missed errors in 50–83% of tasks, while the checklist-plus-assumptions view reached 77% accuracy against 57–63% (2602.16844). The verbatim journal lives here, search-first and grouped by day, with per-source "forget this" — not a scrubbable timeline (Rewind's lesson, Recall's backlash).
- **Conversation** — one stream on the right, collapsible, scoped by the page; threads as cards; answers cite the records they used. Nothing requires it: the rail and ⌘K are sufficient.
- **Companion** — a non-activating floating panel on all Spaces showing a presence state (idle / listening / working / needs you — a visible state cut disruption 4.6→3.8 in CHI 2025), at most one line and one action, deep-linking to the exact card in the window; the same stream and threads; a keyboard path for every voice action.
- **Visual** — light, native and spatially stable (Things 3 / Craft rather than developer-tool density): system font, two panes, optimistic updates with undo, motion only for state change, light and dark from day one. Nothing technical shows anywhere.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Rail Home · Activity · People & Companies · modules · Intelligence · Settings · New; Home's lanes (Needs you with asks, proposals, plans, suggested facts and action cards; Alpha is working on, live; Coming up; Your modules); module pages with table, board, list, calendar and chart views, inline edit with provenance, a record drawer, saved lists, sources and automations; person pages; Intelligence's four tabs; the Claude-like panel with the conversation strip and Done; the companion with presence, choice pills, decisions in the bubble and Open to the conversation's page. |
| Differs | Home stands for Today. The look stays as Kenil chose on 1 Oct; the type loads from Google. Hidden windows keep polling (checkpoint). |
| Not built | The digest; decide-once; ⌘K; Undo; the checklist; per-source forget; launch at login; speech out. |

**Layout and look stay as they are today** (Kenil, 1 October, after seeing a lighter redesign: "keep it similar to current alpha"): the 224px rail with the brand mark, Home, Activity, projects, modules, New and the theme control; serif headings and metric numbers; the module page with its App · Activity · Settings toggle and subtabs; the table toolbar with view toggles and the record drawer; the 380px assistant panel with its header and "uses your Claude subscription" footer; the blob companion with its bubble. The new content (Needs you, the brief, People, threads, provenance, undo, Knowledge) is placed inside that structure. Prototype: https://claude.ai/artifact/5xNamEYxSyYRoGtnX7bQyQ.

---

## 9. Model route

- **Now:** Claude Code sessions on your subscription, with Alpha's world exposed as an MCP server (tools: search, query, entity, facts, notes, collections, skills, connectors, propose, ask, journal). Claude Code brings agentic retrieval, compaction, skills, Claude in Chrome and Anthropic's Gmail and Calendar connectors at no extra cost. A turn is `claude -p` with the pre-pack; background runs are isolated sessions; sleep time is one session.
- **Later:** the Anthropic API behind the same tool surface with our own loop; Jev or Laya at the System One seam.
- **Planned to break on the switch:** Claude in Chrome (→ the Chrome 144 bridge) and Anthropic's connectors (→ our own Google app, CASA for Gmail).

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | `claude -p` with the rules and the pre-pack appended, the world as a strict MCP server, Alpha's tools plus web search and fetch, the file and shell tools denied; Sonnet by default; independent and judge runs on the same route, Haiku for the System One seam; a live conversation's session resumed, nothing else. |
| Differs | Claude in Chrome and Anthropic's connectors are not used, so nothing of theirs breaks on a switch; the CLI, not the SDK (its flag support unverified). |
| Not built | The API route; Jev or Laya at the seam; a third-party login for other people (needs Anthropic's approval); a timeout on a run. |

---

## 10. Repository and what we carry

A new repository. Suggested shape:

```
core/        world store (journal, entities, facts, collections, notes, goals),
             sensors, triage, scheduler, connector registry, runtime, HTTP API
mcp/         the world as tools for the model
connectors/  built-in: browser, files, calendar; later mail, contacts, notes
skills/      built-in procedures
desktop/     Tauri + React: companion and workspace
tests/  docs/
```

Carried over with their tests, and only where the design calls for that exact thing: `browser_session.mjs`; `voice.tsx`; `avatar/*`; `DataPage.tsx` re-fitted to one store; the record store's compare-and-swap writes and provenance; `sessions.py` (verbatim turns with FTS5); `profile.py` generalised into facts; `scheduler.py`; `harness_claude_cli.py`; `models/gateway` and `structured`. Never the app contract, the build pipeline, the planner, the verifier, the workers, or per-module stores.

| Status (3 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | `core/alpha/{world, context, runtime, mcp, api, connectors, journeys}`, `connectors/{browser, files, calendar}`, `desktop/`, `journeys/`, `docs/{STATE.md, design, log, journeys}`, `core/tests/`. Carried over: the browser driver, the voice and avatar, the data page, compare-and-swap record writes with provenance. |
| Differs | No `skills/` or `sensors/` directories: skills are a table, sensors are the scheduler and the watchers. |
| Not built | — |

**Order of work** (no dates): (1) the world store — journal, notes, collections, goals — the MCP server, the stream with threads, and a companion turn that does Level 0; this is the notes-first milestone inside the full design and gives a working companion first. (2) Browser, files and calendar connectors, and the derived pages in the workspace. (3) Sensors, triage, the sleep-time pass, the digest, the Inbox. (4) The entity registry and bi-temporal facts across sources. (5) The standing-things ladder with promotion from verified runs. (6) Pending actions and Access. Then email, contacts, the Chrome 144 bridge and the API route. The two judging journeys — diet; LinkedIn and jobs — are run through the system at every step and never wired into it.

*Where each step stands is `../STATE.md`, rewritten every session.*

---

## 11. Decisions

**Decided 30 September 2026:** Kenil accepted every recommendation below except Q1. No Apple Developer ID for now; local builds are signed with a self-signed certificate so macOS permission grants survive rebuilds, and a Developer ID is taken up only when the app is distributed.

| | Decision | My recommendation |
|---|---|---|
| **Q1** | Get an Apple Developer ID now ($99/yr)? Without a stable signature, every Calendar, Contacts and Full-Disk grant is lost on each rebuild. | Yes, now. |
| **Q2** | Process topology: the Python core as a child of the Tauri app (inherits permissions; the app is the always-on process, launched at login with a menu-bar item) or a separate daemon. | Child of the app. (3 Oct: child of the app with a tray item; launch at login not built.) |
| **Q3** | LinkedIn: read in your own Chrome at human pace, propose outreach, you send — or bulk export and automated outreach, the pattern LinkedIn enforces against. | The first. |
| **Q4** | Google: keep Gmail out of scope until a Google app and CASA are justified; use Anthropic's Gmail connector on the subscription meanwhile. | Agree. **Revised 2 Oct 2026:** Kenil: Gmail read through Alpha's signed-in browser is fine (it is how it runs now, read-only). |
| **Q5** | Low-stakes facts (units, quiet hours): may Alpha accept them silently with a visible trail, asking only for facts that change behaviour? | Silent for low-stakes. |
| **Q6** | Digest rhythm: two fixed times a day, set once by you. | Fixed, not learned. |
| **Q7** | First weeks: digest and cards only, no notifications until trust is built. | Yes. (3 Oct: cards only; no digest and no notifications exist.) |
| **Q8** | May Alpha make read-only standing things (a watcher, a table) unasked at Level 2 and just show them, or must it always propose first? | Make-and-show for read-only; propose for everything else. |
| **Q9** | Screen capture: confirm not in v1. | Not in v1. |
| **Q10** | The internal daily compute budget: a hidden policy (Alpha batches more and says nothing) or may Alpha mention it? | Hidden. **Revised 2 Oct 2026 (Q18):** no budget and no limits at all; the person stops what isn't going anywhere. |
| **Q11** | Names: is the About-you material called "Knowledge" inside Intelligence, and are "Today" and "Activity" the right words? | Your call. |
| **Q12** | Standing permissions as learned, editable *sentences* in Knowledge ("you can always add calendar events") — behaviour, not a settings matrix — or a fresh yes for every outbound action, forever? | Sentences, learned from your answers. |
| **Q13** | Undo: state the window on every action; irreversible ones (a sent message) say so before the yes. | Yes. |
| **Q14** | The verbatim journal: search-first with day grouping inside Activity, or a browsable timeline? | Search-first. |
| **Q15** | Correcting a fact or merging two people: inline on the page *and* by telling the companion? | Both. |
| **Q16** | Digest: two fixed times, each shown at the first task boundary after it. | Yes. |

**Decided 1–2 October 2026**, each after a real failure, all built:

| | Decision | Decided |
|---|---|---|
| **Q17** | The capability model: the platform builds few universal hands and the walls; Alpha builds, tests and repairs the know-how (readers, procedures); never site logic in the platform, never a hand-patched reader. | 1 Oct, after the LinkedIn sync (20 of 1,574). §4.0 |
| **Q18** | No limits anywhere: no step cap, no time limit, no quota, no budget; the person stops a run or a build, and a stopped build resumes. | 2 Oct, after the ETA build hit the 80-step cap. |
| **Q19** | Plan first, by mechanism: understand, research, look at the sources, propose with a trial; build only after the yes, in the background; know-how as pipelines; failures explicit as source statuses. | 2 Oct, after the blind ETA build. §6 |
| **Q20** | Known, assumed or asked; a second opinion on answers Alpha worked out; a trial on every build. | 2 Oct, after the shake (160 vs 215 kcal). §7 |
| **Q21** | Threads are records, never remembered model sessions; what the model saw is kept per turn; instructions change only on the person's own words. | 2 Oct, after a stale belief carried across runs. §3.6 |
| **Q22** | One floor stays: an automation runs at most every 30 minutes (was 15, undocumented). Everything else unlimited (Q18). | 2 Oct evening, after the code read listed the hidden floor. |
| **Q23** | Site vocabulary out of the hands: generic sign-in and paging detection only, one `url` key, no Sites section in the browser skill; Alpha learns a site's addresses and walls itself. | 2 Oct evening, after the code read found LinkedIn's paths in the driver. §4.0 |
| **Q24** | The write route, generic: one acting hand; procedures as Alpha's know-how with an effect (prepare / send); every outward effect an action the person approves after a dry-run preview; prepare asks once per procedure then a standing sentence, send asks every time; the first journey is Kenil's real draft in his real Gmail. | 2 Oct evening, after Alpha refused to draft an email. §6.1 |
| **Q25** | Files in and out: a download is a read into Alpha's own folder per module (the plan decides and proposes keeping files; never silent growth); the person drops files onto a module or a row and Alpha reads them; a file sent by a procedure is an upload step on a document Alpha keeps and asks every time; tables export as CSV or Excel. | 2 Oct, late evening. §6.2 |
| **Q26** | The memory round (§3.7): a wiki with an index; noticing; context by relevance; conversations first-class, parallel, with resumed sessions while live and a world delta; the companion as a mouth with one focus and rule-based routing; skills unified with an index and composition; the System One seam now; memory journeys first. | 3 Oct, early, after a long discussion. |

---

### Appendix — research behind this

- `design/research/memory-and-context.md` — 19 systems compared; eight strongest findings; three candidate architectures and the ranking.
- `design/research/connectors-and-sources.md` — connector platforms, browser control options, macOS native sources, the connector shape, build vs leverage.
- `design/research/proactivity-and-standing-things.md` — 17 proactive products, interruption evidence, the four-layer mechanism, the standing-things ladder.
- `design/research/workspace-ui.md` — 25 second-brain products and 20 agent workspaces compared; the review, approval and explanation evidence; the recommended information architecture.
- Jev / System One models: TypeSafe docs and cookbooks, arXiv 2609.30216, the Laya comparison (summarised in the chat of 30 Sept 2026).
- `design/research/competitor-kanu.md` — Kanu (getkanu.com, 2 Oct 2026): the same thesis sold top-down to enterprises with forward-deployed engineers; what Alpha lacks (finished deliverables, enterprise connectors, a feedback-to-behaviour loop), what Kanu doesn't show (a person-sized, local, self-serve product with provenance per value), and what it means for the pitch.
