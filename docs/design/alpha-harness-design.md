# Alpha as a harness

*Proposed and agreed with Kenil on 17 October 2026 ("ok makes sense to me"). It supersedes
`alpha-second-brain-design.md` (30 September, 53 decisions), which stays as history; the decisions
there that still bind are listed in §16. The research behind this is in `research/harness-*.md`.
Nothing here is built yet; each slice of §18 is proposed in writing first. As the slices land,
every section gets a status box (built / differs / not built), as the old design had.*

## 0. Why, in one page

On the evening of 16 October, on a fresh world, Kenil typed one sentence: "help my sync all my
linkedin connection in here". It took 44 minutes, seven model sessions, 15.6 minutes of model
time and about $2.18, opened four threads, wrote 101 journal lines, and put no connections in the
table. The model had a working reader of his real connections page two minutes into the build.
The rest of the time went on finding out that the structure around it would not let it keep the
reader or schedule the sync: the gate that decides which tools are open in which kind of thread
had, since 12 October, no kind of thread in which they are open.

That gate was one of a dozen structures placed between the model and the work since 2 October:
the interview, the workflow page, the research agent's look, the walled build with its parts
contract and proxy, five agents each with a cursor on the journal, one fresh model session per
turn with a pre-pack of the world. Each was a reasonable answer to a failure of the day. Together
they encode a guess about how work should go, and the guess is wrong often enough that a small
request becomes a long one.

Claude Code can do almost anything because it has almost none of that. A model; a handful of
generic tools (a shell, files, the web, a browser, subagents); a directory it owns; memory as
plain files it reads and writes; skills as markdown it writes itself; scheduled runs; and one
gate, a permission prompt on the actions that matter. Nothing in it knows what the person is
trying to do. The model works that out every time, and it is good at it.

Kenil, 17 October: "if we look at claude code / codex / other harnesses, they're able to pretty
much do anything on their own. That's what I want via alpha as well, just that it's wrapped in a
simple interface, with standardized UI, and auto creation of agents / skills / schedules /
proactiveness. But the underlying power of AI should not be curtailed."

So: **Alpha is a Claude-Code-class harness, wrapped in a simple standard window, with a world the
model keeps for the person, that makes its own standing things and runs on its own triggers.**
This document says what that is, what it throws away, what stays, and in what order it is built.

## 1. Principles, revised

The 30 September principles, with the ones the harness changes marked.

1. **Generic.** Nothing in the platform knows what a calorie or a connection is. The model's
   skills are per use case; the platform never is. *(Unchanged, and now the only place the
   "nothing per use case" rule applies: the model is free.)*
2. **One world per person.** One store, cross-linked, rendered by one window. *(Unchanged.)*
3. **One way in.** The person says what they want; the model works out what it is. *(Unchanged.)*
4. **Do it.** The model does the work in the conversation, now, the way Claude Code does. Before
   it makes something that will stand (a table, a reader, a schedule, an agent) it says so in one
   line and carries on; it asks only when the answer changes what gets made and cannot be
   defaulted safely. *(Replaces "understand, propose, build after the yes" of 2 October. The
   blind ETA build that led to that rule made nine tables nobody asked for; the fault was scope,
   and the fix for scope is the line that says what is about to be made, not a gate.)*
5. **Walls, not scope gates.** The only gates are permission questions on actions that matter
   (§8). No tool is closed because of which kind of thread the turn runs in. *(New.)*
6. **Standing things are the model's to make.** Skills, agents, schedules and triggers are files
   and rows the model writes for itself when it judges it will do the thing again; the window
   shows them and the person can edit or undo them. *(Replaces the ladder of levels and promotion
   from verified runs, which was never built.)*
7. **Quiet by default; agents work behind Alpha.** Nothing an agent does appears in the person's
   conversation unless it needs their yes. *(Sharpened.)*
8. **No knobs, no caps.** The person stops what is not going anywhere. *(Unchanged, Q18.)*
9. **Local-first.** *(Unchanged.)*
10. **Known, assumed or asked; evidence over cleverness; the journal verbatim and never deleted;
    everything undoable.** *(Unchanged, §7 of the old design.)*

## 2. The shape

Five parts. The first is new, the second mostly exists, the third is new, the fourth is
rebuilt on what exists, the fifth is the window we have, simplified.

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │  the window      one conversation box · work items · modules · people  │
 │                  skills and agents as text · Activity · Needs you      │
 ├────────────────────────────────────────────────────────────────────────┤
 │  the engine      the Claude Agent SDK: a session per conversation,     │
 │                  subagents, hooks, the permission callback, skills     │
 ├──────────────────────────┬─────────────────────────────────────────────┤
 │  the world               │  standing things, made by the model         │
 │  SQLite: journal, tables │  modules as directories; skills as          │
 │  people, facts, files    │  SKILL.md + scripts; agents as briefs;      │
 │  rendered by the window  │  schedules and triggers as rows             │
 ├──────────────────────────┴─────────────────────────────────────────────┤
 │  the triggers    time · a mention · the app opened · the world changed │
 │                  a file changed · mail arrived · the Mac woke          │
 └────────────────────────────────────────────────────────────────────────┘
```

- **The engine** runs the model with generic tools and no scope gate. One long-lived session per
  conversation, resumed turn after turn, so the model keeps its own working memory; a session per
  agent run; subagents for parallel work inside a task. (§3, §4)
- **The world** is what the harness does not have: the person's data in standard shapes the
  window can render and every session can query. (§5)
- **Standing things** are what the model makes for itself: a module is a project directory the
  model owns; a skill is a directory of markdown and scripts; an agent is a brief with a trigger
  and what it may touch; a schedule is a row. (§6)
- **The triggers** start a run of the same engine with a brief: a time, a mention, the app
  opening, a change in the world or a folder, mail arriving, the Mac waking. (§9)
- **The window** renders the world and the standing things, shows one work item per request,
  asks the permission questions, and offers Undo on everything. (§10)

## 3. The engine

The Claude Agent SDK (Python, `claude-agent-sdk` 0.2.168 on 17 Oct; it bundles its own Claude
Code binary) replaces `claude_cli.py`. What it gives, verified against its pages on 17 October
(`research/harness-agent-sdk.md`):

- **A session per conversation, resumed.** `ClaudeSDKClient` keeps one session across turns;
  `resume=<id>` brings it back after a restart; `fork_session` branches one. The transcript is
  local JSONL under the default config home (`~/.claude/projects/<cwd>/`), keyed by the
  session's working directory: the subscription sign-in lives there and a private
  `CLAUDE_CONFIG_DIR` is not signed in (found on 2 Oct, `claude_cli.py`), so Alpha's sessions
  are kept apart from the person's own by their `cwd` (Alpha's home), not by a config home.
  Compaction is automatic near the limit, with a `PreCompact` hook and guidance Alpha can give
  in its own notes. The pre-pack shrinks to what the world adds at the start of a session and
  what changed since the last turn.
- **Subagents**, defined in code or as `agents/*.md` files: a brief, tools allowed, a model,
  background by default, up to 20 at once. The five built-ins and any agent the model writes
  are these.
- **Hooks** on every tool call: `PreToolUse` can deny, ask, defer (the turn ends and resumes
  later from the persisted session: the approval that outlives a restart) or rewrite the input;
  `PostToolUse` can rewrite the output. The journal line for every call, the walls of §11 and
  the permission rules of §8 live here, in code.
- **The permission callback** (`can_use_tool`) for the questions of §8, answered in the window;
  tools that always ask are kept out of `allowed_tools` so the callback is reached.
- **Skills** read from the filesystem (`.claude/skills` of the cwd and of every `add_dirs`
  directory): a module's skills load when the session's cwd is the module's directory. The CLI
  watches skill directories and picks up a new one within the session; the SDK pages do not
  restate it, so slice 1 includes the spike.
- **`cwd` and `add_dirs`**: the module's directory and the folders the person granted (§8).
- **The sandbox** (`sandbox-runtime`, Seatbelt on macOS) for the shell: a filesystem allowlist
  and a network allowlist that starts empty; `failIfUnavailable=True` because the Python SDK
  otherwise falls back to running unsandboxed. The other tools (files, web, MCP) run under the
  permission rules, not the sandbox, as in Claude Code itself.
- **In-process MCP** for the world's tools (§4), so there is no second process.

What it does not give, so Alpha keeps its own: **the scheduler** (the SDK's cron is session-
scoped and interactive; routines are a cloud feature of a claude.ai account), the **approval
queue** across restarts (built on `defer`), the **event stream** (the journal with a cursor per
agent, as today), and the window's view of a session (the SDK streams messages; the window
renders them).

**The subscription, plainly** (both research files read Anthropic's pages on 17 Oct). What
Alpha does today is the sanctioned shape: the person signs into the unmodified `claude` binary
through Anthropic's own flow on their own Mac, and Alpha never touches the token. The support
page says "Claude Agent SDK, claude -p, and third-party app usage still draw from your
subscription limits", and the legal page says nothing "prevent[s] an end user from signing in
to the unmodified Claude Code binary with their own Claude subscription". The SDK runs that same
binary, so Kenil's own Alpha keeps using his subscription. What Anthropic forbids: a product that
offers "Log in with Claude" or routes requests through Pro or Max credentials "on behalf of
their users", storing or proxying tokens, one subscription for several people. Which side of
that line a copy shipped to a first user falls on (they sign into the bundled, unmodified binary
themselves, through Anthropic's flow) is not something to guess: it needs Anthropic's written
answer before the app goes to anyone but Kenil, and the documented path for a product is each
user's own Console API key (§15). "Claude Code" may not be in the product's name; "Powered by
Claude" is allowed.

| Status (17 Oct 2026; detail in `../log/2026-10-17-harness-slice1-engine.md`) | |
|---|---|
| Built | Slice 1: `runtime/engine.py` runs every Claude turn through the Agent SDK (0.2.168, bundling Claude Code 2.1.301) behind the CLI route's own request and result; one `ClaudeSDKClient` per run, a live conversation's session resumed by id; the world's tools served in this process (`mcp/inprocess.py`, the same names and words, fastmcp validating and serialising, each call on a worker thread); the stream mapped onto what the window shows and the steps a build journals; the person's Stop interrupts the session; a silent run ended as before; `strict_mcp_config`, `setting_sources=[]`, no `CLAUDE_CONFIG_DIR`, sessions kept apart by `cwd`; a `PreCompact` hook says so in a line. **Step 4 (18 Oct):** the `claude -p` route is gone; `running.py` holds the request, the result, the live runs and the words; no engine switch. |
| Differs | The build's sandbox is still the settings JSON of `workspace.sandbox_settings` (Claude Code's own sandbox, as before), passed through the SDK's `settings`, not its `SandboxSettings` field; the same keys. The journal line for every call is still the tools' own, not a hook (it comes with slice 2's tools). The permission callback path (`default` mode, the sensitive tools out of `allowed_tools`) is verified by the spikes and waits for slice 2. |
| Not built | Subagents, skills from the filesystem, `add_dirs`, the sandbox for a module's scripts, `defer` for approvals that outlive a restart: slices 2 to 6. |

## 4. The tools

Claude Code's power is that its tools are few and generic. Alpha's 73 tools each open one narrow
door, and every door is a place the model can be refused. The new set is about fifteen, and none
is closed by the kind of thread the turn runs in.

| Tool | What it is | Asks? |
|---|---|---|
| Shell, read, write, edit, glob, grep | The SDK's own, in the module's directory and the folders the person granted (§8) | No |
| Web search, web fetch | The SDK's own | No |
| `browser_open`, `browser_read`, `browser_script`, `browser_act` | The person's signed-in profiles, one per site, through our own driver; read like a person; `act` is any click or typing that changes something on the site | `act` asks when outward (§8); sign-in asks |
| `world_query` | Read SQL over the world (tables, people, facts, the journal, documents); the model writes the query | No |
| `world_write` | Rows in and out of a table with provenance on every value, upsert by key, seen/gone bookkeeping | No; deleting the person's own entries asks |
| `world_shape` | Make or change a table, a field, a link between tables, who the rows are (people, companies) | No, said in a line |
| `world_file` | Keep a file or a document, read one | No |
| `ask_person` | A question with choices, as a card | — |
| `tell_person` | A line on Home or Activity, or a Needs-you card; a Mac notification later | — |
| `skill_keep` | Write or change a skill directory: its `SKILL.md`, its scripts, its check, its form (§6, §6.1) | No, said in a line |
| `agent_keep` | Write or change an agent's brief, its trigger, what it may touch (§6) | No, said in a line |
| `schedule_keep` | A time or an event that starts an agent (§9) | No, said in a line |
| Subagents | The SDK's own `Agent` tool | No |
| `act_outward` | Anything that leaves the person's world: a message, a post, a form, money | Always, as a card with the preview, unless a standing permission covers it |

Everything the old tools did that mattered survives inside these: provenance (every `world_write`
value carries stated / looked up / estimated / assumed), seen/gone bookkeeping for lists, hard
keys for people and companies, the journal line for every call, the walls of §11. What goes: the
gate, `workflow_*`, `plan_*`, `reader_*` and `procedure_*` as separate kinds (a reader is a skill
with a script; a procedure is a skill whose steps act), `parts` and the proxy, `agent_create`'s
form, `table_start` (a table is a table).

**Readers, procedures and pipelines become skills.** Today a reader is a row in `skills` holding
a page script, run by `reader_run`; a procedure is a row holding steps the browser replays. In
the new shape both are skill directories with a `SKILL.md` and a script, written by the model,
run by the model (or by the scheduler without a model when the skill says it needs none). Doc's
repair is editing the file. Versions are git in the directory.

| Status (17 Oct 2026; detail in `../log/2026-10-17-harness-slice2a.md`) | |
|---|---|
| Built | Slice 2a: no tool is closed by the kind of thread the turn runs in; `Tools._gate` and `_building` are gone. **Slice 2b, step 2 (17 Oct, late):** the model sees 17 hands (`mcp/tools/hands.py`: `world_query` over read-only SQL views of every table and of the world's own things, `world_write`, `world_change`, `world_shape`, `world_file`, `world_remember`, `world_search`, `ask_person`, `tell_person`, `skill_keep`, `skill_run`, `skill_find`, `agent_keep`, `act_outward`, `browser_read`, `browser_script`, `connect`) plus the four workflow tools as plan mode; each hand calls the operations the code kept (`@tool`, now unserved); the prompts, the connector skills and the window's step words follow. |
| Differs | The SDK's own shell, files, web fetch and subagents are not yet among a turn's tools (`allowed_tools` is the hands, WebSearch and WebFetch); `act_outward` still goes through the action card, not the permission callback (step 3); `schedule_keep` is `agent_keep`'s schedule. |
| Not built | The SDK's shell, files and subagents in a turn; `act_outward` through the permission callback (step 3); `world_query` over the skills' files (they are in the pre-pack and `skill_find`). |

## 5. The world

The world store is the part of Alpha that is right and stays: one SQLite file per person; the
journal verbatim with full-text search; tables with provenance on every value and a version per
change; people and companies with hard keys; bi-temporal facts; documents and files; goals. The
window renders all of it already.

What changes:

- **A module is a directory the model owns**, `~/Library/Application Support/com.alpha.brain/
  modules/<id>/`, with its notes (`NOTES.md`, what this module is for, what was decided), its
  skills (`skills/<name>/SKILL.md` and scripts), its agents (`agents/<name>.md`), its scripts and
  documents, and a `module.yaml` naming its tables. Its tables live in the world. The model
  works in that directory the way Claude Code works in a project. The window's module page shows
  the tables, the notes, the skills and agents as text, the files, and the module's Activity.
- **Memory is files plus the world.** The world holds facts, people, the journal. The model's own
  working notes (`NOTES.md` per module, `ALPHA.md` at the root for standing instructions and
  preferences in the person's words) are files it reads at the start of a session, like
  `CLAUDE.md`. Standing instructions move from a table to that file, which the window shows and
  the person can edit as text.
- **The world as SQL.** `world_query` lets the model write its own reads. The store's own
  schema is the contract; the `records` table's JSON values are exposed through a view per table
  so a query reads like a query over the person's table.
- **Nothing per use case** still binds the store: no site, no domain in its schema.

| Status (18 Oct 2026; detail in `../log/2026-10-18-harness-slice5.md`) | |
|---|---|
| Built | A module is a directory: `module.yaml` from the world, `NOTES.md` and `agents/<name>.md` both ways, `skills/` since 2b, `ALPHA.md` at the root for the standing instructions; synced at open and after every turn; removed with the module. |
| Differs | The model does not yet work *in* the directory with the SDK's own shell and files (slice 6, with granted folders); it reaches it through the hands, and the files follow. `ALPHA.md` holds the standing instructions; the preferences stay in the world. |
| Not built | The window's text views of notes and agents (slice 6). |

## 6. Standing things, made by the model

The ladder of levels, promotion from verified runs, the plan, the workflow page and the agent's
form all go. One rule replaces them: **the model makes a standing thing when it judges it will do
the thing again, says so in one line, and the window shows it.**

- **A skill** is a directory, `skills/<name>/`, with a `SKILL.md` (frontmatter: name, what it
  does, which site or source, whether it needs the model to run or runs by itself; the body is
  the instruction) and any scripts. The Agent Skills shape, so skills made elsewhere install
  unchanged and Alpha's can leave. The model writes one after it did something it will do again:
  read a list, draft a message on a site, a transform. Doc repairs one by editing it; every
  change is a commit in the module's git, shown as Versions with Undo.
- **An agent** is a brief, `agents/<name>.md`: frontmatter (trigger: a schedule or an event or a
  mention; may touch: which tables and sites; model), body in plain words (what it is for, what
  to do, what to report). A run is a session of the engine with that brief and the world. The
  five built-ins (§13) are briefs that ship with the app. The model writes a new one when the
  person asks for something that should happen on its own, or when a run of its own finds a
  reason (Kenil, 17 Oct: an unattended run may make new standing things; a line in Activity and
  on the agent's page; undoable).
- **A schedule or trigger** is a row: which agent, when or on what (§9).
- **A standing permission** is a sentence in `ALPHA.md` ("you can always draft replies to
  Vikas"), kept when the person says so, honoured by the permission callback (§8), revoked by
  deleting the line.
- **A module** is made by the model without asking when a request needs a home; said in a line.

What the window shows for each: the text itself, editable; its runs; its versions; Undo.

### 6.1 The form of a skill: markdown, code, and the move between them

Kenil, 17 Oct: "whether skills/agents should be md files or code … the user might need
deterministic behaviour for certain things; maybe some mechanism to convert md skills into code
if it's used a lot and is deterministic enough." Decided the same day (Q74). It is not markdown
*or* code: the Agent Skills shape is both, and the design says which part is which, who decides,
and how a skill moves between them.

**Three forms.**
1. **By reading**: `SKILL.md` only. The model reads the steps and does them with its tools each
   run. Judgement included; flexible; model time every run; can drift.
2. **By script**: `SKILL.md` + `scripts/` (Python in the module's environment, or a page script
   in JS). The code does the work; the model hands it inputs, takes its outputs, and is called
   only when it fails (Doc). Same inputs, same result. Readers and procedures are this today.
3. **A pipeline**: an agent whose every step is a by-script skill. The scheduler runs it with no
   model session at all; the model appears at a failure or at a step marked as judgement. This is
   the rule of 2 October ("know-how as code; AI only for repair and judgement"), kept.

**An agent stays markdown** (what it is for, when it runs, what it may touch, what to report,
its judgement calls); determinism comes from the skills it calls, not from the brief.

**Who decides the form.**
- *At write time, one rule the model applies per step:* if the step's result must be identical
  given the same inputs, it is a script from the first run: reading a list from a page, a
  transform ("split title from company"), a save, the diff of new, changed and gone, a report
  from a query. "Which of these emails matters", "is this headline a title at a company", "what
  to say to Vikas": the model. (The tool-maker / tool-user split: a strong model writes the tool
  once, a cheap run uses it; what Claude Code does when a skill carries `scripts/`.)
- *A judgement point inside a script:* a script may call the small-model seam at one marked
  step ("judge: does this row belong?"), named in `SKILL.md`, so a pipeline carries judgement
  without becoming a by-reading skill.
- *Promotion, by reading → by script, automatic.* For a skill run by reading, Alpha keeps its
  run log: runs, whether the steps were the same each time, whether the outcome is checkable. A
  scheduled pass (Doc's: whose fault becomes whose job) takes the ones that did the same steps
  run after run with a checkable result, writes the script, **shadow-runs it beside the
  by-reading version on the next real run**, and switches only when the two agree. The
  by-reading text stays as the documentation and the fallback; every version kept, Undo; one
  line in Activity (Q60). "The same steps three runs in a row" is a judgement, named, its
  number in `limits.toml` with its why; no knob the person meets.
- *Demotion.* A script that keeps failing on a source that keeps changing is repaired by Doc;
  when it cannot be, the skill falls back to by reading and says so, rather than staying broken.
- *The person's control, in words, on the skill's page:* "do this exactly the same every time"
  (by script only; the model may not improvise at run time; a run the script cannot do fails
  and says so) and "let Alpha use judgement here" (the reverse). The window shows every skill's
  form (by reading / by script) beside its text. A kit ships with the form its maker chose.

**Underneath.** Scripts run in the sandbox (§14), in the module's directory, in a per-module
Python environment the model may add packages to without asking (PyPI on the network allowlist;
journaled). Every by-script skill carries a **check** in its `SKILL.md` (the output's shape, a
sample, "at least 95% of last time's count" for a list), so the scheduler judges a run without a
model and Doc knows what repaired means: today's `reader_health`, generalised.

| Status (17 Oct 2026; detail in `../log/2026-10-17-harness-slice2a.md`) | |
|---|---|
| Built | Slice 2a: a standing thing (a table, a reader, an agent with its schedule, a module) is made in the turn, said in a line, run once and reported (`turn.md` rule 6); the workflow page stays as plan mode for a big job or "plan it first" (rule 7), and after the yes Alpha does the work in the same conversation; the build machinery (the walled session, parts, the proxy, "Say continue") is gone. **Slice 2b, step 1 (17 Oct, late):** a skill is a directory, `skills/<name>/SKILL.md` with `scripts/read.js` or `steps.yaml`, under its module's directory (the module's git repository) or `skills/` beside the world; every save a commit, versions and Undo from the history; its state (health, last run) in the world's `skill_state`; the old rows written out once on open; the skill's page shows the file and takes the person's edit as a new version. |
| Differs | The form of a skill is named in the frontmatter (`by script` for a reader or a procedure, `pipeline` for a run skill) but no skill is "by reading" yet, and promotion and demotion between the forms (§6.1) are not built; Doc edits the files through the same `save`. `agent_keep` and `schedule_keep` as files and rows the model writes wait for step 2 (the fifteen tools). |
| Not built | Standing permissions in `ALPHA.md` (the instructions are there since slice 5; the permissions stay in the world), a by-reading skill, promotion and demotion between the forms (§6.1). Since 4a a time that comes once (`at …`) and the reminder as the plainest agent; since 5 an agent is also its file `agents/<name>.md`, both ways. |

## 7. Conversations and parallel work

Kenil, 17 Oct: "the user may be working on multiple conversations / topics / projects in
parallel, so how do we handle that via a single conversation? This is a very tricky problem."
The research (`research/harness-parallel-work.md`) found that the products that solved it in
2026 converged on one shape, and Anthropic's own Claude Code Projects states it plainly: "one
ongoing conversation where Claude coordinates a stream of related work … It starts a thread for
each task … It sees what threads report back, not every step they take." The coordinator is a
cheap session; the threads are full ones. Dispatch, Codex's app and Devin are variations.
Alpha adopts it, with the routing rule made exact so that most of it is structure and only one
small judgement is the model's.

**The objects.**
- **Home**: the one conversation box, the companion's voice too. Its session is the coordinator:
  it answers what can be answered now, opens work items, and routes. It never does long work
  itself, so it is never blocked. It reads the last few Home turns, a roster of the open work
  items (title, state, last line, what each touches; never their transcripts) and the world.
- **A work item**: a thread with its own engine session (§3), a title, a state, a last line,
  what it touches, and its own message box. A build, a watch with its runs, a draft, a long
  answer. It is what Home's "Alpha is working on" shows, one per request.
- **A card**: the only way a work item appears in Home: under the person's sentence when the
  item opens, updated in place as it goes (one plain line), with its result in two lines when
  done and the next-step buttons (Open, Try again, Change, the yes it waits for).
- **The overview**: Home's lanes, by state: Needs you · Working · Done today · Resolved. A dot
  when anything needs the person. This is Home as built, with the states made exact.

**Routing, by structure first.** No model is asked for these:
1. Typed in a work item's own box → that item.
2. A reply to a card, or its button → the item that owns the card. An approval is given only at
   its card or in its item; "go ahead" in Home does not reach it (the audit rule; whether Home
   may accept it when exactly one approval is pending is open, §19).
3. `@item` or `@agent` in Home → that item or agent (asked which on a clash).
4. A scheduled or triggered run → a run under its agent's item, never a Home message; its card
   changes only when the run has something to say ("last checked Mon 09:07, nothing new"
   otherwise).
5. Typed while the person is looking at a running item → that item, read at its next tool
   boundary (a running tool is never cut; Stop is a button).

**Then one judgement**, only for a sentence typed in Home that none of the above anchors. The
coordinator answers one of five: **answer here** (reads only, this turn); **continue item X**
(the sentence is about X's subject, people or things; X's card is re-surfaced under the
sentence, marked "sent to X"); **new item** (new work, or anything with a side effect or more
than one turn; a card appears); **split** (several unrelated things → several items); **ask**
(not sure between the three: a two-button card, "Continue LinkedIn sync / New item"; nothing
runs until chosen). The person's corrections ("answer that here", "put that in the LinkedIn
thread", "only tell me when something finishes or is blocked") are obeyed and kept as
preferences in `ALPHA.md`. The judgement is the System One seam we have (`judge.py`), with the
roster as its state; the research is plain that its accuracy is model-dependent, so misroutes
are counted in the journal and a labelled set of Kenil's real Home sentences is the test.

**Reporting back.** An item reports outcomes, not steps: its card's one line while working, two
lines when done, the transcript inside the item. Several items finishing within a short window
make one Home line, not several. A Mac notification (later) only when the person is not looking
and only for needs-you, failed, finished.

**Memory.** Each item has its own session, compacting on its own. Shared across items: the
world, `ALPHA.md` and the module's `NOTES.md` read at the item's start, standing instructions.
An item writes back only its outcome line and explicit "remember" entries, when it goes idle,
one writer at a time (Watson is that writer).

**Interruptions.** A Home sentence about something else while an item is being discussed hands
the discussion into its item and Home answers the new sentence. Mid-task revision is still weak
for models (InterruptBench), so a message to a busy item is an addition; a change of course is
Stop and a new sentence.

**What this replaces:** `conversations.py`'s conversations-as-topics with a judge over them, the
build thread as a separate kind, and the agent threads: every one of them is a work item.

| Status (18 Oct 2026; detail in `../log/2026-10-18-harness-slice3.md`) | |
|---|---|
| Built | Slice 3: Home is one thread (`kind home`), every other thread a work item (`kind work`) with its own session, a state (open, working, needs_you, done, stopped), one plain line (`last_line`, its card) and its own box. Routing in `runtime/conversations.py`: structure first (an item's own box, a card's reply, `@item`, `@agent` → the agent's own item, a short answer when one item asked), then one judgement over the roster (title, state, line, what it touches, the person's recent corrections) answering answer here / continue X / new item, a card when unsure; every decision a `did` line in Home with `routed`; a moved turn is a counted correction. The pre-pack carries WORK ITEMS to Home's turns. An agent made in an item makes that item its own (a watch and its runs are one item); a scheduled run is under it; built-in agents' items stay on their pages. One turn at a time per thread (a sentence into a busy item waits for the boundary). Cards in Home, lanes by state (Needs you · Working · Done today · Earlier) on Home and the Assistant page; each item opens into its own conversation. |
| Differs | "Split" is not an answer: several things in one sentence are one new item, whose own session does them (§10's "never two items for one sentence"). Corrections typed in words are kept as standing instructions through `world_remember` (the turn's rule 11), not in an `ALPHA.md`. A sentence into a busy item waits for the running turn rather than being read at its next tool boundary. The Mac notification and several items folding into one Home line are not built. |
| Not built | Agents' runs as resumed sessions (a run starts from its brief and journal, Q21); the labelled set of Kenil's real Home sentences as the judgement's test (the journal's `misroute` count is the measure until then). |

## 8. When Alpha asks

Claude Code's gate is a permission prompt. Alpha's is the same, answered in the window or in
words, and it is the only gate.

**Always asks** (Kenil, 17 Oct): anything that leaves the person's world (a message, a post, a
form submitted, a purchase, anything with money); deleting the person's own entries; signing in
somewhere. The card shows the preview, what it rests on, and what cannot be undone. A standing
permission in the person's own words covers a kind of action from then on.

**Never asks, always says:** making a module, a table, a skill, an agent, a schedule; reading any
site the person is signed into; running code in its own directory; spending model time.

**Asks a question** only when the answer changes what gets made and cannot be defaulted safely:
which of two people, which account, daily or weekly when it matters. Alpha's picks are defaults
on the card with "change it", not questions. The interview survives only as something Alpha
chooses for a big, multi-step job (several documents, judgement steps, a procedure the person
already runs by hand) or the person asks for ("plan it first"). Then the plan is a page, the yes
is on it, and the build follows; the page is Alpha's notes for the module, not a separate thing.

**The person's Mac** (Kenil, 17 Oct): Alpha's own home, its module directories and its browser
profiles, plus folders the person grants from Settings, like Claude Code's working directory and
added directories. The whole Mac is a toggle the person sets, off by default.

**Implementation:** the SDK's permission callback decides every tool call by these rules, in code;
the prompt repeats them. A hook journals every call. There is no other gate.

| Status (17 Oct 2026; detail in `../log/2026-10-17-harness-slice2a.md`) | |
|---|---|
| Built | Slice 2a: the scope gate is gone; the only gates are the actions that ask (acting outward through its card, Q24; deleting the person's own entries; sign-ins). The prompt's rule: say in a line what is about to be made, make it, ask only when the answer changes what gets made and cannot be defaulted. **Slice 2b, step 3 (17 Oct, late):** a turn runs in the SDK's default mode with the permission callback; every hand but `world_change` and `act_outward` is allowed outright; a row's removal asks on a card in the conversation and the turn waits for the window's answer (the silence watch knows; Stop ends the wait); `act_outward` passes through the callback with its own card as the gate. |
| Differs | The deferred yes across a restart (`defer`) is not built: a card unanswered when the app quits ends with the run. The journal line for every call stays the operations' own, not a hook. The person's folders and the whole-Mac toggle are not in Settings yet. |
| Not built | `defer` across restarts; the granted folders and the whole-Mac toggle (slice 6); the SDK's own tools in a turn (step 4). |

## 9. Proactiveness

A trigger starts a run of the engine with an agent's brief. All of these on day one (Kenil, 17
Oct): **time** (the scheduler we have); **a mention** (`@Name` in the conversation asks Alpha to
use that agent; Alpha still replies); **the app opened** (Scout's daily look); **a change in the
world** (a row, a table, a file: the journal is the event stream, with a cursor per agent, as
today); **a folder changed** (the watcher we have); **mail arrived** (polling the signed-in Gmail
through the browser, as reading does today; push later); **the Mac woke** (the sleep rule of
3 October). A run may read, compute, write the world, make standing things; it may not act
outward without a yes. Its output goes to Home and Activity, and to the person's conversation
only as a Needs-you card. Mac notifications later.

| Status (18 Oct 2026; detail in `../log/2026-10-18-harness-slice4a.md`) | |
|---|---|
| Built | Slice 4a: every trigger of this section exists (time, a mention, the app opened, a change in the world through the journal's cursors, a folder, the Mac waking); a time that comes once is a schedule (`at 2026-10-24 17:00`, local; the agent runs once and is paused, its item done); the reminder is an agent with a `remind` step whose run puts one card ("Reminder: call Sara." · Done · Tomorrow, same time; Tomorrow makes the next once by code, no turn). Mail arriving is an agent like any other (a reader of the signed-in Gmail on a schedule), not a trigger of its own. |
| Differs | Mac notifications: later (Kenil, 18 Oct); the card and the companion's line are the reminder. |
| Not built | Push for mail; the quieter agents (4b). |

## 10. The window

Less, not more. The rail and the look stay as they are (Kenil, 1 Oct). What changes:

- **One work item per request** on Home, with one plain progress line and the result in two
  lines; the steps behind a fold. Never two items for one sentence.
- **Outcomes, not machinery.** No tool names, file names, "parts", "STUCK", JSON or source paths
  reach the person. The engine's step lines are rewritten by code into plain words or hidden.
- **A module page** = its tables (as now), its notes, skills and agents as editable text, its
  files, its Activity. Counts are of the person's rows, never of settings.
- **Skills and agents as text**, like `CLAUDE.md`: the window shows the file, the person edits it,
  Versions and Undo beside it. The forms go.
- **Needs you** holds only permission cards and questions. Agents' findings, Watson's notes,
  Sherlock's suggestions live on their pages and on the module's notes, never in the timeline.
- **Settings** gains the folders Alpha may reach and the whole-Mac toggle; nothing else technical.
- The conversation stays as built on 16 October; §7 says what threads become.

| Status (18 Oct 2026; detail in `../log/2026-10-18-harness-slice3.md`) | |
|---|---|
| Built | One work item per request as a card in Home's conversation (the sentence, the item's title, state and one line, Open; a later sentence sent to it a quiet row); Home's page lists only the items waiting on the person (Q77); the Assistant page lists Home and every item by lane (Needs you · Working · Done today · Earlier); the panel speaks in Home and in an item's own box. |
| Differs | The module page, the text pages for skills and agents (slice 2b did skills), Needs you narrowed to cards and questions, Settings' folders: slice 6. |
| Not built | The engine's step lines rewritten by code into plain words everywhere (the step words exist for the hands; the fold is the item). |

| Status (18 Oct 2026; detail in `../log/2026-10-18-harness-slice6-core.md`) | |
|---|---|
| Built | The core: the model's own Read, Glob, Grep, Write, Edit and Bash in a turn under the sandbox (reads where granted or the whole Mac, writes in the module's directory, no network); `GET /api/folders` and the whole-Mac switch; Scout's costly pick as a question; Needs you without proposals of Scout's; the agents' and the module's notes as text routes. |
| Differs | Built in the window too (`../log/2026-10-18-harness-slice6-window.md`): an agent's page shows its file as text, the module page's Notes and Skills & agents tabs with Export as kit, Settings' Folders and Kits; Watson's folded line (4b). Versions and Undo on an agent's file wait: its file is not yet committed in the module's repo as a skill's is. |
| Not built | Mac notifications (later, Kenil); the full desktop page sweep's hang of 17 Oct. |

## 11. Walls kept in code

Unchanged from the old design and binding whatever the model does: the journal verbatim and never
deleted; every value with provenance; Undo on everything the model makes; removal deletes
everything related and journals itself; nothing per use case in the platform; a copy of a world
by SQLite's backup; acceptance by a real run; no knobs, no caps. Source content is data, never
instruction: a page or an email cannot tell Alpha what to do (the permission callback and the
hooks do not read it).

## 12. Other providers

Kenil asked whether other providers' models could be used. The honest answer has two halves.

**Supported: Claude only.** The SDK runs Claude through Anthropic's API, Bedrock, Google Cloud's
Agent Platform or Microsoft Foundry. Anthropic "doesn't support routing Claude Code to
non-Claude models through any gateway", and its protocol page lists what breaks when one tries.

**Technically possible, unsupported, at our own risk.** The SDK runs the Claude Code binary, so
`ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` point it at any endpoint that speaks the
Anthropic Messages format: Ollama (local), DeepSeek, Z.ai's GLM, Moonshot's Kimi, MiniMax,
llama.cpp. No proxy, nothing shipped: a provider is a record (base URL, credential, a model per
slot, flags) set into the session's environment. What the 2026 reports say holds up through the
full tool set: Kimi K2.6/K2.7-code and DeepSeek V4 Pro; GLM mixed; small local models "basic
chat and file edits". GPT and Gemini need a translating gateway (LiteLLM, Claude Code Router)
and no 2026 source shows them reliable through the full tool set; LiteLLM had malicious PyPI
releases in March 2026. The hosted web tools, the auto-mode classifier and fast mode are
Claude-only whatever the endpoint. So: a Settings card for a provider record, each provider
smoke-tested on a few tool-calling tasks before it is offered, and no gateway inside the app.
The ChatGPT route of Q32 (Codex) stays what it is: off.

The trade: the SDK gives sessions, subagents, hooks, permissions, skills and the sandbox for
free, and binds Alpha to Claude-shaped endpoints. The design keeps the engine behind one
interface (`runtime/engine.py`: start a session, send a turn, stream messages, answer a
permission), with the Agent Client Protocol (§14) as the documented escape hatch to another
engine, so the choice can be revisited without touching the world or the window.

## 13. The five built-in agents, quieter

Watson (memory), Doc (repair), Columbo (check), Sherlock (research) and Scout (the day's picks)
stay, as briefs that ship with the app, each a session of the same engine with its brief, run
on its triggers or called by Alpha as a subagent. What changes: none of them writes in the
person's conversation. Watson's noticing shows as a foldable meta line under Alpha's reply
("kept 1 decision") and on its page. Sherlock's look happens when Alpha judges it worth it, inside
the work, its suggestions landing in the module's notes; nothing lands after a yes. Columbo's
marks on values stay. Scout and Sherlock stay quiet on an empty world, and an agent's own page is
never a fact-carrying node (the "2 links worth confirming" of 16 October were Scout linking
Watson's page to the person's). Doc edits skill files and commits.

| Status (18 Oct 2026; detail in `../log/2026-10-18-harness-slice4b.md`) | |
|---|---|
| Built | Slice 4b: none of the five writes in the person's conversation. Watson's suggested facts live on the About-you table (not Needs you) and a folded "Watson kept …" line sits under Alpha's reply; Columbo's correction turn is gone (the mark, a line on his page, a card between two sources); Sherlock has no triggers of his own (`@Sherlock`); Scout is quiet on a world with less than a day of turns; Doc edits skill files and commits. The briefs: four lines changed. |
| Differs | Sherlock as Alpha's subagent (the SDK's subagents) is not built: `@Sherlock` is the call. Sherlock's suggestions land on his findings page and the module's notes as before, not inside the work. |
| Not built | Watson's meta line beyond counts (what exactly was kept opens on his page). |

## 14. What we leverage

Kenil, 17 Oct: "if we can leverage other open source solutions, let's do that." The research
(`research/harness-open-source.md`, with licences, versions and what could not be verified)
looked at the harnesses, the gateways, browser automation, memory layers, scheduling, sandboxing,
connectors and UI renderers as of 17 October. What we take:

1. **The Claude Agent SDK** as the engine (§3). Patterns copied from the other harnesses whatever
   the engine: OpenCode's per-tool allow/ask/deny with a hard-deny layer no mode overrides;
   Codex's sandbox boundary kept separate from the approval policy; agent files that inherit
   but cannot widen their parent's permissions; Hermes' agent-written skills behind a write
   approval and its rule that a scheduled run cannot edit the schedule; Goose's desktop as a
   client of a local server.
2. **`sandbox-runtime`** (Anthropic, Apache-2.0; Seatbelt on macOS; what the SDK's own Bash
   sandbox is built on) for model-written code and for the MCP servers Alpha runs, in strict
   mode: writes to the workspace and Alpha's home only, reads denied outside them, credentials
   denied, a domain allowlist. The trade-offs stated (a shared kernel; hostname allowlists leak;
   Apple's unannounced Seatbelt deprecation).
3. **Agent Skills** (`SKILL.md`, the spec at agentskills.io, ~45 adopters) as the one format
   for the model's skills and for connectors' know-how (§6).
4. **Anthropic's `browser_toolset_20260801`** as the browser tool contract (the names and
   `[ref_N]` semantics Claude is trained on: `read_page`, `find`, `get_page_text`, `form_input`,
   click by ref, screenshot), implemented over Playwright persistent contexts on the bundled
   Chromium with one profile per site, which is what Alpha does today and the only path still
   supported (Chrome 136+ blocks automating the default profile). Playwright MCP's ref-snapshot
   code is the reference; Chrome 144's consent-gated auto-connect is the escape hatch for a site
   that refuses an automation profile. Never stealth (browser-use, Stagehand skipped).
5. **Our own triggers table and minute tick** (§9), with Claude Code Desktop's scheduling
   semantics copied verbatim (skipped-asleep journaled, one catch-up on wake, keep-awake);
   `cronsim` for parsing; `watchfiles` for folders; Gmail by `history.list` polling and Calendar
   by `syncToken`; Slack by Socket Mode. No Temporal, no APScheduler, no queue.
6. **The memory-tool posture over the world**: Anthropic's `memory_20250818` verbs (`view`,
   `create`, `str_replace`, `insert`, `delete`, `rename`) over a virtual `/memories` tree backed
   by the world's pages, with a small typed index; Graphiti's two-axis time on facts (already
   ours); Letta's pinned always-in-context blocks (who the person is, current work, standing
   preferences); sleep-time consolidation and a lint pass (contradictions, orphans, stale) as
   scheduled agents. No second store (mem0, cognee, Graphiti-as-code skipped).
7. **The connector slot** (Q53, slice 3) as an Agent Skills directory plus a `connector.json`
   that is a subset of Claude Code's plugin manifest and the MCPB manifest (hosted-server and
   OAuth fields, `sensitive` config in the Keychain). First slots: Google Workspace through
   `taylorwilsdon/google_workspace_mcp` (MIT, our own GCP client), Slack's and Notion's hosted
   MCP servers. LinkedIn stays "Alpha browses as the person".
8. **`json-render`** (Vercel, Apache-2.0) with a small Alpha-owned catalogue (Table, Stat,
   Chart, Card, Form, Timeline, Page) for model-made pages and dashboards, through a
   `render_page` tool, validated before render and stored as data; a sandboxed iframe as the
   escape hatch for free-form pages, which also hosts MCP Apps; OpenUI Lang stays the bounded
   trial of 16 October, against the same catalogue.

Skipped on purpose: any translation proxy inside the app; automating the person's own Chrome;
a second memory store; servers for scheduling; hosted OAuth aggregators; chat frameworks.

## 15. Shipping to the first users

Kenil, 17 Oct: the first users share requirements; he builds their modules himself in his own
Alpha and ships the app with the modules inside. The harness makes that literal: a module is a
directory with no data in it (notes, skills, agents, scripts, `module.yaml` naming its tables),
so a kit (Q53, slice 1) is that directory copied into another person's Alpha, its tables made
empty from `module.yaml` on first open. The ownership rule of Q53 holds: what we installed and
nobody changed is replaced on update; what the person changed is theirs. This is the acceptance
of the design: a module made in Kenil's world runs in theirs.

**How the first users' Alpha thinks** is the open question §3 raises. Today the app assumes the
Mac is signed into Claude Code with a subscription. For a user we ship to, Anthropic's documented
path is their own Console API key, entered once in Settings (the engine takes `ANTHROPIC_API_KEY`
in its environment; nothing else changes); whether they may instead sign in with their own
subscription to the bundled binary is the question to put to Anthropic in writing. The design
assumes the key path for shipped copies and the subscription for Kenil's, with the engine
indifferent to which.

| Status (18 Oct 2026; detail in `../log/2026-10-18-harness-slice5.md`) | |
|---|---|
| Built | Kits: export (no data; `crosses` names what reaches outside the module), install (tables empty, agents paused), update by the ownership rule (hashes of the installed files), kits shipped in the bundle and installed on the first open; CLI, API and `just ship <kits>`. |
| Differs | The window's buttons wait for slice 6; the CLI is the way until then. |
| Not built | Anthropic's answer on a shipped copy's sign-in; the user's own API key in Settings (§3's open question). |

## 16. What goes, what stays

| Area | Goes | Stays |
|---|---|---|
| Runtime | `claude_cli.py`'s hand-rolled route, the pre-pack as the only memory, `turn.py`'s one session per turn, `workflow_build.py`, `parts.py`, `proxy.py`, `workspace.py`'s Seatbelt profile, `pipeline.py` as a separate runner, `asking.py`'s question parsing | `judge.py` (the small-model seam, for routing and triage), the scheduler, `acting.py`'s dry-run and approval, `conversations.py`'s routing (reworked per §7), `claude_account.py` |
| Tools | 58 of the 73: `workflow_*`, `reader_*`, `procedure_*`, `plan_*`, `agent_create`'s form, `table_start`, `collection_*` as separate verbs, `_gate` | The world's reads and writes behind `world_*`, `ask_person`, `tell_person`, `action_propose/approve` behind `act_outward`, `browser_*` |
| World | `workflows` and `workflow_versions`, `skills` as JSON rows (→ directories; a migration writes them out), `permissions` as rows (→ `ALPHA.md`) | Everything else: journal, records, collections, entities, facts, documents, files, goals, agents, runs, decisions, actions, modules |
| Prompts | `workflow_build.md`, `sherlock_look.md`'s landing after the yes, the interview rules in `turn.md` (rules 6 and 7), `repair_part.md` | `turn.md`'s rules 1–5, 8–10 reworked for the new tools; the briefs |
| Window | The workflow card and page, the agent form, the parts buttons, "Say continue", two work items per request | Everything else |
| Journeys | `workflow_interview`, `workflow_build` | The rest, reworked to the new tools; plus the first-day set (§17) |

Old decisions that still bind: Q2 (core as child of the app), Q3 (LinkedIn read at human pace),
Q5 (silent low-stakes facts), Q17/Q23 (no site vocabulary in the platform), Q18 (no limits),
Q22 (30 minutes between an agent's runs), Q24 (acting outward as a card), Q25 (files), Q26 (the
memory round), Q31 (modules nest), Q43 (removal), Q44–Q49 (the agents' shape and the five),
Q53 (kits, the ownership rule). Superseded: Q8 (make-and-show: now everything standing is
made-and-said), Q33, Q37–Q40, Q50–Q51 in their mechanism (the agents stay; their substrate
becomes the engine's sessions), Q39/§12 (the workflow page as the only door).

## 17. Acceptance: the first-day sentences

Five sentences on an empty world, run for real in the app, before anything else ships (Kenil,
17 Oct). They are also journeys with the real model on a fresh world, the regression gate; the
real run in the app is the acceptance.

1. "keep my LinkedIn connections in sync" → the table fills in one work item; next check named.
2. "track what I eat", then "log two eggs" → a table, a row with its source; nothing asked.
3. "watch We Work Remotely for back-end roles" → a reader and a schedule; the first rows.
4. "what did Vikas email me about last week" → read from the signed-in Gmail, answered with the
   emails named; a sign-in card first if needed.
5. "remind me to call Sara on Friday" → a reminder that fires.

Each passes only when the person sees the outcome in the app, in one thread, with no internal
word, and Activity shows what was made.

## 18. Order of work

Each slice proposed in writing first, built in main's design, looked at in the app, committed
after Kenil's review.

1. **The engine in place of the route**: the SDK, one session per conversation, the permission
   callback, the hooks that journal; the old tools still served through the SDK's MCP server;
   sentence 2 passes. Nothing else changes.
2. **The fifteen tools and the end of the gate**: `world_*`, `browser_*`, `skill_keep`,
   `agent_keep`, `schedule_keep`; skills as directories with a migration from the rows; the
   workflow machinery removed; sentences 1 and 3 pass.
3. **Conversations and work items** (§7): routing, one item per request, outcomes not machinery.
4. **Triggers and the quieter agents** (§9, §13): all triggers; the five briefs reworked;
   sentences 4 and 5 pass.
5. **Modules as directories and kits** (§5, §15): `module.yaml`, the window's module page, export
   and install.
6. **The window's simplification** (§10): the forms go, text pages for skills and agents.

Then the pending list of `STATE.md` resumes (people for real, memory, the channel).

## 19. Decisions

Kenil's answers of 17 October 2026, each a decision (numbered on from Q53):

| | Decision |
|---|---|
| Q54 | Alpha is a Claude-Code-class harness wrapped in a standard window; the model's power is not curtailed by scope gates. |
| Q55 | The engine is the Claude Agent SDK on his subscription (§3). Found the same day: his own use is the sanctioned shape; a copy shipped to a first user takes their own API key until Anthropic answers in writing whether their subscription may be used (§3, §15); other providers' models only through endpoints that speak Anthropic's format, unsupported, smoke-tested first, no gateway in the app (§12). |
| Q56 | One long-lived session per conversation, resumed turn after turn; the world is memory across conversations. |
| Q57 | The model reaches Alpha's home, its module directories, its browser profiles, and folders the person grants; the whole Mac is a toggle, off by default. |
| Q58 | Plan-first by gate goes. Alpha does the work, says in a line what it is about to make, asks only when the answer changes what gets made and cannot be defaulted. The page survives as a plan mode Alpha chooses or the person asks for. |
| Q59 | Always asks: outward actions, deleting the person's own entries, money, sign-ins. Never asks for standing things, reads, its own code. |
| Q60 | An unattended run may make new standing things, with a line in Activity and Undo. |
| Q61 | Standing permissions as the person's sentences, kept and honoured. |
| Q62 | The model may make arbitrary files; standard shapes rendered richly, other files shown plainly; custom views a later trial. |
| Q63 | A module is a project directory the model owns; it may make one without asking. |
| Q64 | Skills are made by the model whenever it judges it will do the thing again; shown and editable as text. |
| Q65 | The five built-ins stay, quieter: never in the person's conversation. |
| Q66 | Ad hoc subagents without asking, shown as steps under the one work item. |
| Q67 | Research is the model's judgement, not a step; suggestions follow the thin thing. |
| Q68 | All triggers on day one: time, mention, app opened, world change, folder change, mail arrived, Mac woke. |
| Q69 | Proactive output on Home and Activity; a card only for a yes; notifications later. |
| Q70 | The walls of §11 stay. |
| Q71 | A freeze on new features until the five first-day sentences pass in the app; rechecked later. |
| Q72 | A new design document (this one); the old kept as history. |
| Q73 | First users: requirements shared, modules built by Kenil, shipped inside the app (§15). |
| Q74 | The form of a skill (§6.1): by reading, by script, or a pipeline; mechanical steps are scripts from the first run, judgement stays with the model or at a marked point inside a script; promotion from reading to script is automatic after a shadow run, with Undo and a line; demotion when a script cannot be repaired; the person's sentence "do this exactly the same every time" binds; the form shown in the window; packages installed in the module's environment without asking, in the sandbox, journaled. |
| Q75 | 18 Oct 2026, slice 3 agreed as written ("Yes to slice 3 as written: keep approvals at their card, every item as a card, and the session fingerprint fix"): an approval is given only at its card or in its item, never by "go ahead" in Home; every work item is a card in Home (Done today folds them); a conversation's session is resumed only when it was made with the same tools (the fingerprint kept with it), after the 17 Oct failure of a session resumed across the change of the hands. |
| Q76 | 18 Oct 2026, found building slice 3: an agent made inside a work item makes that item its own (a watch and its runs are one item, never two: the journey's first run opened two); the built-in agents' own items live on their pages, never on Home or the roster (§10); "split" is not one of the coordinator's answers (one sentence, one item). |
| Q77 | 18 Oct 2026, Kenil on seeing Home after slice 3 ("only things it needs me for"): Home's page shows the work items that wait on him and nothing else; what is working and what finished live on the Assistant page, by lane. The "Done today" lane of §7 is the Assistant page's, not Home's. |
| Q78 | 18 Oct 2026, Kenil ("I don't want a thousand rules… we need a clean simple approach"): a card comes only from the model's own hand (`ask_person`, with its options) or from a mechanism (a permission, a routing); the core never reads a card out of the model's prose. Q35's derivation (9 Oct) and its 200 lines of parsing are removed; a question left in prose is answered by typing, as with Claude. The turn prompt is to be rewritten to a handful of principles, shown to Kenil first. |
| Q79 | 18 Oct 2026, Kenil ("I don't think every log should be a table… hundreds of tables"): things the person tracks live in tables, things said in passing live in the journal; a table is made only when they ask to track or keep something, or say yes to Watson's offer, made once per kind when the same kind of thing has come up three times in a week (`[watson] offer_after`, `offer_window_days`, named judgements); a yes makes the table and fills it from the journal entries, each row's source its sentence; a no is remembered. The turn prompt rewritten to eight short principles (`docs/design/turn-prompt-draft.md`, agreed in chat), live the same day. |
| Q80 | 18 Oct 2026, slice 6 agreed in chat: a turn has the SDK's own files and shell, under Claude Code's sandbox (Kenil: "why no shell?"; the spike `log/2026-10-18-harness-slice6-spike.md`): reads in the folders he connected, or the whole Mac by a switch in Settings (both: "both"), writes inside the module's own directory only, no network from the shell ever; Scout's sure and costly pick is a question card, not a proposal; Needs you holds questions and permission cards only. |

Open (to decide with Kenil as the slices are proposed): §7's "go ahead" in Home when exactly one
approval is pending; the density of cards in Home (all items, or only what needs him); where
Watson's meta line sits; the first folders granted by default; whether the companion's voice turn
is a session of its own or Home's; which first user gets the first shipped copy, and on which
model route.
