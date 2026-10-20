# Open the engine's reach (A1–A12)

*Built and committed in its five slices, 19–20 Oct 2026: S1 `a2aa1fa`, S2 `34db654` and `97e607a`, S3 `ed375e5`, S4 `42d2f16`, S5 `15eee6d` (Q103–Q106). Its acceptance is written up as it stood, with three things open: `../log/2026-10-20-engine-reach-acceptance.md`.*

*Agreed by Kenil the same evening (Q98): five slices as below; questions 1 and 3–6 as recommended; question 2 answered otherwise: "A7 - let it talk to network" (the frame's network policy opens; its exact reach is settled with him when S4 is built).*

*Kenil's spec of 19 October 2026, evening ("leave that, I want to work in this instead"),
with what the code says today where his "Today" differs, the order, and the questions for his
yes before any code. Nothing here adds a rule for the model: every item removes a wall on reach
or replaces a mechanism. The four gates stay (anything leaving the person's world, deleting
their own entries, money, a sign-in), and so do the sandbox, provenance and the journal line
on every call.*

An earlier proposal for this list (`fences-down-proposal.md`, five slices and nine questions)
is named in memory but was found nowhere: not on disk and not in any session. This one
replaces it.

## Checked against the code (19 Oct, at `66eff49`)

| Item | The spec's "Today" | The code today | What it changes in the build |
|---|---|---|---|
| A12 | The fingerprint covers the schemas, docstrings included | `mcp/inprocess.py install`: a hash of each hand's name **and signature** (parameters with defaults and types), no docstrings. A docstring edit already keeps the session; an added optional parameter drops it. Today's P5, P7 and P8 each added one, so each reset every open conversation. | As specified: names only. The checkpoint goes in front of the first turn of a new session. |
| A1 | turn = opus, … | `models.toml` is as stated (`fadcf46`) | Nothing to build; the five first-day journeys are the proof. The routing judge "in section C" is not in this message (question 1). |
| A2 | DENIED has "Task"; turns allow hands, WebSearch, WebFetch, OWN_TOOLS | As stated (`running.py DENIED`, `engine.options_for`). The bundled Claude Code 2.1.301 has `subagent_type`, but whether the tool is called `Task` or `Agent` is for the spike. | The spike first, as specified; `TOOL_WORDS` gets whichever name it is. |
| A3 | `SANDBOX["network"] = {}`; SandboxNetworkAccess always denied | As stated (`engine.py`, `can_use`). SDK 0.2.168 has `allowedDomains`. | As specified. Hosts not listed get a deferred card, as for a removal. Q80 is reversed, recorded as a Qn row. |
| A4 | Writes only in the module's directory | As stated (`can_use`) | As specified, with the `.claude/` deny. |
| A5 | `world_query(limit=200)` | Default 200; `queries.MOST_ROWS` comes from `limits.toml [views] query_rows = 200`, an entry that exists | The default becomes 1,000 by changing that existing value (no new entry). A `total` comes back, `offset` is new, and nothing caps `limit`. |
| A6 | PRIVATE refused | `connectors/browser.py PRIVATE` in four places (read, script, download, act). The driver blocks requests that change data. | As specified. |
| A7 | A page tells the window only ready, error and size | As stated (`world/pages.py`). The frame's content policy has `connect-src 'none'`, so a page cannot reach the core itself. | The frame posts `{alpha: "act", words}` to the window, and the window calls the core under the page's module (question 2). The page kit gets `button`. |
| A8 | `ENABLE_TOOL_SEARCH = "false"` | As stated (`engine.environment`) | The spike first, as specified. |
| A9 | `setting_sources = []` | As stated. The turn's `cwd` is already the module's directory. SDK 0.2.168 also has a `skills` option. | The spike tries both and keeps the one that loads only the module's skills (question 3). |
| A10 | Runs don't persist; "acting.py blocks an agent from proposing outward at all" | Runs don't persist (`turn.ask`, `persist=conversation`). **P3b (Q94) already lets an agent draft through `act_outward`**: its card waits, and no standing permission covers it. A run is refused `reader_run`, `page_to_table` and `procedure_save`. | Part (3) is already true; `agent_drafts_for_yes` stays the proof. Persisting runs reverses Q21 for agents' runs (question 4). The three refusals go with "a turn's reach" (question 5). |
| A11 | Five built-ins on | `builtin.ensure` makes Watson, Doc, Columbo, Sherlock, Scout and Reminders, all on | As specified: Columbo, Sherlock and Scout paused, made paused and paused once on existing worlds, with one Activity line. |

## The order: five slices, each built, journeyed, looked at in your app, committed on your word

1. **S1, the session and the plumbing:** A12 first, then A5, A8 (its spike) and A1's proof.
   A12 goes first because every later slice changes the tool list.
2. **S2, reach from the shell and the files:** A2 (its spike), A4, A3. A3's network list is
   also what A6 reads.
3. **S3, the browser and skills:** A6, A9 (its spike).
4. **S4, pages and agents:** A7, A10.
5. **S5, the defaults:** A11.

Section A's acceptance follows S5:
- the five first-day sentences, `sync_from_words` (your say) and `watch_from_words`, with Task
  allowed;
- the three new journeys (a listed fetch, a card for an unlisted host, a page button);
- your four sentences in the app;
- input tokens per turn and time to first words, measured before S1 and after S5 on the same
  journeys.

## Questions

1. **A1's "section C"** (the routing judge) isn't in what you sent. Is there a section C to
   build after this, or does the routing judge stay as it is for now? I'd leave it as it is
   until you send C.
2. **A7, how a page's button reaches the core.** I'd keep the frame's `connect-src 'none'`
   and have the frame ask the window, which starts the turn under the page's module and ticket.
   A page then never talks to the network, not even to Alpha. The alternative is opening
   `connect-src` to one core route. I'd take the window.
3. **A9, which loader.** The spike tries `setting_sources: ["project"]` with the module's
   directory, and the SDK's own `skills` option. I'd keep whichever loads the module's skills
   and nothing from `~/.claude`, proven by a planted file. If both qualify, I'd take `skills`:
   it reads no settings files at all.
4. **A10 reverses Q21 for agents' runs** ("stateless unless a live conversation: a remembered
   session would bring back whatever the model once believed"). With the A12 rule and a
   checkpoint when a session changes, I'd record it as a new Qn: an agent's run resumes its
   own session, and its item keeps the history the person can read.
5. **A10, the three refusals in a run** (`reader_run`, `page_to_table` and `procedure_save`
   are refused inside an agent's run today). A turn's reach would lift them. I'd lift them all:
   `act_outward` still gates what leaves, and a procedure saved in a run still needs a dry run
   and the person's yes to act.
6. **A12's checkpoint costs one model call** when the tool names change (Watson writes it).
   I'd use the conversation's latest checkpoint note when one exists and write one only when
   none does. The names change rarely once S1 is in.

---

## The spec, as Kenil wrote it (19 Oct 2026)

# open the engine's reach

## The goal, stated once so nothing below is read as a new rule

The model is fenced today by walls on REACH, not by the gates on SAFETY. This section removes
the walls on reach and leaves the gates exactly as they are. The four gates stay: anything that
leaves the person's world, deleting the person's own entries, money, a sign-in. The sandbox
stays. Provenance stays. The journal line on every call stays.

Non-goals, so they are not done by accident: no new paragraph in any prompt; no new hand unless
named here; no new entry in limits.toml; no new "unsure" card or judgement by a small model; no
change to the window beyond the two named (A3's card, A11's pause). If an item seems to need a
rule for the model, stop and ask Kenil; the answer will be a mechanism.

Each item: what the code does today (file and construct), the change, what must not change,
and the proof. Do A12 first, then A1 to A11 in any order; A2, A8 and A9 change the tool list
and depend on A12.

## A12. The session fingerprint, first

Today: a conversation's SDK session is resumed only when the tool fingerprint matches the one
it was made with (Q75; runtime/conversations.py and engine.py `resume`). The fingerprint
covers the hands' schemas, so any edit to a docstring, and any item below that adds a tool,
makes every open conversation start from nothing.
Change: (1) the fingerprint is over tool NAMES only, sorted; a docstring edit no longer
invalidates a session. (2) When the names do differ, the session is not dropped to nothing:
Watson's checkpoint (the conversation's summary note that exists for PreCompact) is written
for it and injected as the first user-role note of the new session ("What was going on before
the tools changed: ..."). Keep: the rule that a session made on different tool NAMES is not
resumed (the 17 Oct failure "No such tool available: ask_person").
Proof: a test that edits a hand's docstring and shows the same session id resumed; a journey
that adds a tool between two turns and shows the second turn knowing what the first did.

## A1. The models — done, keep

config/models.toml now reads turn = opus, independent = opus, refile = opus, judge = sonnet,
trial = sonnet, look = sonnet (commit "update models", 19 Oct). Keep exactly that. Nothing
further; the routing judge goes in section C, not here.
Proof: the five first-day journeys green on these aliases (just journeys --fresh).

## A2. Subagents

Today: runtime/running.py DENIED = ["Bash", "Edit", "Write", "NotebookEdit", "Read", "Glob",
"Grep", "Task"]; engine.options_for passes `disallowed_tools = DENIED minus allowed`, and for a
turn `allowed` is the hands plus WebSearch, WebFetch and OWN_TOOLS = ["Bash", "Glob", "Grep"].
So the SDK's Task tool (subagents) is denied in every run.
Change: remove "Task" from DENIED and add it to `allowed` for kind "turn" and for agents' runs
(A10). A subagent inherits the parent's tools, hooks and permission callback (the SDK does
this; verify with a spike before building, the way slice 1 did). Add "Task" to TOOL_WORDS
("Working on part of it alongside") so the window shows the step in plain words. The
subagent's own tool calls are journaled under the same turn by the existing hook.
Keep: the gated hands (GATED = world_change, act_outward) still reach the callback from inside
a subagent; the sandbox applies to a subagent's shell.
Proof: a journey "compare the latest rows of these two sources" that shows a Task step in the
journal and a correct answer; a test that a subagent's world_change remove still puts the
removal card.

## A3. Network from scripts, by allowlist

Today: engine.py SANDBOX = {"enabled": True, "autoAllowBashIfSandboxed": True,
"allowUnsandboxedCommands": False, "network": {}} and, in can_use, the tool name
"SandboxNetworkAccess" is always denied ("No network from the shell: anything that leaves the
person's world goes through act_outward"). This was slice 6's wall (Q80). It is a wall on
reach: fetching a JSON endpoint or an API is reading, and the gate for what LEAVES the world is
act_outward, which stays. Q80 is reversed by this item; record it as a Qn row in the design.
Change: (1) a module carries a list of hosts: a `network` field on the module row (world
store, migration) written to and read from module.yaml both ways, like NOTES.md; a kit carries
it. (2) SANDBOX["network"] is built per run from that list (Claude Code's sandbox takes an
allowed-domains list; see the slice 6 spike for the key names) plus a world-level list kept in
Settings › Folders (rename the card "Folders and network"). (3) In can_use, SandboxNetworkAccess
for a host on either list → Allow. For any other host → a card: "Let scripts in <module> reach
<host>?" with "Yes, always for this module" / "No". Use the same deferred mechanism as the
removal card (removal_hook's `defer`, P3 item 7), so the turn does not hold in memory and the
answer resumes it after a restart too. A yes appends the host to the module's list and
journals it; the hook then allows the retried call. (4) The callback's message on a no names
the Settings card.
Keep: act_outward is the only way a message, post, form or payment leaves; a script may read
any listed host and may not send mail or post through one (the guideline in the hand's
docstring says so in one line; the mechanism is that outward connectors are hands, not hosts).
Browser profiles are untouched.
Proof: a journey where a skill script fetches a listed public JSON endpoint and writes rows
with their source; a journey where an unlisted host puts the card, the yes lands it in
module.yaml, and the fetch succeeds in the same conversation; a test that the world-level list
reaches SANDBOX.

## A4. Writes follow the person's grants

Today: can_use allows Read, Glob and Grep inside the module's own directory, the granted
folders (grants.folders) or anywhere with the whole-Mac switch, but Write, Edit and
NotebookEdit only inside the module's own directory ("the person's folders are read, never
written").
Change: Write and Edit are allowed wherever Read is: the module's directory, the granted
folders, or anywhere when the whole-Mac switch is on. Every write is journaled by the existing
hook with its path. The slice 1 spike's protection stays: a path under any `.claude/`
directory is denied for writes (auto-accepted settings writes).
Keep: the deny outside grants, with the same message naming connect what=folder.
Proof: a journey "save this table as a CSV in my Exports folder" with the folder granted; a
test that a write under .claude/ is refused.

## A5. Query results that say how big they are

Today: hands.py world_query(sql, limit=200) and world/queries.query cut at `limit` rows; the
model cannot tell a 200-row answer from a cut one.
Change: the result always carries `total` (a COUNT over the same query) and `offset` is a
parameter; the default limit becomes 1,000; the docstring says "the result names its total;
ask again with offset for the rest". No cap on `limit` itself.
Keep: read-only views; the journal line.
Proof: a test that a 1,553-row query returns 1,000 rows and total 1,553; the LinkedIn journey
asking "how many connections do I have" answers 1,553 without reading them all.

## A6. The browser reaches private hosts the person listed

Today: connectors/browser.py refuses any host matching PRIVATE (loopback, LAN, .local) in
read, script, download and act: "Alpha doesn't open addresses on this Mac or the local
network." browser_script is read-only by the driver (it blocks requests that change data).
Change: the PRIVATE refusal stays for Alpha's own core (its port) and for loopback, and is
lifted for a host on the module's or world's network list from A3 (a LAN system, a local
dashboard). Nothing else changes: browser_read and browser_script stay read-only by the
driver; acting on a site stays a procedure through act_outward. Do NOT make browser_script
able to submit; that is not this item.
Proof: a test that a listed LAN host is read and an unlisted one is refused with the same
message; loopback always refused.

## A7. A page may trigger an action, never write

Today: a page the model draws (world/pages.py, the sandboxed frame, Q82) can tell the window
only ready, error and size; it cannot act.
Change: the frame may post {"act": "<words>"} to the core (a route under the served page's
ticket), and the core starts a turn in the module's thread with those words as the person's
sentence, marked in the journal as coming from the page ("From the Deals page: mark deal 12 as
passed"). The turn runs through the engine and the callback like any other, so a gate still
asks. The page kit gets one block, `button`, with the words it sends.
Keep: Q82, a page never writes data directly; the frame's content policy; read-only queries.
Proof: a journey where a page button changes a row's status through a turn, and the journal
shows the page as the sentence's origin.

## A8. Tool search on

Today: engine.environment() sets ENABLE_TOOL_SEARCH = "false", so every tool's full schema sits
in the context on every turn.
Change: "true". Verify in a spike that the hands are still found and called under tool search
(the SDK defers schemas and loads them on demand). Do this after A12, since the visible tool
list changes.
Proof: the five first-day journeys green with it on; the per-turn input tokens measured lower
(the SDK's usage fields on ResultMessage).

## A9. Skills loaded from the filesystem

Today: options_for passes setting_sources = [] (deliberate: the person's own ~/.claude must
never join a session; the slice 1 spike found their connectors did). A module's skills
(modules/<id>/skills/<name>/SKILL.md) reach the model only through the pre-pack's one-line
index and skill_find.
Change: setting_sources = ["project"] with cwd = the module's directory, so the SDK loads
`<module>/.claude/skills/*` natively (progressive disclosure: names and descriptions in
context, the body on invoke). The module sync (world/modfiles.py) writes `.claude/skills/<name>`
as a link or copy of `skills/<name>` and nothing else under `.claude/`. Never "user". Verify
with a spike that nothing from ~/.claude is loaded with "project" alone.
Keep: skill_keep as the way the model writes a skill; skill_find for search across modules;
A4's deny on writes under .claude/.
Proof: a journey where the model invokes a module's skill through the SDK's Skill tool (the
journal shows it) without skill_find; a test that a file planted in ~/.claude/skills is not
visible to a turn.

## A10. Agents' runs have a turn's reach and resume

Today: an agent's run starts from its brief and the journal each time (Q21), as a request whose
tools are a turn's hands; `persist` is off, so nothing is remembered between runs; acting.py
blocks an agent from proposing an outward action at all.
Change: (1) a run resumes its agent's session: `session_ref` on the agent row, the A12
fingerprint rule, a Watson checkpoint when the session changes. (2) A run's allowed tools are a
turn's: the hands, WebSearch, WebFetch, OWN_TOOLS, Task (A2), with the sandbox and the
module's network list (A3). (3) An agent MAY propose through act_outward; the card waits for
the person and nothing leaves (the journey agent_drafts_for_yes exists; keep it as the proof).
Keep: a run never answers its own card; the 30-minute floor between runs (Q22); runs report to
their item and Activity, never into the person's conversation except as a card.
Proof: a journey with two runs of one agent where the second run knows what the first found
without re-reading it; agent_drafts_for_yes green.

## A11. Three agents off by default

Today: runtime/agents/builtin.py creates Watson, Doc, Columbo, Sherlock and Scout on a world's
first open, all active; Scout runs on the first poll of the day, Columbo on every worked-out
number, Sherlock on @.
Change: Columbo, Sherlock and Scout are created paused; on an existing world they are paused
once at migration with one Activity line ("Columbo, Sherlock and Scout are paused; turn them
on from Agents"). The Agents page's Resume turns one on. Watson, Doc and Reminders stay on.
Keep: their code, pages and journeys; nothing deleted.
Proof: a fresh world shows the three paused; the first-day journeys green without them; a test
that Resume runs Scout's pick on the next poll.

## Acceptance for section A as a whole

On a fresh world, the five first-day sentences plus sync_from_words and watch_from_words
green on the new models with Task allowed; the three new journeys (a listed fetch, a card for
an unlisted host, a page button) green; Kenil in his app: "what did Vikas email me about last
week", a two-site watch, "save this as a CSV in my folder", and "fetch the JSON at <url> and
keep it as a table" with the card answered once. Measured before and after on the same
journeys: input tokens per turn and the time to first words.
