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

| Status (9 Oct 2026; detail in `../log/`) | |
|---|---|
| Built | The window by `ui-rulebook.md` (Q33): one frame with a shared header line, panels that fold to strips; the sidebar (workspace, Home, People & Companies, modules in the person's order with their icons, New, Intelligence, Settings); module pages that land on their data with Files, Intelligence and Governance below; one data view (toolbar, table menus, the add bar, footer summaries, nine views including the Dashboard); a page per record with Save and Discard and History; Home's Today card (Needs you with Approve and Veto, Alpha is working on, Coming up); Intelligence's Second Brain, Agents, Automations, Skills, Connections, Activity and Map; Settings in sections; the panel with its picker and composer; the companion with presence, its looks and moods. |
| Differs | Activity is Intelligence › Activity, not a rail item. Approval is per proposal, Approve or Veto; plans and actions do not yet carry an expected outcome or success criteria. Record notes are wiki pages with a per-record topic. The window's minimum is 1100×560. |
| Not built | The digest; decide-once; Undo of Alpha's actions; the checklist; per-source forget; launch at login; speech out. From the rulebook, needing the core: module rename and delete, removed modules, several workspaces, conversation delete, adding a field, the data-sharing notice, other agents. By decision: forced edits, the Task manager as the first module, the Mac title bar. |

**Layout and look stay as they are today** — superseded by Q33 (9 October): the window follows `ui-rulebook.md`. (Kenil, 1 October, after seeing a lighter redesign: "keep it similar to current alpha"): the 224px rail with the brand mark, Home, Activity, projects, modules, New and the theme control; serif headings and metric numbers; the module page with its App · Activity · Settings toggle and subtabs; the table toolbar with view toggles and the record drawer; the 380px assistant panel with its header and "uses your Claude subscription" footer; the blob companion with its bubble. The new content (Needs you, the brief, People, threads, provenance, undo, Knowledge) is placed inside that structure. Prototype: https://claude.ai/artifact/5xNamEYxSyYRoGtnX7bQyQ.

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
| **Q27** | The companion's characters are Bridge's (Manish's Zazoo Lab art and animal set), used with his permission: the artwork comes in as assets with a credit, the rig is rebuilt in Alpha's own code (paused when idle and hidden), the companion keeps Alpha's name, and the person chooses the animal and its look (fur, suit, tie, shirt, neckwear, glasses; from 3 Oct night also one of three sizes) in Settings, kept in the core as a preference. This is the one place the person meets options for looks, by decision. | 3 Oct, after the review of pull request #3 (`../log/2026-10-03-review-pr3.md`). |
| **Q28** | Ideas from a contributor's pull request come in as concepts rebuilt on main in Alpha's conventions, never as code copied over; the pull request is credited in the log. The first set (the table views, the UI kit, self-hosted fonts, resizable panes, addresses for pages, ⌘K on search, Intelligence item pages read-only for know-how, fact provenance, the module's page on its tab, quick entry, a desktop acceptance check, the UI rules) is §8 of that review. A knowledge graph is wanted but designed first. | 3 Oct, with Kenil. |
| **Q29** | A graph, in two steps (3 Oct 2026, from `knowledge-graph-proposal.md`): first a map of Alpha's own work (modules, tables, skills, automations, sources, connections; the world's own kinds of relation, each with its source), computed on each ask and drawn with a force layout in a worker (`d3-force`, the one library); the graph of the person's world (people, documents, pages) only after readers declare their rows as people, because measured on 3 Oct it would have been twenty dots and seven lines. Edges never come from similarity or embeddings: facts with a source, as everything here. |
| **Q30** | The map of the brain (3 Oct 2026, after the map of work was built): what Kenil wants from a map is "what my brain is, what's concentrated, what's important, what's not linked", so the default view is the person's world (themselves, their areas weighted by what happened, tables, documents, pages, goals, people and organisations, and the links between them), with the map of work kept as a toggle. Links Alpha infers are allowed as a trial, as suggested `related_to` facts with a reason and a source, dashed until the person says yes, never from similarity, dropped unless grounded in the evidence. The map asks the core only on first open and on Refresh, never on a clock; Refresh also runs the link-finding pass. |
| **Q31** | Modules nest (3 Oct 2026, night, Kenil: "nested projects/modules", like Job holding a Search module and a Resume module). One concept, not two: a module may sit inside a module, to any depth, by a `parent` (nothing per level). What a module owns stays its own; a parent is the place that holds its children: its page shows them, its summary, activity, automations and sources roll them up, a conversation on it reaches the whole subtree, the pack lists the tree with the sentence's own branch first, the maps draw the nesting, removal takes the subtree. Alpha makes a module inside another (`module_create` with `parent`) or moves one (`module_move`); the person moves one in its Settings ("Where it sits"). Revises the conversations round's "no projects above modules" (the `project` column stays unused). | 3 Oct night, when the areas Kenil keeps turned out to have parts. |
| **Q32** | A second way to think: ChatGPT through the Codex CLI on the person's own subscription, beside Claude through Claude Code (3 Oct 2026, night, Kenil: "similar to using claude subscription, can we add chatgpt subscription route as well?"). One route (`runtime/route.py`) in front of two runners with the same request; the person chooses in Settings (Thinks with), Claude when unset; the model tier is one alias the runner translates. Each runner keeps its own guard: Claude's allowed tools, Codex's read-only sandbox with approvals never and Alpha's rules as its standing instructions. The same caveat as Q1 for anyone but Kenil: a third-party app signing in to ChatGPT needs OpenAI's say, as claude.ai needs Anthropic's. | 3 Oct night; his Codex sign-in had lapsed, so the route is proven by tests until he signs in. |
| **Q33** | The UI rulebook (9 Oct 2026, Vikas): the window follows `ui-rulebook.md` — one frame with a shared header line, the sidebar's fixed order, one standard data view (toolbar order, table menus, the add row, a Dashboard view whose every visual has a call to action), full record pages with Save and Discard, Approve and Veto on every proposal, serif in four places, absolute dates. It supersedes §8's "layout and look stay as they are today" (1 Oct). Built in the window only: nothing in the core, the host or the store changes, and a rule that needs the core shows its control disabled with the reason. Not adopted, by decision: forced edits (the core refuses a value outside a field's choices or type), "Task manager is always the first module" (the platform knows no domain), the Mac title bar (the host is not touched). People & Companies stays a destination of its own, drawn as a module in the sidebar. |
| **Q34** | The UX guidelines v2 folded into the rulebook (9 Oct 2026, Vikas, from `Exploration/UX_Guidelines_Platform.md`): Notion is the reference product; one section fills the screen (Files, Intelligence and Governance move from below the table into header tabs; the metrics strip folds by default); comfortable rows and buttons and larger text; sentence case, no tiny capitals; ⋯ everywhere; a row click opens at once (edit by Enter, F2 or a visible control); record pages save as you go; a star default on every dropdown; footer summaries by column type; the assistant confirms the goal when unclear, offers Quick overview and Deep thinking (model choice to Settings), saves every output as a file, approves a plan once and suggests Always allow; plain subtitles for product names; Decline for Veto; Estimated and Assumed as words; disabled reasons on focus and click; red only for problems; the principles as §19. Rulebook text only; the window still follows the earlier text until built. | 9 Oct, after the rulebook was built and compared with the guidelines: stacked sections, compact density and tiny capitals worked against calm and readable. |

---

### Appendix — research behind this

- `design/research/memory-and-context.md` — 19 systems compared; eight strongest findings; three candidate architectures and the ranking.
- `design/research/connectors-and-sources.md` — connector platforms, browser control options, macOS native sources, the connector shape, build vs leverage.
- `design/research/proactivity-and-standing-things.md` — 17 proactive products, interruption evidence, the four-layer mechanism, the standing-things ladder.
- `design/research/workspace-ui.md` — 25 second-brain products and 20 agent workspaces compared; the review, approval and explanation evidence; the recommended information architecture.
- Jev / System One models: TypeSafe docs and cookbooks, arXiv 2609.30216, the Laya comparison (summarised in the chat of 30 Sept 2026).
- `design/research/competitor-kanu.md` — Kanu (getkanu.com, 2 Oct 2026): the same thesis sold top-down to enterprises with forward-deployed engineers; what Alpha lacks (finished deliverables, enterprise connectors, a feedback-to-behaviour loop), what Kanu doesn't show (a person-sized, local, self-serve product with provenance per value), and what it means for the pitch.
