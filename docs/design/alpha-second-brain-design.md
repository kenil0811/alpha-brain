# Alpha as a second brain — design proposal

30 September 2026, revised the same evening after discussion (sessions → one stream with threads; modules stay first-class; Intelligence stays; interrupts at boundaries, not idleness; explicit asks skip the ladder). **Intent only since 3 October 2026:** each section ends with a status box (built / differs / not built); the current state is `../STATE.md`, the dated history `../log/`. Until 3 October every section ends with an *As built* paragraph that says what exists, what differs from the text above it and why, and what is not built. Where the two disagree, *As built* is current; the original text is kept as the intent. Decisions taken since 30 September are in §11 (Q17 onwards; Q50 by 15 October).

**How to read.** Numbered principles are the test for every later decision. Evidence is cited inline (arXiv ids, product docs); the research reports behind it and the Jev notes are in `design/research/`. **Q1–Q50** at the end are the decisions, each with the recommendation and what was decided. What ran, commits, tests and what is pending are `../STATE.md` and `../log/`; `build-plan.md` holds what does not change by the day.

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

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | 1, 2, 3, 4, 5, 7, 8, 9 and 10 hold in the code; 5 by mechanism (actions with the person's yes; automations cannot act outward, a code guard since the checkpoint). |
| Differs | 7 has one floor, 30 minutes between an automation's runs (Q22), and mechanism thresholds that are not settings (the pack's 14,000 characters in budgets per section, a conversation idle 30 minutes, a Mac awake 60 s). 2's cross-linking is a mechanism no live table uses yet. |
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

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Home stands for Today (Needs you, Didn't work today, Alpha is working on, Coming up, Your modules); People & Companies with a page per person or company; Intelligence (Map, Skills, Agents, Connections, Knowledge); Activity with a page per entry; the Assistant page; Settings; ⌘K. |
| Differs | Skills are one table of kinds read, act and run (readers, procedures, pipelines). Entities are shown only where Alpha resolved them. |
| Not built | Today's digest. |

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

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | All six as tables (`world/store.py`): the journal verbatim with FTS, tombstones and what the model saw per turn; entities with hard keys, merge and unmerge; bi-temporal facts; collections with per-row provenance and versions; notes as wiki pages (person, module, topic, entity, skill scopes; a summary each; an index); goals. Around them modules, threads, workflows with their versions, sources, skills, actions, permissions, automations and their runs, documents, events, connections, preferences. |
| Differs | Removal is a purge that keeps the journal, not a re-projection; a module can also be removed with its data kept, a state it is restored from (Q43). The index is every page in one line inside each pre-pack, not a 200-line file. |
| Not built | The same-person judgement for soft candidates (same-name people are shown with "Same person"); unmerge from the app; linking across sources by itself (no live table declares its rows as people); deleting a page. |

**Why this shape.** Verbatim text beats extracted facts by 16–22 points, and extraction should be added beside text, never substituted for it (arXiv 2601.00821). Mutable facts need update-on-write: on changed facts, embedding retrieval scored 0.30–0.95 across seeds, a structured fact store 0.75–1.00, and hybrids were *worse* than the fact store alone (MERIT, 2609.05441); Mem0's own tracker shows an accumulate-only store keeping "works at A" and "works at B" both live (mem0 #4956). Notes-only memory decays with tenure — 96% at three weeks, 72% at nine — while provenance-typed structure rises (2607.21962). A compact behavioural spec kept apart from facts beat four memory products on interpretation at 25× less context (2605.28969). The products that survived (Claude Code, OpenClaw, ChatGPT's profile) all pair a small always-loaded index with on-demand reads and idle-time consolidation. And the signature move — a recruiter's email → the application it concerns → the contact at that company — is a two-hop join on an entity registry with hard keys: relational, no graph database (graphs only pay off for multi-hop synthesis; GraphRAG-Bench 2506.05690).

### 3.2 How context reaches the model

Two mechanisms, in this order:

1. **Pre-pack** — deterministic, zero model calls, two to four thousand tokens: who you are and your standing instructions (capped); active goals; the notes index; entity cards for anything the sentence or the event names (matched by key or name); the last N journal lines; full-text hits for the sentence's terms; today's calendar; pending asks and notices; connection state. Every line names its source.
2. **Agentic retrieval** — the model has tools: search the journal (FTS5 with time and kind filters), query collections, look up an entity and its facts, read a note or a document, read a source item verbatim. It decides what else it needs, in as many steps as it needs. Results come back inline, not as files: grep beat vector search on every harness when results were inline and lost when they were delivered as files (2605.15184).

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | The deterministic pre-pack (`context/prepack.py`), 14,000 characters in a budget per section: NOW · WHO THE PERSON IS · THEIR INSTRUCTIONS · ACTIVE GOALS · WHAT ALPHA HOLDS · WHAT ALPHA CAN REACH · WHAT ALPHA CAN DO · TODAY'S CALENDAR · WHAT ALPHA KNOWS · THIS MODULE'S PAGE · WHO THE SENTENCE NAMES · THIS CONVERSATION · SINCE YOUR LAST TURN HERE · WHAT WAS SAID <DAY> · MATCHES FOR THIS SENTENCE · THIS THREAD · OPEN. Agentic retrieval through 73 tools. |
| Differs | A section over its budget says what it left out rather than being cut blind; record and document match lines carry no date. |
| Not built | "So far today" totals in the pack (the module page works them out). |

**Embeddings: not at launch.** The journal's chunk ids and a fusion hook are designed now so an embedding column (sqlite-vec plus a small local MLX/ONNX model) can be added as one more signal later — but only after a personal evaluation (tasks that succeed with history and fail without) shows full-text plus structured recall is the bottleneck. Published rankings flip on the embedding model alone (±6 points, 2606.29914); vendor numbers should not drive this.

### 3.3 When memory changes

- **At write:** hard-key facts supersede; entities resolve on hard keys; structured sources (calendar, LinkedIn rows, email headers) need no model at all.
- **Per turn:** nothing is rewritten. The turn is journaled; anything Alpha learned about you is recorded as a suggested fact.
- **Sleep time** (nightly, and after a long idle): one bounded pass reads the journal since last time; updates module notes and the profile summary; promotes suggested facts that have enough evidence; writes "tried / failed"; links entities across sources; looks for patterns across modules (this is where "you started running, so your protein target should move" is found); prepares tomorrow (meetings, due follow-ups); assembles the digest; and retires what has gone unused. Generative Agents' reflection and OpenClaw's "dreaming", with a cap.
- **Before compaction** of a long session: flush facts and notes first, then summarise.
- **Recall is not use.** Agents acted on a correctly retrieved value only 55% of the time (MERIT), and sixteen systems passed recall tests while failing the matching behaviour tests (2607.29433). So the pre-pack states the facts that matter as instructions in context ("calorie target 2,000; 1,450 so far today"), and every action's result is checked against them.

| Status (14 Oct 2026; detail in `../log/`) | |
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
   topic splitting; no picker before speaking; no projects above modules (revised by Q31: a
   module may sit inside a module, one concept, any depth). **Memory is shared
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

| Status (14 Oct 2026; detail in `../log/`) | |
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

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Connectors as Agent Skills directories (browser, files, calendar: `connector.yaml`, `SKILL.md`, `scripts/`). Skills as one table (read, act, run) with health, provenance, when-to-use, site notes and an index in every turn. Automations as a schedule plus a pipeline (a run skill, no model) or a procedure, run by the scheduler in their own threads once the Mac is properly awake, held awake while they run. Modules with their sources and their workflow page (§12). |
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

| Status (14 Oct 2026; detail in `../log/`) | |
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

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Browser: Playwright, driving the person's own Chrome when it is on the Mac and Alpha's own Chromium otherwise (installed by Alpha on first run, Q34), a profile per signed-in site, the person signs in themselves in a window Alpha opens, a sign-in covers the sites it passed through. Files: watchdog plus pypdf, python-docx, openpyxl, python-pptx and plain-text kinds into documents with FTS (50 MB and 400k-character limits). Calendar: EventKit, 30 days back and 60 ahead, every five minutes. |
| Differs | Not Claude in Chrome. A sign-in counts as done when any cookie is set (a heuristic). The file watcher runs only while the core runs. Gmail is read in the browser (Q4 revised). |
| Not built | Reading only what is new on a list read daily. |
- **Screen capture.** Not in v1. Every consumer product that shipped continuous capture was killed or forced opt-in (Rewind's capture ended December 2025, Limitless was sold, Recall was redesigned); the one research system that made it work (GUM) did so for five people behind a strict utility gate. Revisit once the connector-only brain is trusted.

### 4.2 Leverage, build, avoid

- **Leverage:** Claude in Chrome; Anthropic's connectors on the subscription; the Agent Skills format; the MCP Filesystem server; `chrome-devtools-mcp` later; pyobjc; MarkItDown and pypdf.
- **Build:** the connector manifest and registry; the native macOS connectors as one signed, permission-correct bundle (nobody ships these); the procedure-recording layer; the repair hook.
- **Avoid as the auth layer:** Composio, Nango, Pipedream, Arcade (tokens held in their clouds, no production escape from Google's verification, per-call metering); Zapier MCP (task-metered); Merge, Unified, Paragon (B2B pricing); Unipile (unofficial LinkedIn access).
- **LinkedIn.** The official API exposes no connections, jobs or messaging. §8.2 of the user agreement forbids bots that download contacts or send messages, and vendors report about 40% of accounts on non-compliant tools restricted in Q1 2026. The lowest-risk posture is: Alpha reads pages in your own Chrome at human pace, proposes outreach, and you send. (Q3)

| Status (14 Oct 2026; detail in `../log/`) | |
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

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Entry 1 (`runtime/turn.py`: the sentence, the pre-pack, one run with the world as tools, the reply and what the model saw, journaled); conversations with routing by structure then the judge (§3.7). Entry 2 in part: file changes, the calendar, the scheduler's tick, the queue of agreed workflow builds, each journaled as `saw`. The System One seam (`runtime/judge.py`), used for routing and noticing on Haiku. |
| Differs | Cost has no limits or budget (Q18); the person stops a run. Builds and automations run in their own threads with no resumed session. |
| Not built | Entries 3 and 4: triage, deliberation, sleep time, the digest; the speaking-up ladder; same-person, triage and rerank through the seam; collection-change and person-context signals. |

---

## 6. When something becomes standing

**Revised 2 October 2026 (Kenil): understand and propose before building.** After Alpha built nine tables and eight readers blind for a vague ask and ran out of time, the rule is: Alpha never builds on a request straight away, however it is worded. Plain actions ("log two eggs", "what did I eat today") are still done at once, and a log with no home still gets the simplest table on the spot (Level 0, one table, one row). Anything else that would set something up goes through three steps, the same for every kind of request:

1. **Understand and propose** (reading only). Work out what the person means, using what Alpha already knows (their files, facts, modules); research how it is best done; look at the actual sources (what is readable, what needs a sign-in, what blocks automated reading); decide what is worth tracking and how. Reply with a **plan**: what was understood, what was found (every source and whether it is reachable), what would be set up and why, what can't be reached and what to do about it, and the questions that genuinely depend on the person, numbered.
2. **The person's yes.** In the conversation (Alpha records it with the person's own words, which must come after the plan) or with the plan's button. Until then the tools that make lasting things (modules, tables, readers, automations, sources) refuse: the gate is in code, not in instructions.
3. **Build in the background.** The approved plan becomes the brief of a build thread (§3.6). The build runs to completion however long it takes: there is no limit on a run or a build (Kenil, 2 Oct: "it's impossible to set limits for these things"); a run that ends before its work does is continued from the brief and the thread's history, and the person can **stop** a build, or any turn, when it isn't going anywhere. A stopped build says what it made so far and carries on from its brief when the person says continue. Progress shows on the thread's card. The report comes back into the conversation and always ends with what the platform knows about coverage: sources working, needing a sign-in, blocked.

**Sources with a status.** Everything a module reads from outside Alpha (a page, a folder, a calendar, an inbox) is a source the platform keeps, with a status: *working* (rows, last read), *needs sign-in* (Alpha opens the sign-in window and asks once; the source carries on once signed in), *blocked* (a bot check or captcha: stated plainly, another route proposed; Alpha never tries to get past it), *broken* (Alpha repairs it), *not built* (shown, so nothing falls off silently). The browser tells sign-in walls and bot checks apart by itself and updates the sources of that site. Modules show their sources; anything needing the person is in Needs you.

**Know-how as code; AI only for repair and judgement.** A reader is code Alpha writes, tries on a real run, keeps and repairs. An automation that only reads and stores is a **pipeline** of saved steps the scheduler runs with no model: run these readers into this table (with saved value mappings), then tell the person what changed. The platform keeps, for any table fed by readers, when each row was first seen, last seen, and gone (not returned by the reader that found it), so "what's new, what changed, what's gone" is a query, not a model's guess. The model is called only when a step breaks (repair the reader, rerun once) or a step needs judgement. AI-run procedures remain for work that is judgement throughout.

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | The yes on the workflow page starts the build (§12; plans, their trial and their questions were removed 12 Oct, Q40); the gate (`Tools._gate`) refuses making modules, tables, readers and automations outside a build; sources with statuses; pipelines. Agents, schedule first (Q33, 9 Oct): every automation is an agent's process with a goal, a page Alpha writes and the person edits (`agent:<id>`, read by the model when it steps into a run or a repair), a row per run in `runs` with a verdict judged by code (succeeded, partial, failed, and why), the model's time and the repairs counted, a broken reader repaired at most twice in a run, a failed run in the journal and the companion, the window's Agents tab and page. |
| Differs | `table_start` (Level 0) and edits to existing things are not gated. A build has no cap. Since 11 Oct (§12) step 1 is the interview and the workflow page, not a plan in one turn. Since 12 Oct (Q40) no path opens a build in which the model makes lasting things by tools: the page's build makes the tables by code and the walled session writes files; how a new automation or reader of its own gets made is open (automations are made by the person's words only through that door). |
| Not built | The three origins, the signals, Levels 1 and 2, promotion from repetition, the junk rules; of agents (Q33): event triggers, escalation to the person as a question, the digest, a brief per agent; the agents of Q44 (built-in roles with names, custom agents, @ for everything, memory and decisions per agent), the five built-in agents designed one by one (Q45–Q49) and how they are built (Q50: the substrate, the anatomy, and the agent page as the door Q40 asked for). (Since 9 Oct: reading in a run is refused and an automation converts itself to steps; a transient failure is retried after a minute; the schedule's words say "or when your Mac next wakes".) |

### 6.3 The research pass before a build (decided 9 October 2026; Q37; superseded by §12, removed 12 October, Q40)

Before a build, Alpha looked at the person's sources and the field, then proposed the module as a menu of
pieces, each with what made it possible or not yet. The workflow page (§12) replaced it: research is now a
lookup for sources and a few suggestions on the page. The full text of this section as it was decided is in
git history (the design document at commit `8ea259e` and before) and `research/research-before-build.md`.

| Status (12 Oct 2026) | |
|---|---|
| Removed | Superseded by §12 on 11 Oct and removed on 12 Oct (Q40): the `research` and `findings` tables, `research_start` and `research_look`, the pass's runs, the plan of pieces and its card, the `research_pass` journey, their tests. What stays of it: the sources on the workflow page's suggestions (§12). The prior art stays in `design/research/research-before-build.md` and the run in `../log/2026-10-09-research-pass.md`. |

### 6.4 Modules as programs: the workspace, the design document, milestones (decided 10 October 2026; Q38; superseded by §12, removed in part 12 October, Q40)

A module as a program: a workspace under git where Alpha writes code, a design document in stages,
milestones judged by an evaluator, and jobs with forms. §12 kept the workspace, the walled build run and the
proxy, and dropped the rest; the unit of a build is the whole first version of the person's workflow. The full
text as decided is in git history (the design document at commit `8ea259e` and before) and
`research/modules-as-programs.md`.

| Status (12 Oct 2026; detail in `../log/2026-10-10-workspace-spine.md` and `../log/2026-10-11-parts-for-real.md`) | |
|---|---|
| Kept (by §12) | The workspace under git (`runtime/workspace.py`), the walled build run (Claude Code's sandbox from Alpha's settings), `sandbox-exec` for the workspace's own scripts, Alpha's proxy as the one road out (`runtime/proxy.py`), the module's own tables read-only in the app. |
| Removed (12 Oct, Q40) | Plans with milestones and hosts, the design document in stages, the evaluator (`runtime/milestones.py`, `runtime/build.py`), `jobs.yaml` and the job forms, the `plans` table and its routes and cards, the `plan_*` tools, their journeys and tests. The run of 10 Oct stays in the log. |
| Open | The journaling proxy for the build session (a CLI pin bump to ≥2.1.285); `srt` shipped with the app; DuckDB's extensions in `just ship`. |

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

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | Procedures (act skills) with steps, fields, verify checks and placeholders filled from the payload; actions with a dry-run preview card, the person's yes in the app or in their words, decline; prepare-level standing permissions as sentences with Revoke; repair after a failure; "Sent, not confirmed" when only the check after the commit failed; upload steps restricted to Alpha's own folder; automations refused. |
| Differs | A send is never standing. A repair never re-proposes an action that committed. |
| Not built | Undo; sentences for sends; saying on the card when a dry run already leaves something behind (autosave). |
### 6.2 Files in and out (decided and built 2 October 2026, late evening; Q25)

- **In, from a connection.** `page_download` fetches a file through the person's session (a
  direct address with the site's cookies, or what a page hands back when a control is pressed)
  into Alpha's own folder for the module (`files/<module>` under the data directory, never the
  person's folders). It becomes a document (text extracted where Alpha reads the kind; the
  file itself is never run), searchable and readable in pages, and a table's new `file` field
  keeps its id; the page shows the file's name, Open and Show in Finder. A read: free once the
  connection is granted, journaled. Whether a module keeps such files is a sentence in the plan
  the person approves, or an ask; never silent growth. Removing the module removes its files.
- **In, from the person.** Files dropped onto a module page, chosen with its Add files button,
  or added to a row's file field go
  into the module's folder, become documents, and (for a module drop) Alpha reads them into the
  module's tables in a turn of its own, journaled as the person's addition and Alpha's reading.
- **Out, by a procedure.** An `upload` step names a payload field whose value is a document
  Alpha keeps; the hand refuses any other path. Sending a file reaches someone, so the action is
  a send: a card with the file's name and size, a fresh yes every time.
- **Out, by the person.** A table downloads as CSV or Excel into Alpha's exports folder,
  revealed in Finder.

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | `page_download` into Alpha's folder per module, documents with module and origin, drag-and-drop onto a module or a row arriving as a turn (and, since 3 Oct night, an Add files button on the module's page opening the Mac's picker, the same route), `file` fields, upload steps; a module's and a person's files listed with their dates and the records that use them, and deleted with what goes said first; downloads of exactly what a table shows as CSV or Excel. |
| Differs | An upload by Alpha asks every time; the workflow page says what is kept. |
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

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | The journal as Activity (day groups, All / Alpha / You / Failed, a row opens to what was done and why); actions with cards and standing sentences with Revoke; known, assumed or asked with provenance on every value; the second opinion; automations cannot act outward; an action's state moves atomically; a page per activity entry with Try again for any failure that can be redone; a record's History with Undo; every error a sentence. |
| Differs | Connections in Intelligence says what each connection reaches; there is no Access page. A build no longer tries a plan's trial (plans went, Q40): a workflow's part is kept only once it worked on real data, and the person's real run is the acceptance (§12). |
| Not built | Undo outside a record's page; the Access page; the checklist view (asked / done / assumed) in Activity. |
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

**Rail:** Today · Modules (as a tree since 3 Oct night: a module inside a module, folded or not) · People & Companies · Intelligence · Activity. Search everything with ⌘K. Gone: the Home wizard, the technical Settings groups, the session switcher.

- **Today** — two lanes. *Needs you*: outbound actions, questions, drafts — each card is the action in plain words, the evidence it rests on, one line of "because…", and Yes / Change / Not now; decide-once for recurring senders and sources. Approval is per action; a plan preview exists only for multi-step work and still gates the consequential step — plan approval was found to lower scrutiny during execution: of problematic actions that reached execution, users blocked only 21% (2604.04918). *Digest*: the twice-daily brief as sectioned cards (top actions, calendar, follow-ups, noticed), each with thumbs and "why am I seeing this", expiring at the next digest unless kept — a destination that resets, never a feed (the one proactive UI that survived with users, ChatGPT Pulse). Badge only for Needs-you. Onboarding is Today's empty state.
- **Module** — 2–4 summary cards Alpha chose; the derived views we already have (table, board, list, calendar, chart; inline edit; record panel; saved lists as named filters); "What runs here" (its automations as sentences with next run) and "Recent changes" (Alpha's edits, each undoable); the conversation scoped to it, with its threads.
- **Person / Company** — facts with a provenance popover (source, date seen, valid from/until) and an inline "wrong?"; a cross-source timeline (emails, meetings, messages, pages read, turns that mention them, Alpha's actions about them — the personal-CRM pattern of Clay, Folk and Attio); related records and modules; keep-in-touch as a card, never a setting.
- **Intelligence** — *Skills*: what Alpha can do, each a plain description, runnable from there, with its runs and evidence; "remember how I do this" makes one. *Automations*: every flow across modules as a sentence with its trigger and next run, on/off. *Connections*: every app and site — connected / needs your OK / broken, fixing — what each can reach and which modules use it. *Knowledge*: facts with provenance, standing instructions and standing permissions as editable sentences, goals, Alpha's notes. Everything here is a sentence that can be switched or corrected in plain words; no configuration forms.
- **Activity** — what Alpha did, chronological, filterable by module or person; statuses only Done / Waiting for you / Stopped / Failed; each row: what, because of which instruction, evidence, Undo with a stated window or "cannot be undone" said before the yes. Opening a row shows *what was asked, what was done, what was assumed* as a checklist (✓ done / ? unknown / ✗ contradicted) before any trace: reviewers shown action traces missed errors in 50–83% of tasks, while the checklist-plus-assumptions view reached 77% accuracy against 57–63% (2602.16844). The verbatim journal lives here, search-first and grouped by day, with per-source "forget this" — not a scrubbable timeline (Rewind's lesson, Recall's backlash).
- **Conversation** — one stream on the right, collapsible, scoped by the page; threads as cards; answers cite the records they used. Nothing requires it: the rail and ⌘K are sufficient.
- **Companion** — a non-activating floating panel on all Spaces showing a presence state (idle / listening / working / needs you — a visible state cut disruption 4.6→3.8 in CHI 2025), at most one line and one action, deep-linking to the exact card in the window; the same stream and threads; a keyboard path for every voice action.
- **Visual** — light, native and spatially stable (Things 3 / Craft rather than developer-tool density): system font, two panes, optimistic updates with undo, motion only for state change, light and dark from day one. Nothing technical shows anywhere.

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | The rail: Home · Activity · People & Companies · the modules (the person's order, nesting by drag, hiding, icons from names, a right-click menu) · Assistant · Intelligence · Settings · New. Home's lanes: Needs you (asks, proposals, suggested facts, action cards, workflow pages); Didn't work today (Try again for any failure that can be redone and how the try went, Open, Dismiss, Clear all); Alpha is working on; Coming up; Your modules. A module's page: table, board, list, calendar, chart, gallery and timeline views; inline edit with provenance; filters in the columns, grouping, saved lists as tabs, totals, a field set on ticked rows, paste from a spreadsheet, colour; fields added and renamed by hand; its files; renamed, removed with its data kept and restored, or deleted with what goes said first (Q43). A page per record (History from its kept versions, Undo, Notes), per person or company (with their files), per activity entry, per goal, per skill and per agent. Intelligence: the map of the person's world and of Alpha's work; skills, agents (a look each), connections and facts as tables; facts corrected and forgotten; goals by hand; everything remembered exported. The Assistant page and the panel: every conversation, renamed and deleted from its menu; each turn's time and steps; Retry where a turn failed; questions as cards; hold the mic to talk and send. The companion: presence, moods as poses, the person's chosen look, opening where it was left. Settings as cards. Plain errors, absolute dates, every delete confirmed; Activity back to its first entry; downloads of exactly what a table shows. |
| Differs | Home stands for Today. One poll for what changed, none while the window is hidden. The window's minimum is 1100×560; on a window too short for five rows, a table's page scrolls instead of its rows. |
| Not built | The digest; decide-once; Undo outside a record's page; the checklist; per-source forget; launch at login; speech out; buttons for the companion's focus and for moving a sentence to another conversation (their routes exist). |

**Layout and look stay as they are today** (Kenil, 1 October, after seeing a lighter redesign: "keep it similar to current alpha"): the 224px rail with the brand mark, Home, Activity, projects, modules, New and the theme control; serif headings and metric numbers; the module page with its App · Activity · Settings toggle and subtabs; the table toolbar with view toggles and the record drawer; the 380px assistant panel with its header and "uses your Claude subscription" footer; the blob companion with its bubble. The new content (Needs you, the brief, People, threads, provenance, undo, Knowledge) is placed inside that structure. Prototype: https://claude.ai/artifact/5xNamEYxSyYRoGtnX7bQyQ.

---

## 9. Model route

- **Now:** Claude Code sessions on your subscription, with Alpha's world exposed as an MCP server (tools: search, query, entity, facts, notes, collections, skills, connectors, propose, ask, journal). Claude Code brings agentic retrieval, compaction, skills, Claude in Chrome and Anthropic's Gmail and Calendar connectors at no extra cost. A turn is `claude -p` with the pre-pack; background runs are isolated sessions; sleep time is one session.
- **Later:** the Anthropic API behind the same tool surface with our own loop; Jev or Laya at the System One seam.
- **Planned to break on the switch:** Claude in Chrome (→ the Chrome 144 bridge) and Anthropic's connectors (→ our own Google app, CASA for Gmail).

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | `claude -p` with the rules and the pre-pack appended, the world as a strict MCP server, Alpha's tools plus web search and fetch, the file and shell tools denied; Sonnet by default; independent and judge runs on the same route, Haiku for the System One seam; a live conversation's session resumed, nothing else. |
| Differs | Claude in Chrome and Anthropic's connectors are not used, so nothing of theirs breaks on a switch; the CLI, not the SDK (its flag support unverified). |
| Not built | The API route; Jev or Laya at the seam; a third-party login for other people (needs Anthropic's approval); a timeout on a run (a run that goes silent is ended instead). The ChatGPT route exists (Q32) but is off until Codex lets Alpha's tool calls through. |

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

| Status (14 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | `core/alpha/{world, context, runtime, mcp, api, connectors, journeys}`, `connectors/{browser, files, calendar}`, `desktop/`, `journeys/`, `docs/{STATE.md, design, log, journeys, checks}`, `core/tests/`. Carried over: the browser driver, the voice and avatar, the data page, compare-and-swap record writes with provenance. |
| Differs | No `skills/` or `sensors/` directories: skills are a table, sensors are the scheduler and the watchers. |
| Not built | — |

**Order of work** (no dates): (1) the world store — journal, notes, collections, goals — the MCP server, the stream with threads, and a companion turn that does Level 0; this is the notes-first milestone inside the full design and gives a working companion first. (2) Browser, files and calendar connectors, and the derived pages in the workspace. (3) Sensors, triage, the sleep-time pass, the digest, the Inbox. (4) The entity registry and bi-temporal facts across sources. (5) The standing-things ladder with promotion from verified runs. (6) Pending actions and Access. Then email, contacts, the Chrome 144 bridge and the API route. The two judging journeys — diet; LinkedIn and jobs — are run through the system at every step and never wired into it.

*Where each step stands is `../STATE.md`, rewritten every session.*

---

## 12. Modules as workflows (decided 11 October 2026; Q39)

Why: three car wash builds in two days. The first (Q36 era) wrote the spec from Alpha's own
head and built a weighted average with no gates; the second, after the research pass (§6.3),
had a grounded plan and still built one table and a recipe; the third, as a program in
milestones (§6.4), built a real engine, screened 7,710 parcels and produced a 33-column table
whose pass list rested on borrowed interstate counts, with nothing a person could operate until
a job form was bolted on. Kenil: "such a complicated output is not useful / intuitive for a
user at all … modules are not just data and tables, they are workflows that are intended to
automate / help the user with their tasks … dont take baggage from current implementation."
This section is the module concept afresh; §6.3 and §6.4 keep their mechanisms (the walled
workspace, the evaluator, provenance, actions) and lose their shape (the research-first menu,
the ten-stage document, milestones as the unit).

**A module is the person's workflow.** The task they already do, as their own steps, in their
own words. Nothing about the steps is fixed by the platform: a site search, a bookkeeping
review and a newsletter have steps that look nothing alike, and Alpha writes whatever parts
those need. What the platform records about a step is only what it needs to run it and keep
it safe: *who does it* (Alpha, the person, or both: Alpha prepares, the person decides); *what
it takes and gives*, so parts connect and a change can be traced; *whether it reaches out*
(reads a source: journaled, every value with its origin) or *acts outward* (sends, posts,
changes something outside Alpha: always asks, §6.1); *when it runs* (when something arrives,
when asked, on a schedule, after another step). The walls hang on these properties, never on a
step's name. A module may hold several workflows; one at first.

**What a module keeps.**
- *Its model*: normalized things with relations (for the car wash: a site, its checks, its
  scores, its notes, its documents, the benchmark stores), never one wide table. Tables and
  the table views stay the default way to see things; a thing's page shows its parts together.
- *Documents*: templates and the instances made from them (a memo, a one-pager), editable in
  Alpha afterwards, exportable, usable from other modules.
- *Settings*: every threshold, weight and assumption, visible and editable, each with its
  origin (the person's, the trade's, Alpha's default). No knobs of the platform's (Q18); these
  are the person's.
- *Pages* that fit the work: a list, a page per thing, a document, settings, a chart, a map.
  The shell renders pages from a catalog of parts (table, list, item page with sections, text,
  document, form, chart, map, …); the catalog is open: when a person asks for something the
  catalog lacks, Alpha builds the renderer as a part (a self-contained view inside the shell's
  theme and data, walled like any other part) rather than saying no, and the catalog grows
  from what people asked. If the person asks for a map, they get a map.
- *"Your workflow"*: one page in the person's words, written and kept by Alpha: what the
  workflow is for, its steps, which Alpha does and which they do, what it keeps, what it
  assumes, what Alpha suggested and what they said. It is the record the build follows and
  the thing every later change edits. The person never edits it directly: they say what is
  different in chat and Alpha restructures it, keeping the previous version.

**Parts and the library.** Every step is done by a part with a contract: what it takes, what
it gives, its settings, and how it proves itself (tried on a real item; its outputs checked
against the contract: nothing borrowed, nothing unsourced, nothing estimated that was promised
as measured). Fetchers, computations, intakes (an email read, a dropped file), document
templates, page parts. Alpha composes a module from parts, writes new ones when none fit,
repairs them when they break, and keeps every proven part in a library shared across modules
now and across people later. **Where the line falls** (Kenil, 11 Oct: "basic standard
abstraction practices"): a library part knows a *system or a source* another module would use
(the LinkedIn connector with its sign-in and navigation, a Census lookup, an ArcGIS layer
reader, an email intake, a document template engine) and is written with named inputs and
settings; a module's *own logic* (which fields it keeps, its gates and thresholds, how it
scores, what its memo says) stays in the module and is never generalized because it could be:
"read this one detail about my connections" is a line in the module that uses the LinkedIn
part, not a part of its own. A module's own code becomes a library part only when a second
module actually needs it, never speculatively. A change to the
workflow touches the parts concerned; data is re-derived where that is safe and never where it
is the person's own (their scores, notes, decisions, edited documents); nothing is redone that
did not change.

**How Alpha builds one.**
1. *The interview, in chat.* The job and the decision it serves; the procedure today, with
   the person's own documents asked for and read in (a process, a scorecard, past cases);
   what enters and how; which steps are the person's judgement; what comes out and for whom.
   Decisive questions only, a safe default on each, guidelines rather than caps, adjusted
   when the person pivots; never asked what their documents already say.
2. *"Your workflow", drafted.* Alpha writes the page from the interview, structured, in their
   words, and adds its suggestions in a block of their own with accept or skip; sources are
   kept for every suggestion and every lookup and shown only when asked. The only research is
   what the workflow needs: which source can supply each lookup, whether an intake is
   feasible, and a few enhancements a person who does this work would want. The person's yes
   on this page is the yes (§6, step 2).
3. *One first version, whole and real.* Every step works end to end on one real item of the
   person's: thin, never garbage. A part is kept only once it worked on real data and passed
   its contract; the evaluator (§6.4) runs the workflow as the person would, through the
   pages, with checks that test the method, not the volume; and the acceptance is the person
   running their real flow once in the app, never a count of rows.
4. *Then it changes by conversation.* "Add a lot-size gate", "the memo should open with the
   verdict", "show them on a map": Alpha updates the page, changes or adds the parts,
   re-derives what is safe, keeps the rest, and keeps the version before.

**What this keeps and what it drops.** Keeps: the world's tables and views for the model;
the walled workspace, the proxy and the evaluator as the way parts run and are judged (§6.4);
actions with the yes for anything outward (§6.1); provenance on every value (§7); the
journal. Drops: the research-first menu of pieces (§6.3; research becomes a lookup for sources
and a few suggestions); milestones as the unit of a build (§6.4; the unit is the whole first
version, then changes); readers, procedures and pipelines as separate kinds of know-how
(§4.24; they are parts in the library); the ten-stage design document (one workflow page).
One person per module for now; several roles later.

**The car wash, as the person would see it.** They say they want help picking car wash sites.
Alpha asks: what decides a site for you today, and do you have it written down (they drop the
process document and the scorecard); where sites come from (brokers, by email); what you do
first and what you check; which items are your call; what comes out (a memo to investors). It
reads the documents and writes "Your workflow": a site arrives (typed as an address now, read
from the broker's email later); Alpha checks the trade area and the target zone from public
data (households within 3 miles, density, drive-time population, site and intersection traffic
on the fronting road, TAQ), every value with its source; you score the fourteen items on the
site's page with a note each, Alpha showing the evidence beside the ones it can see; you set
the development priorities; Alpha drafts the memo from your template; you decide; sending it
asks. Alpha suggests three things in their own block: check thresholds against your four best
stores; a map of sites and competitors; screen every commercial parcel in an area, not only
what brokers send. The person accepts two and skips one. The first version is built; they
add the site they looked at last month, score it, read the memo, decide. A week later they
say "add a minimum lot size of 0.8 acres", and the page, the check and the site pages change;
their scores stay.

| Status (11 Oct 2026, night; detail in `../log/2026-10-11-workflow-page.md`, `../log/2026-10-11-build-from-the-page.md` and `../log/2026-10-11-parts-for-real.md`) | |
|---|---|
| Built (pieces 1–2) | The interview in the rules; "Your workflow" as a record with versions, drafted, revised through the conversation (omissions carried, removals named), agreed in words or in the app; the card in the conversation and on Home; the build from the page: the module, one table per thing with relations, the settings table, the workspace, one walled session that writes parts with contracts and document templates; parts that fill rows through the core with the source and date of every value per field, when a row arrives, after another part, or when asked from the thing's page, which shows where each value came from or why it is not filled; a stuck build waits for continue. A part fills the thing it reads or one linked to it (one row per row read, linked, named after the part), reads linked rows, runs after a part once that part has run and again when it fills later; a changed setting or row tries the unfilled fields again; a person's edit keeps the other fields' provenance. Run for real: both journeys pass (the page in 467 s; the build in 951 s), and the real ask in Kenil's app: the scorecard built in 16 minutes, a site's gates, fourteen linked scores and memo filled by the app's own scheduler (`../log/2026-10-11-parts-for-real.md`). |
| Not built | The person's acceptance (the Census key into Settings, Try again, then a change by chat); documents drafted from templates with their page; the evaluator through the pages; the library across modules; the model's tools seeing a module's things. |

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
| **Q27** | The companion's characters are Bridge's (Manish's Zazoo Lab art and animal set), used with his permission: the artwork comes in as assets with a credit, the rig is rebuilt in Alpha's own code (paused when idle and hidden), the companion keeps Alpha's name, and the person chooses the animal and its look (fur, suit, tie, shirt, neckwear, glasses; from 3 Oct night also one of three sizes) in Settings, kept in the core as a preference. This is the one place the person meets options for looks, by decision. | 3 Oct, after the review of pull request #3 (`../log/2026-10-03-review-pr3.md`). |
| **Q28** | Ideas from a contributor's pull request come in as concepts rebuilt on main in Alpha's conventions, never as code copied over; the pull request is credited in the log. The first set (the table views, the UI kit, self-hosted fonts, resizable panes, addresses for pages, ⌘K on search, Intelligence item pages read-only for know-how, fact provenance, the module's page on its tab, quick entry, a desktop acceptance check, the UI rules) is §8 of that review. A knowledge graph is wanted but designed first. | 3 Oct, with Kenil. |
| **Q29** | A graph, in two steps (3 Oct 2026, from `knowledge-graph-proposal.md`): first a map of Alpha's own work (modules, tables, skills, automations, sources, connections; the world's own kinds of relation, each with its source), computed on each ask and drawn with a force layout in a worker (`d3-force`, the one library); the graph of the person's world (people, documents, pages) only after readers declare their rows as people, because measured on 3 Oct it would have been twenty dots and seven lines. Edges never come from similarity or embeddings: facts with a source, as everything here. |
| **Q30** | The map of the brain (3 Oct 2026, after the map of work was built): what Kenil wants from a map is "what my brain is, what's concentrated, what's important, what's not linked", so the default view is the person's world (themselves, their areas weighted by what happened, tables, documents, pages, goals, people and organisations, and the links between them), with the map of work kept as a toggle. Links Alpha infers are allowed as a trial, as suggested `related_to` facts with a reason and a source, dashed until the person says yes, never from similarity, dropped unless grounded in the evidence. The map asks the core only on first open and on Refresh, never on a clock; Refresh also runs the link-finding pass. |
| **Q31** | Modules nest (3 Oct 2026, night, Kenil: "nested projects/modules", like Job holding a Search module and a Resume module). One concept, not two: a module may sit inside a module, to any depth, by a `parent` (nothing per level). What a module owns stays its own; a parent is the place that holds its children: its page shows them, its summary, activity, automations and sources roll them up, a conversation on it reaches the whole subtree, the pack lists the tree with the sentence's own branch first, the maps draw the nesting, removal takes the subtree. Alpha makes a module inside another (`module_create` with `parent`) or moves one (`module_move`); the person moves one in its Settings ("Where it sits"). Revises the conversations round's "no projects above modules" (the `project` column stays unused). | 3 Oct night, when the areas Kenil keeps turned out to have parts. |
| **Q32** | A second way to think: ChatGPT through the Codex CLI on the person's own subscription, beside Claude through Claude Code (3 Oct 2026, night, Kenil: "similar to using claude subscription, can we add chatgpt subscription route as well?"). One route (`runtime/route.py`) in front of two runners with the same request; the person chooses in Settings (Thinks with), Claude when unset; the model tier is one alias the runner translates. Each runner keeps its own guard: Claude's allowed tools, Codex's read-only sandbox with approvals never and Alpha's rules as its standing instructions. The same caveat as Q1 for anyone but Kenil: a third-party app signing in to ChatGPT needs OpenAI's say, as claude.ai needs Anthropic's. | 3 Oct night; his Codex sign-in had lapsed, so the route is proven by tests until he signs in. **8 Oct:** Codex refuses Alpha's tool calls under its own approval gate ("user cancelled MCP tool call", seven of seven in Kenil's 8 Oct conversation; only bypassing its approvals and sandbox lets one through), and the model talked over the refusals; the route is off until it passes a real tool call, and switching routes will run one first. |
| **Q33** | Agents (8 Oct 2026, after four days in which the schedules ran only when the laptop woke, the ChatGPT route cut Alpha off from its own tools, and a module build was claimed approved that never was). Intelligence stays with the model; recurring standard work is code Alpha manages, the model repairs it. An automation whose procedure only reads into tables must be steps. An **agent** owns one recurring process of a module: a goal and scope, triggers (schedule first, events later), tools (its workflows, Alpha's reading tools in its module, acting only through actions with the yes), a guidelines page Alpha writes and the person edits, memory (brief, page, runs, facts), success and failure declared and judged by code with a verdict per run, a failure policy in code (retry, repair, escalate), and reporting (a line per run, the digest, the companion). The loop runs the workflow with no model and calls the model only on breakage, novelty, judgement or the person's ask. One agent per process; Alpha orchestrates; agents share the world and do not talk to each other yet. Built schedule-first on 9 Oct (`../log/2026-10-09-agents.md`): goal, page, runs with verdicts by code, the repair policy, reporting; triggers by event, escalation as a question and the digest left. | 8 Oct 2026 (`../log/2026-10-08-what-went-wrong-and-agents.md`). |
| **Q34** | Alpha on another Mac (9 Oct 2026, after Kenil shared the app with a friend and it didn't work: the bundle held only the window, the core ran from the repository's uv environment at a path compiled into the binary, and nothing Alpha needs was installed by Alpha). A shipped Alpha (`just ship`) carries its runtime inside the bundle: uv's standalone Python with the core and its locked packages, the official Node binary, the connectors with the browser driver and Playwright's installer; the host uses that runtime when it finds one in its own resources, the repository otherwise, and clears macOS's quarantine mark from its runtime itself. What the person must have is asked for inside the window on first run: Claude Code (Install, Sign in with their own subscription) and Alpha's own browser (Install: Chromium, about 250 MB); sign-in windows open in their Chrome when they have it, else in that Chromium. Not notarized: Kenil has no Apple Developer account and is fine with right-click › Open for now; Apple silicon only, macOS 14+. | 9 Oct 2026 (`../log/2026-10-09-fresh-mac.md`). |
| **Q35** | The conversation, closer to Claude (9 Oct 2026; Kenil: "questions are often just asked, there are no multiple choice options, it's flaky, i want the chat interface to be really seamless like claude", and a full-screen Assistant page above Intelligence). Measured first on his world: in a week, 23 replies ending with a question in prose against 2 ask cards, though the card and the rule existed. Decided: the reply's text shows as it is written (`--include-partial-messages`), with the steps so far inline and the first words' time measured per turn; a question left in prose becomes a card by mechanism, with options from the reply's own list, else from the System One seam when it is a choice, none when it is open (the rule to the model stands, the mechanism does not depend on it); the Assistant page is the same conversation at full width with every conversation, live and finished, down the left. Left for later from the same discussion: one automatic retry of a transient failure with a Try again card, identical replies collapsed and a stopped build posting once, long replies folded, copy and edit-and-resend, a plus for files in the composer, whether one stream should replace the per-page conversations. | 9 Oct 2026 (`../log/2026-10-09-chat.md`). |
| **Q36** | A plan's questions with their choices (9 Oct 2026; Kenil, on the first plan on the Assistant page: "when there are questions, why give build option? … if there are default, those should be visible"). A plan's questions are part of the plan: text, 2 to 4 choices, Alpha's default; the model puts them on `plan_propose`, and questions it leaves in the text are read out by the core with the seam supplying choices and the plan's own lean. The card shows them with Alpha's pick selected, the button reads "Build with these", and the answers (or the defaults, named as such) go into the brief the build reads. | 9 Oct 2026 (`../log/2026-10-09-plan-questions.md`). |
| **Q37** | The research pass before a build (9 Oct 2026, after the car wash module: Alpha wrote the spec itself from a one-line ask and four one-word answers, and built a weighted average with no gates in fourteen minutes; Kenil: "it needs to be a proper module… alpha should do a good scan of what all could potentially be helpful for such a product, and how well can it be built, and suggest those to the user so that they can decide"). Decided, with the evidence in `research/research-before-build.md`: the job's questions first, as cards, only the ones not known; every build ask gets a research pass in the background, breadth scaled by rule, each look an independent web run returning findings the core resolves by code; the plan is a menu of pieces (kept for you, your call, not this time) with evidence, how it would be built, whether it can be built now and Alpha's recommendation, decided with keep / skip / defer and one yes; `plan_propose` only inside a research thread; deferred pieces kept on the module's page; findings kept as a `topic:` page. Research first; computed things (gates, scores over rows) are a later slice, and the menu's "not yet" column is the measure of what to add. Kept apart from Q33's agents in name. | 9 Oct 2026 (`../log/2026-10-09-research-pass.md`). §6.3 |
| **Q38** | Modules as programs (10 Oct 2026, after the second car wash build: the research pass worked, the build was still one table and a recipe, because a module had nowhere to hold a program; Kenil: "i dont want a half ass working solution … look at the module built by my friend … it should be like this", and "i dont want to reinvent the wheel"). Decided, four yeses: a module is a workspace Alpha codes in (program, data, declared pages) inside Claude Code's own sandbox driven by Alpha's settings (deny-default, writes in the workspace only, network only to the design's hosts through Alpha's journaling proxy, secrets denied, `srt` for unattended runs); a design document agreed stage by stage (job → findings → the person's inputs → data model → sources per value → method with calibration → surfaces → loop → milestones → open questions), frozen per milestone; milestones one per fresh session, each ending in a real result the person opens, done decided by a separate skeptical evaluator with scripted checks first; a `pages.yaml` contract of five kinds rendered by the shell (table, map, report, settings, export); the data layer's defaults DuckDB + GeoParquet + Hamilton + provenance per layer + pointblank; a module's own settings page is the person's, not a platform knob. Prior art in `research/modules-as-programs.md`. Reverses "modules are tables, know-how is pipelines". | 10 Oct 2026 (`../log/2026-10-10-modules-as-programs.md`). §6.4 |
| **Q39** | Modules as workflows (11 Oct 2026, after three car wash builds in two days; Kenil: "such a complicated output is not useful / intuitive for a user at all … modules are workflows that are intended to automate / help the user with their tasks … dont take baggage"). A module is the person's own workflow as their steps, nothing fixed by the platform except what a step needs to run safely (who does it, what it takes and gives, whether it reaches out or acts outward, when it runs); it keeps a normalized model, documents (editable, exportable, usable elsewhere), settings with origins, pages from an open catalog (a map when asked), and one "Your workflow" page in the person's words that Alpha keeps and changes only through chat; every step is a part with a contract, proven on real data, from a library shared across modules now and people later; built from an interview and the person's own documents, suggestions alongside with sources kept and shown on ask, one whole first version accepted by the person running their real flow once, then changed by conversation preserving their own data. One person per module for now. Supersedes the shapes of §6.3 (the research-first menu) and §6.4 (the ten-stage document and milestones); keeps their mechanisms. | 11 Oct 2026 (`../log/2026-10-11-modules-as-workflows.md`). §12 |
| **Q40** | The superseded shapes go (12 Oct 2026; Kenil: "ensure the code and repo is clean, all old and stale stuff completely gone"). The research pass (Q37) and plans with milestones, the evaluator and jobs (Q38) were unreachable since Q39 closed `research_start` and `plan_propose`; they are removed with their tables (dropped by a migration, the journal keeps every line), routes, cards, tools, journeys and tests. Lasting things are made only inside a build; since no build but a workflow's walled session exists, the model has no door today for a new automation or reader of its own: an open question, not a regression hidden in dead code. | 12 Oct 2026 (`../log/2026-10-12-clean-sweep.md`). §6.2, §6.3, §6.4 |
| **Q41** | The features taken from pull request #5 (12 Oct 2026; Kenil, after the review and an inventory of the branch against main: "i dont want to blindly copy their code, i want you to review and decide how best to add those exact features we agreed on into the current code in a clean and modular way"). Taken: the data view (filters, several sorts, groups, footers, conditional colours, bulk edit, saved lists as tabs, the numbers strip); a page per record with History, Undo and Notes; each value's source, date and problem visible, Try again and the parts' buttons; a program module's own tables read-only; the Estimated and Assumed marks on the title too, both counted; a paste written one row at a time; plain errors, absolute dates, every delete confirming; the sidebar's order, icons, hiding and nesting, and the workspace's name; Home's tiles and "Didn't work today"; Settings as cards for what exists; Intelligence's graph, its facts as a table, Skills and Connections as tables, the agents as Alpha and the automations (Q33) with a look per agent; the assistant's picker of conversations, each turn's provenance and Retry. Skipped: star defaults, the load limit, the choice of record sections, a Depth knob with a stored default, Governance rules the runtime does not read, empty Settings pages, the new-project page past the interview, a Network item in the sidebar, Activity and the Assistant out of it, the CSV editing grid (B7, later), the branch's rewrite of this document and its Q39–Q42. The core's routes the window asks for (rename, delete and a Removed state for a module, a field added by the person, export, a goal, a memory page…) come after. | 12 Oct 2026 (`../log/2026-10-12-window-from-pr5.md`). §8 |
| **Q42** | How pull request #5's features come in (12 Oct 2026, night; Kenil: "one section at a time, making sure it aligns and adhers to current main design, what i want from the pr is the features and some guidance", then "before making the change, tell me exactly what you you going to change and how … so i can approve"). The branch is one visual system (its tokens, grid, type, kit, header and layouts were made together); main keeps its own. So each feature is built in main's own styles and components, never by taking the branch's design as a block, and the branch's rulebook is guidance (`research/ui-rulebook.md`, Vikas named), never a rule over main's look. Each section is first a written proposal of what changes and how; it is built only on Kenil's yes, seen in the Mac app before it is shown, and committed on his yes after his review. | 12 Oct 2026 (`../log/2026-10-12-window-from-pr5.md`). §8 |
| **Q43** | A module's lifecycle and the names Alpha gives (13 Oct 2026; from Vikas's asks A1–A4 as decided with Kenil on 12 Oct: "A4 Removed is a state"; then "ok lets do A1-A4 first"). A module can be renamed (its page goes with it). Taking one away asks which is meant: hide it, remove it with its data kept, or delete it with its data, which says first what goes. Removed with its data kept is a state: out of every list, search and Alpha's context, its automations stopped, nothing changed, listed in Settings with Restore and Delete; no expiry. A table's or list's name never repeats what holds it or a sibling's (the "Deals › Deals" a build made). | 13 Oct 2026 (`../log/2026-10-13-slice2-core-routes.md`). §8 |
| **Q44** | Agents, the shape every one shares (14 Oct 2026, design sessions 1–2; Kenil on 9 Oct: "dedicated agents throughout alpha", a research agent first, healing and proactive ones later; 12 Oct: "having multiple persisted dedicated agents"; 14 Oct: "I agree having certain predefined agents, however, for each of them, we need to first discuss what exactly they are and how they work", "i do want options for users to be able to create custom agents", fun default names that can be edited, and a clear description for users). One voice: agents work behind the companion and reach the person only through it, each with its name and face (Mac notifications later); @ addresses agents, modules and people. Every agent has one shape: a name (a built-in one has a default fun name, editable), a look, a description written for the person (what it is for, what it does and cannot, when it runs), a kind (built in: renamed, paused, its page edited, never deleted; custom: made by asking Alpha, which drafts its page for a yes, or from a form, and deleted with what it made), a scope (all of Alpha, or one module), what it may touch granted explicitly and never more than Alpha may, triggers (a schedule, an event, on demand, an @), memory (its page, its runs with verdicts, its decisions) and a conversation. The five process agents (Q33) become custom agents of their modules. The default roster, each designed in a session of its own before it is built: Sherlock (researcher), Watson (noticer, an agent rather than a step), Columbo (checker), Scout (recommender), Doc (healer). Decisions are recorded at the plan and choice level, not each step: the person's bind every agent (changed only by asking), Alpha's and an agent's own are open to revision with the reason kept, and shown when they touch something the person relies on. A checkpoint is either run state for the system or a restore point for the person. Evidence: `research/dedicated-agents.md` (one voice; @ inside the conversation; readers in parallel, one writer per thing; sprawl as the main failure; decisions on plans). | 14 Oct 2026 (`../log/2026-10-14-design-agents.md`). §5, §8 |
| **Q45** | Sherlock, the researcher (15 Oct 2026, design session 3; Kenil's first example of a dedicated agent, 9 Oct). Description for the person: "Sherlock looks into how others do something before Alpha builds it for you: tools, open-source projects, common practice and public data. It brings back what's worth having, with where it found it. It only reads; it never builds or changes anything." A fixed frame, a free method (Kenil: "tell me what would be best … should this be fixed, or should we let the agent decide"): fixed by mechanism are what it brings back (a few suggestions, each with a source and a reason naming the person's situation or dropped by code; questions with its pick; what does not apply, on ask), five lenses each covered or skipped with a reason (the person's own world first, tools that do the job, open source, practice with its pitfalls, public data), starting from its own page, and its walls (reads only; signed-in sites only through existing connections and only when needed; never a new sign-in; writes only its findings page and proposals). Free: which searches and pages, how deep per lens, reads side by side, and when it has enough (new reading no longer changes its suggestions). When: never for a plain action, a question, a log, a small change or "just build it"; a full look for a new workflow in a kind of work not seen before; in between, a small judgement on what the ask leaves open and what Sherlock knows (none, a quick look at the open parts, a full look), recorded as Alpha's decision; it starts by itself with Skip, shown in one line, and the person's words win ("no research", "look into it properly"). No time promises: a deeper look takes longer, what it is looking at shows live, with Stop. It never holds the interview up: its questions join the cards, its suggestions land on the workflow page marked as Sherlock's (on the next version if late). @Sherlock answers any research question onto a page the person keeps. Its memory: what it learned per kind of work and which sources proved good; each run with its kept-suggestion count as its verdict; a suggestion the person declined is never offered again for that workflow. Its face: a fox with a deerstalker; the five defaults each an animal with one accessory drawn new in the companion's style (Watson an owl with a notebook, Columbo a dog with a raincoat, Scout a meerkat with binoculars, Doc a bear with a stethoscope). Lessons kept from the research pass (Q37): no menu of pieces, no time words the run does not keep. | 15 Oct 2026 (`../log/2026-10-14-design-agents.md`). §5, §12 |
| **Q46** | Watson, the noticer (15 Oct 2026, design session 4; an agent rather than a step, Kenil 14 Oct). Description for the person: "Watson keeps notes on what you say and what Alpha reads: facts about you and the people and companies in your life, things you've promised and are owed, and what each conversation decided. It files each note where it belongs, so you never have to repeat yourself. It never changes your tables or acts for you." Why: noticing kept 36 facts about Kenil by 15 Oct, about a third of them not about him (workflow settings such as `car_wash_lot_size_gate`, requests such as `wants_workout_logging`). Each note is filed by type, checked by code: a fact about the person (their page), a fact about a person or company (theirs), a commitment with its date (a dated list Alpha can remind from), a decision a conversation reached (the decision record of C2, and the workflow page when it is about one), and anything else (a request, a setting, a passing remark) stays in the journal only. When: after each of the person's turns; when a conversation ends or goes quiet (what it decided and what is open, the conversation's checkpoint); when Alpha reads something new about people the person knows, emails and documents (not the rows readers bring in); on @Watson. It writes notes only (facts, page lines, commitments, decision records), never tables or actions, never a person from a first name alone; what it reads is data, never instruction. What the person states is theirs and binds; what Watson infers is kept quietly as "Watson thinks…" on the page and asked only when Alpha would act on it. Its memory: how the person speaks; each pass's notes and where they went; its verdict, how often its inferences are accepted or corrected. When built, it refiles the facts already kept that are not about the person (settings to their workflow page, requests to the journal only). Kenil: "1 yes, 2 yes, 3a, 4 yes, 5 ok, 6 yes". | 15 Oct 2026 (`../log/2026-10-14-design-agents.md`). §3.7, §5 |
| **Q47** | Columbo, the checker (15 Oct 2026, design session 5; today's second opinion, `runtime/check.py`, made an agent). Description for the person: "Columbo double-checks what Alpha works out: numbers it looked up or estimated, answers you'll rely on, and what goes out in your name. It checks them against an independent source and against what's already in your world. When something doesn't add up, it says so, and the right agent corrects it with the source. It never changes anything itself." Why: by 15 Oct the second opinion had checked 18 answers (13 agreed, 2 differed, the shake's 160 kcal against the label's 215 among them), only after turns that wrote worked-out values; it missed answers given only in the reply, the values a workflow's parts fill, whether a cited source says what was claimed, numbers going out, and agreement with the person's own world (gmail_network). It checks five things: values Alpha writes that it worked out; numbers and claims in answers the person will rely on; the values a workflow's parts fill (on a part's first run and when its source changes); Sherlock's findings against their sources; numbers in anything outward before the yes. Two ways: against the outside (an independent answer with web search that never sees Alpha's world) and against the person's world (their tables, journal and files). Columbo never fixes: the owner corrects from the source and says so in a line (Alpha for an answer, the module's agent for its rows, Sherlock for a finding); when sources disagree the person is asked and their answer binds. A small mark on what was checked, the source on hover; differences in Activity, and in Needs you only when they touch what the person relies on. It works after turns and part runs that produce worked-out values, before an outward card with numbers, and on @Columbo; it reads only and writes only its verdicts. Its memory: which sources proved reliable and which kinds of values are often wrong; its verdict, how often it agrees and how often its differences were right. Kenil: "1 yes, 2 yes, 3 yes, 4 yes, 5 ok". | 15 Oct 2026 (`../log/2026-10-14-design-agents.md`). §7 |
| **Q48** | Scout, the recommender (15 Oct 2026, design session 6; §5's entries 3 and 4 and the speaking-up ladder given an agent). Description for the person: "Scout looks across everything Alpha holds for things worth your attention: a pattern in your data, a link between parts of your world, something coming up, something you could stop doing by hand. Each comes as a short suggestion you can take or leave, at a good moment, never as a stream of pings. It only proposes; nothing happens without your yes." It looks for five kinds: things coming up (Watson's commitments, the calendar, a workflow's deadlines); patterns and changes in the person's data; links across their world (taking over the map's Refresh); follow-ups (an email waiting, a question left open); things to stop doing by hand (suggesting a workflow or an agent, which goes through Sherlock and the interview on a yes). Each idea carries how sure, how helpful, what interrupting costs and how soon it stops mattering, and goes on §5's ladder: prepared silently, the day's picks, a card at a natural break, or (later, urgent and costly to miss) a Mac notification. Code checks every suggestion: its evidence linked and one clear action; one declined never returns unless something changed; a kind kept declined sinks; those serving a goal rank first and show on the goal's page. It speaks through "Scout's picks" on Home, refreshed when Alpha is first opened each day, and the companion's bubble at a natural break, never mid-task. It works when data arrives, once a day for the picks, and on @Scout; it reads everything and writes only suggestions and its page; a suggestion taken is done by the right agent or Alpha (one writer per thing). Its memory: what is taken and declined by kind, what the person cares about from their goals; its verdict, how many are taken. Kenil: "make it a bit bolder to start with, so we can see how well it can do this": it starts bolder than the quiet default (more ideas, those less sure shown as such) and learns from yes and no; the timing rules hold. | 15 Oct 2026 (`../log/2026-10-14-design-agents.md`). §5 |
| **Q49** | Doc, the healer (15 Oct 2026, design session 7; Kenil on 9 Oct: "healing agents that maintain modules"). Measured first: repair lives in three places with nothing tying them together. A broken reader is rewritten by a model turn at most twice a run, in the automation's own thread, starting from nothing each run (`runtime/pipeline.py`); a failed approved action's procedure is repaired and proposed again, or only its check when the action went through (`runtime/acting.py`); a workflow part is never repaired, only left with the problem on the row after two failures until a setting or the row changes (`runtime/parts.py`); a repaired reader's old script is overwritten. Description for the person: "Doc keeps what Alpha has built for you working. When a step breaks (a site changed its page, a script hit an error, the check after a send failed), Doc works out why, fixes Alpha's own part, and runs it again. When the fix is yours (a sign-in, a key, a payment), it tells you exactly what, once. It never changes your data, never sends anything, and never builds something new." Doc is the one fixer of Alpha's know-how: the agent whose run broke calls it, waits and carries on, so a thing two agents share has one writer and a custom agent needs no repair know-how of its own. It covers readers, procedures and workflow parts (a part's code fixed in the module's workspace, one git commit per fix, then rerun on the rows that failed). Whose fault it is comes first, by code where it can: passing (a site down or slow: retried after a minute, as now), the person's (a sign-in, a bot check, a missing key or setting: one question card, then the thing waits and runs again by itself when what was asked changes), Alpha's know-how (Doc repairs it), or Alpha itself (a crash in the core: never touched; a plain report of what, where and the log lines, kept in Activity and the log; a "Send report" later, on the person's yes). After a fix it reruns what failed (the step, the part on its failed rows, or the action proposed again for the person's yes) and code judges whether it held. It reads everything and writes only know-how and its own page: never the person's values (Columbo's), nothing outward, never Alpha's own code, never keys or sign-ins. One repair of a thing at a time (a second run that meets the same broken reader waits and uses the fix), and none in a module while a build or a change by chat is working on it. A fix that did not hold: two tries a run as now, each seeing what was tried before so the next is different, and the agent's page counts the repairs ("repaired 3 times this week"); it never stops by itself, the person stops the agent. No check-ups: Doc acts only on real failures (quiet reads cost time and can trip bot checks; procedures cannot be checked without leaving something behind). Every fix keeps the version before it, with "Undo this repair" on Doc's page (parts have git; readers and procedures get versions, since a save overwrites today). It shows as a line in the run when a fix held ("Doc fixed the Zillow reader: the page's layout changed"), never a card; only what needs the person reaches the companion; its page lists what it repaired, what held, what waits on the person and Alpha's own faults; @Doc answers "why did this fail?" and "fix it". It works on a failure (the first event trigger), on @Doc, and on Try again for something it can fix. Its memory: per site and thing, what broke and which fix held; its verdict, how many repairs held on the next real run. A bear with a stethoscope (Q45). Kenil: "1. yes, 2. yes, 3. ok, 4. ok, 5. ok, 6. yes, 7. ok". | 15 Oct 2026 (`../log/2026-10-14-design-agents.md`). §5, §6 |
| **Q50** | How the agents are built: the substrate and the anatomy (15 Oct 2026, design session 8; Kenil, before the depth session: "should we look into how we implement the whole agents and agent flow?", then "we dont have to be bound by the current implementation and choices. agent setup and working is really really important for alpha, so i want to get it right. and we should focus on how exactly the agents work, do they have code, skills, guidelines, etc."). **The one idea:** an agent is a program whose judgement is the model's; everything that can be a mechanism is code (when it wakes, what it looks at, what it may touch, what it accepts back, how it reaches the person, what counts as success), as a turn and noticing already work. **The parts:** a frame (the kind's program, in code, by us, never the model, never editable; one generic frame for custom agents) with its rules (the model's instruction, repeating the frame's walls); a brief (what this agent is for, for this person: the person's words and Alpha's draft, edited by the person; Alpha proposes a change, never makes one); notes (what the agent learned, one page it rewrites at a run's end, its one write to itself; judgements only, numbers come from tables; visible and deletable); hands (Alpha's tools cut to the kind's list, web where the kind allows, the browser read-only in existing connections; the tool server knows the actor and refuses outside the list); know-how (readers, procedures, pipelines in the one skills table, shared, owned by the agent that got one through its yes; built-in agents own none); memory (brief, notes, runs with verdicts, the decisions that bind, its cursor, what the model saw; no resumed sessions, each run fresh, memory only through the world); triggers (a schedule, journal entries since its cursor, @, on demand, called by another run); a verdict judged by code per kind, one generic judge for custom agents. An agent never has code the model wrote: an agent judges, a part computes. **A run, every kind:** wake (tick, kick, route or @; `look` in code says whether there is work) → claim (one run per agent; Doc locks the thing) → gather (only the state that bears) → judge (the model when needed: rules, brief, notes, binding decisions, the state, the pre-pack's relevant sections, tools cut to the list, an answer in a shape code checks; some runs need no model) → check (shape, evidence exists, one action, nothing declined returns, the person's decisions respected) → write (through tools, with provenance, actor the agent) → reach (the ladder) → verdict, run row, cursor, notes; every step journaled under the agent's name. **The substrate:** an `agents` table (built-in rows made on open, never deleted; today's five process agents become custom agents of their modules with the same ids, so pages, looks, runs and Try again carry over); runs per agent with the trigger; events are the journal with a cursor per agent, no bus; the journal's actor is the agent; a `decisions` table (who, what, why, alternatives, evidence, what it replaces, state; the person's bind, checked by code where it can; the workflow page's suggestions written there on the yes); permissions as a list per kind in code, explicit for custom, enforced in the tools as `_gate` is. **"Automation" leaves the product:** it is an agent with a schedule trigger and a pipeline skill; tables, tools and routes take the agent's name, ids kept. **The agent page is a door like the workflow page** (brief, triggers, scope, what it may touch, what done means in checkable terms, what to build): the yes is a build (by code the module and tables, Alpha's readers kept after a real run, the agent row, the first run); a workflow's "Alpha does this weekly" step becomes an agent of the module the same way. This closes Q40. The model per kind is chosen in code. **Order,** each slice proposed in writing before it is built and proven by a journey: A, the substrate (tables, migration, triggers, runner, actor and permissions, the tab and page, @, purge; proof: the five existing agents still run); then one agent at a time, complete as designed, refactors before new work: Watson (noticing), Doc (repair), Columbo (the second opinion), Sherlock, Scout. Left out as Q44 says: Mac notifications, the digest, agents talking to each other (the only calls: an agent calling Doc; Scout handing to Sherlock on the person's yes). Kenil: "yes to all" (substrate) and "ok to all" (anatomy). | 15 Oct 2026 (`../log/2026-10-14-design-agents.md`). §5, §12 |

---

### Appendix — research behind this

- `design/research/memory-and-context.md` — 19 systems compared; eight strongest findings; three candidate architectures and the ranking.
- `design/research/connectors-and-sources.md` — connector platforms, browser control options, macOS native sources, the connector shape, build vs leverage.
- `design/research/proactivity-and-standing-things.md` — 17 proactive products, interruption evidence, the four-layer mechanism, the standing-things ladder.
- `design/research/workspace-ui.md` — 25 second-brain products and 20 agent workspaces compared; the review, approval and explanation evidence; the recommended information architecture.
- Jev / System One models: TypeSafe docs and cookbooks, arXiv 2609.30216, the Laya comparison (summarised in the chat of 30 Sept 2026).
- `design/research/modules-as-programs.md` — superseded by §12 (Q39) and in part removed (Q40); the prior art behind modules as programs (Q38, 10 Oct 2026): sandboxes for a coding agent on a Mac (Claude Code's own, verified here; Codex and Gemini CLI), declared surfaces (A2UI, json-render, Datasette, Evidence, MapLibre + PMTiles, Typst), the data layer (DuckDB, Hamilton, Data Package provenance, pointblank, reusable public-data libraries), long builds (Anthropic's and OpenAI's harnesses, Spec Kit, BMAD, the Ralph loop, the false-success evidence).
- `design/research/research-before-build.md` — superseded by §12 (Q39), the pass removed (Q40); the evidence behind the research pass (Q37, 9 Oct 2026): agents under-ask and assume silently; research before building helps when checked; when questions are worth asking and how many; how the deep-research products and the builder agents do it; how product people scope from a vague ask.
- `design/research/competitor-kanu.md` — Kanu (getkanu.com, 2 Oct 2026): the same thesis sold top-down to enterprises with forward-deployed engineers; what Alpha lacks (finished deliverables, enterprise connectors, a feedback-to-behaviour loop), what Kanu doesn't show (a person-sized, local, self-serve product with provenance per value), and what it means for the pitch.
- `design/research/ui-rulebook.md` — Vikas's rulebook for the window (pull request #5), kept as guidance, never a rule over main's look (Q42).
- `design/research/core-changes-for-the-window.md` — Vikas's list of what the window needed from the core (A1–G7, T), with Kenil's 12 Oct answers; slice 2 built from it.
- `design/research/dedicated-agents.md` — prior art for dedicated agents (Q44, 14 Oct 2026): how products model persistent agents, one voice against many, decision logs and checkpoints, research before building.
