# Harness, slice 2: the end of the gate (2a), then the fifteen tools (2b)

*A proposal, 17 October 2026, for Kenil's yes before any code. The second slice of
`alpha-harness-design.md` §18, split in two and the first half detailed here.*

## Why two halves

§18 put three things in slice 2: the end of the gate, the fifteen generic tools, and skills as
directories. The first is what stops the first-day sentences today ("keep my LinkedIn
connections in sync" has no path because `Tools._gate` opens nowhere). The second and third
reshape 73 tools and the skills store: a large, mechanical change that improves the model's
hands but passes no sentence by itself. Doing them together means two or three weeks before
anything the person feels; doing 2a first means sentences 1, 2 and 3 of §17 pass in days, on the
tools that exist. 2b follows as its own proposal.

## 2a: Alpha makes standing things in the conversation

**What changes.**

1. **The gate goes.** `Tools._gate` and `_building` are deleted; `module_create`,
   `collection_create`, `reader_save`, `agent_create` and `source_add` do what they say, in any
   turn, and journal it (they already do). The engine's step line shows it as it happens
   ("Keeping a reader: …", "Setting up the agent: …"), and the reply says it in a line (the
   prompt). Nothing else opens: acting outward keeps its card (Q24, Q59).
2. **`turn.md`'s rules 6 and 7 are replaced** by the design's §8: when a request needs something
   standing (a table kept current, a reader, a schedule, an agent, a module), Alpha makes it
   now, says in one line what it is making, runs it once, and reports what it holds; it asks
   only when the answer changes what gets made and cannot be defaulted safely, and picks and
   names its defaults otherwise (weekly on Monday, keyed on the profile link, kept as people);
   the workflow page is for a big, multi-step job (several documents, judgement steps, a
   procedure the person runs by hand) or when the person says "plan it first". No interview as
   a step; the questions a page needs go on the page.
3. **The build machinery goes; the page stays as plan mode.** After a yes on a page, the core
   says so to Alpha in the same conversation ("You agreed the page; go ahead") and Alpha does the
   work there, turn by turn, with the same tools, as one work item. Deleted: `runtime/
   workflow_build.py`, `parts.py`, `proxy.py`, `workspace.py` and `world/workspaces.py` (the
   walled session, the parts contract, the anonymous proxy, the Seatbelt profile for scripts),
   the scheduler's `builds()`, `workflow_resume` ("Say continue"), the `workflow_build` and
   `repair_part` prompts, Doc's "workflow part" kind, the parts buttons and the build thread in
   the window; the `workspaces` table dropped by migration (the journal kept; `purge.py`
   updated); the module's `workspace` column left null. Kept: `workflows` and
   `workflow_versions`, `workflow_draft/revise/agree/decline`, the card and the page.
4. **Sherlock's look on a drafted page no longer runs on its own**, so nothing lands after a
   yes (the 16 Oct failure); `@Sherlock` stays as it is until slice 4 (the quieter agents),
   which is where Q65 is built.
5. **Bugs of 16 Oct that go with this:** the module card counts the person's rows, never
   settings; the stop reason's 600-character cut and the chat not knowing its build stopped go
   with the build machinery; the page body with a literal `\n\n` (the draft's text is kept as
   written, newlines real).

**What stays the same in 2a:** the 73 tools' names and shapes (2b renames them), skills as rows
in the `skills` table (2b moves them to directories), agents with steps and pipelines
(`agent_create`, `pipeline.py`: the weekly sync with a read step and a reader, run by the
scheduler with no model, is exactly the shape sentence 1 needs and exists today), the five
agents, the window apart from the removals above.

**How a first-day sentence goes after 2a, on the tools that exist.** "keep my LinkedIn
connections in sync": one turn; `page_script` on the connections page, `reader_save` with
`to_end`, `reader_run` into a table keyed on the profile link (`collection_identify` as
people), `agent_create` weekly with a read step and a tell step; the reply names the table,
the count and the next check; the first run's rows are what the person sees. "watch We Work
Remotely for back-end roles": the same with a public page. "track what I eat": `table_start`
or `collection_create` and the reply; "log two eggs": a row. None of these needs a page.

**Journeys (on a fresh world).** The suite gains `--fresh`: a new empty world with the app's
browser profiles copied, instead of a copy of the world. Three new journeys, the first three
sentences of §17: `sync_from_words` (sentence 1; acts in Kenil's LinkedIn session, read-only,
so on his say like `linkedin_sync`; the check: a table with at least 95% of the connections
count the page states, a reader kept, a weekly agent with a next run), `watch_from_words`
(sentence 3; public site; a reader, a schedule, first rows), `track_then_log` (sentence 2; a
table made at once with no question, then a row with its provenance). `workflow_build` and
`workflow_interview` are removed; `vague_tracker` is rewritten to the new rule (a vague
tracker ask gets a thin first version now, and the improvements come after, Q67), and its
"nothing is built" check goes.

**Acceptance.** The three sentences typed by Kenil in the app on his fresh world, each in one
thread, with no internal word, the thing visible on its module page and in Activity. `just
stats`; the design's §4, §6, §8 boxes; the log.

**Size.** Two to three days: most of it removal (about 2,800 lines across the build machinery,
its tests and journeys) and the prompt; the fresh-world suite and the three journeys; the
window's removals.

**Questions for Kenil.**
1. The page as plan mode for big jobs (kept, Alpha's choice or the person's "plan it first"),
   or removed altogether now and brought back when wanted? I'd keep it; it costs nothing while
   unused.
2. `sync_from_words` reads your LinkedIn in Alpha's own signed-in profile every time the suite
   runs it. Fine on your say each time, as the four account journeys are today?

## 2b, in outline (its own proposal after 2a)

The fifteen tools of the design's §4 in place of the 73 (`world_query` as read SQL over views
of the tables, `world_write`, `world_shape`, `world_file`, `browser_*` on the
`browser_toolset` contract, `ask_person`, `tell_person`, `skill_keep`, `agent_keep`,
`schedule_keep`, `act_outward`, the SDK's own shell, files, web and subagents); skills as
Agent Skills directories under each module with a migration writing today's rows out, Doc
editing files, versions as git; the form of a skill (§6.1: by reading / by script, the check,
the marker in the window); the permission callback path (`default` mode, the sensitive tools
out of `allowed_tools`) for `.claude/skills` writes and for `act_outward`; the journal line for
every call as a `PreToolUse` hook; `claude_cli.py` and `[engine] route` removed; the SDK's
`SandboxSettings` for a module's scripts. Sentences 4 and 5 then follow in slices 3 and 4.
