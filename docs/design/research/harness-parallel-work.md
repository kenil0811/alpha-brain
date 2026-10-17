# Many parallel threads of work, one person, one assistant (research, 17 October 2026)

*For the harness design (`../alpha-harness-design.md`, §7). What current products and research
do about one person, one assistant and many work items in flight: where a message goes, how
background work reports back, context per thread with memory shared, seeing it all, and
interruptions. Sources inline; a third-party write-up is said to be one.*

## 1. The patterns

### 1.1 Topology: one home conversation plus worker threads (the dominant 2026 shape)

- **Claude Code Projects** (public beta): "A project is one ongoing conversation where Claude
  coordinates a stream of related work for you. You tell it what needs doing and it starts a
  thread for each task." The conversation is "one long-running session where Claude acts as
  coordinator … It sees what threads report back, not every step they take." Threads are "the
  workers. Each is a separate session with its own context window that does one piece of work
  and reports back." The coordinator runs at low effort, threads at high.
  https://code.claude.com/docs/en/claude-projects ; https://claude.com/blog/projects-redesigned
- **Dispatch** (Anthropic, Cowork): "a single persistent thread with Claude"; a task "spins up
  the right session" (Code or Cowork); "Claude messages you the outcome", a push when done or
  when it needs a go-ahead. https://support.claude.com/en/articles/13947068
- **Claude Code desktop** (14 Apr 2026): sessions in a sidebar by status/project; a session
  archives itself when its PR merges; side chats (⌘;) read the main thread and write nothing
  back. https://claude.com/blog/claude-code-desktop-redesign ; https://code.claude.com/docs/en/desktop
- **Codex / ChatGPT desktop**: a thread per agent, grouped by project, a worktree per thread;
  "Quick chat" beside "New chat"; Chat/Work toggle. "Start a separate chat for each distinct
  outcome"; a project when work "will continue over time, produce more than one output, or
  depend on the same files and sources." https://learn.chatgpt.com/docs/app ;
  https://learn.chatgpt.com/docs/projects
- **Personal-agent gateways**: OpenClaw routes by origin (DMs share one main session, rooms
  isolated, "Cron jobs: fresh session per run", webhooks isolated), daily reset, idle reset.
  https://docs.openclaw.ai/concepts/session . Hermes cron jobs run "in a completely fresh
  session" with a delivery target. https://hermes-agent.nousresearch.com/docs/guides/daily-briefing-bot
- **Devin**: a Slack thread is a session; `!new` forces one; a substantial thread is moved to a
  channel with a notice left behind; status chip working/blocked/done.
  https://docs.devin.ai/integrations/slack . OpenHands Cloud the same.

### 1.2 Where a new message goes

**By structure (no judgement):** typed in a thread's own box → that thread (Projects: a "go
ahead" in the project conversation does not reach a thread's approval; the prompt is answered
inside the thread); a reply to a pending prompt returns to the thread that asked (Codex
changelog 2026-10-15); `@session-name` with a typeahead, "ask which" on a clash (Claude Code
cross-session messaging); the origin key (OpenClaw; Slack thread = session); a tag on the
message ("Work locally").

**By model judgement (the coordinator):** Projects' rule: "A quick question usually gets an
answer in the conversation. New work goes to a new thread or to a thread already working in that
area, and Claude tells you which. Each new thread shows up under your message as a card …
Several unrelated tasks in one message become separate threads." When unsure it posts
**Suggested threads** to click. Corrections ("Answer that here instead of starting a thread",
"Reuse an existing thread for follow-ups in the same area") are saved to project memory. The
Claude Code desktop harness exposes the rule to the model: every turn is classed first_task /
continuation / new_task; a new_task opens a "New session / Do it here" card that waits; a
mid-task message about something else hands the task off to its own session; Claude's own
proposals are cards that run nothing until clicked. Codex puts the choice on the person (Quick
chat vs New chat; `/side`).

**Research on the judgement:** dialogue-level assignment by LLMs given the existing clusters
and subsequent context is state of the art on IRC but "model-dependent" (Takada & Mori 2026,
https://ceur-ws.org/Vol-4178/paper2.pdf); reply-to links + graph clustering reach 0.90 Shen-F
zero-shot on Discord dev chats (CASCON 2025); a fine-tuned small model "underperforms … models
that utilize complex structural information" (LREC 2026). Thread assignment by an LLM works
when the candidate set is small and described (titles, entities, last summary), evaluated per
model.

### 1.3 How background work reports back

- Outcome only into the home conversation, as a card that updates in place with next-step
  buttons (Projects: Resolve conflicts, Fix CI, Merge it …; tunable in words: "Only post when
  something finishes or is blocked"). Dispatch: "Claude messages you the outcome."
- A status-grouped overview: Projects' Overview (Ready for review / Waiting on you / Working /
  Landing / Idle / Resolved, auto-resolved after a week idle; a dot when something waits on
  you); Claude Code agent view (Pinned / Ready for review / Needs input / Working / Completed,
  one line each, https://code.claude.com/docs/en/agent-view); Codex Activity (unread, running,
  waiting; a floating "pet" shows Running / Needs input / Ready / Blocked); Cursor 2.0's sidebar,
  and the failure mode in its forum: a completed agent you can't find.
- An inbox for scheduled, signal-only work: Codex "Standalone scheduled tasks start a new chat
  for each scheduled run and report results in Scheduled"; runs with no results auto-archived;
  in-chat tasks return to the chat. https://learn.chatgpt.com/docs/automations . ChatGPT's web
  monitors "only notify users when the model judges a change to be significant". Claude Code
  Routines: "Each run creates a new session"; a green status "does not mean the task in your
  prompt succeeded". https://code.claude.com/docs/en/routines
- LangGraph Agent Inbox: interaction types notify / question / review; an inbox item is
  `{action_request, config{allow_ignore, allow_respond, allow_edit, allow_accept},
  description}` and the reply a typed response that resumes the thread.
  https://github.com/langchain-ai/agent-inbox
- Notification policy: Claude Code desktop notifies when a session finishes and you aren't
  viewing it; Projects when Claude posts, a thread errors or needs input; Codex never / in
  background / always, with separate toggles for permissions and questions; Linear's Priority
  tab "separates what needs your attention from what can wait"; Slack Activity 2.0 one feed.

### 1.4 Context per thread, memory shared

Projects: each thread its own context window; every thread starts with the project's
instructions; project memory is files with a `MEMORY.md` index read at thread start; the
conversation "works from recent messages, recent threads, and project memory rather than its
full history". Codex memories: extracted when a thread goes idle, "skips short-lived or
still-active sessions" (https://developers.openai.com/codex/memories). ChatGPT: project-only
memory; "Branch in new chat". Letta shared memory blocks: one owner for heavy edits, others
append; concurrent rethinks lose updates
(https://docs.letta.com/guides/core-concepts/memory/shared-memory). mem0: `user_id` / `run_id` /
`agent_id` scopes. Anthropic's memory tool: "ASSUME INTERRUPTION … Your context window might be
reset at any moment"; a progress log and a checklist for multi-session work
(https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents). Hermes:
MEMORY.md capped, loaded at start and frozen for the session (prefix cache), past sessions in
SQLite searched verbatim. Research: LongMemEval (ICLR 2025); MemoryArena (ICML 2026): agents near
saturation on LoCoMo "perform poorly in our agentic setting" with interdependent subtasks.

### 1.5 Interruptions and messages to a busy thread

Claude Code: typing while a turn runs queues (lost-input bugs reported); cross-session messages
are read between tool calls, never interrupting a running tool; an idle session starts a new
turn; identical repeats dropped, 50 queued max. Codex: a follow-up steers at once (default since
2026-10-15); `codex queue` waits; goal mode has pause/resume/edit. Cursor: queue after, or
redirect at the next tool call. OpenClaw's taxonomy (https://docs.openclaw.ai/concepts/queue-steering.md):
`steer` (default; at tool-launch and model-call boundaries), `followup`, `collect` (debounced
and merged), `interrupt`. Research: InterruptBench (2604.00892): addition / revision /
retraction mid-task "remains challenging"; AgentGUI (2607.26300); AgentRadio (2607.28430): a
"wait-for-mention" background primitive; Magentic-UI pause/take-over/resume.

### 1.6 Opening a thread automatically vs staying in the chat

| Product | Rule |
|---|---|
| Claude Projects | Model judgement, visible: quick question in place; new work → new or existing thread, says which, a card; several tasks → several threads; unsure → Suggested threads; corrections remembered. |
| Claude Code desktop | The model classes the turn; new_task → "New session / Do it here" card that waits; unrelated mid-task → hand off; own proposals → cards that run nothing until clicked. |
| Dispatch | One home thread always; every task a session; outcome back home. |
| Codex app | The person chooses: Quick chat vs New chat; `/side`; standalone vs in-chat schedule. |
| Devin / OpenHands | Structure: Slack thread = session; promote to a channel with a notice. |
| Linear | Outsiders' items go to Triage "before they enter the workflow". |
| Slack (the lesson) | Thread-only "made busy channels harder to read"; hiding replies "caused a fear of missing out"; the fix was broadcasts back and an All Threads view. https://slack.design/articles/threads-in-slack-a-long-design-journey-part-2-of-2/ |

## 2. Trade-offs

1. **Coordinator vs sessions sidebar.** One box, context said once, walk away (Projects); costs:
   the coordinator's own tokens, misroutes, approvals answered in the thread, summaries not
   transcripts. Sidebar: exact control, no misroutes, "doing the coordinating yourself", and
   completed-but-lost agents.
2. **Outcome only vs every step.** Readable home, but "running with no new messages" looks
   stuck; needs a status row and a status on demand.
3. **Signal-only watches.** Fewer interruptions; silence is ambiguous; needs an openable run log.
4. **Inbox vs cards in chat.** Products converge on both: cards in the home chat plus a
   state-grouped overview with a dot.
5. **Per-thread context vs shared memory.** Isolation prevents contamination; sharing must be
   explicit (an index file, instructions, memory blocks); concurrency is the hazard (one writer,
   extraction when idle, memory frozen per session).
6. **Steer vs queue vs interrupt.** Steering at tool boundaries preserves work; mid-task
   revision is still weak for models; products give the person the choice and a structural Stop.
7. **Routing accuracy is model-dependent:** a confirmation path for low confidence and a cheap,
   remembered correction path are needed.

## 3. The recommended model for Alpha

**Objects.** *Home*: the one conversation, the coordinator. *Work item*: a thread with its own
session, a title, a state, a last-summary line, the entities it touches, its own message box; a
build, a watch with runs, or a draft. *Card*: the only way a work item appears in Home: under the
person's message when opened, updated in place, with a reply box and next-step buttons.
*Overview*: beside Home, grouped by state (Waiting on you / Ready for review / Working / Done /
Resolved), a dot when anything waits on the person. *Journal*: every routing decision and run.

**Routing: structure first, one judgement, a card when unsure.**

Structural: typed in an item's box → that item; a reply to a card or its button → the item that
owns it (an approval only at its card or in its item, never by "go ahead" in Home); `@item` →
that item (ask which on a clash); a scheduled or triggered run → a run under its item, never a
Home message, the card updated only when the run has signal; typed while viewing a running item →
steer at the next tool boundary; Stop is a button.

Judgement, only for an unanchored message in Home: the coordinator sees the message, the last
few Home turns and a roster of open items (title, state, last summary, entities; ~20 at most;
never transcripts) and returns one of: **answer here** (reads only, this turn); **continue item
X** (the card re-surfaced, "sent to X"); **new item** (a card); **split** (several items);
**ask** (a two-button card, nothing runs until chosen). Corrections are obeyed and kept as
preferences.

Interruptions: Home is never blocked by a worker; a message to a busy item is held and read
between tool calls; a Home message about something else while an item is being discussed hands
the discussion into its item and Home answers the new message.

Reporting back: outcomes as card updates with one line and next-step buttons; the transcript in
the item; a notification only when not viewing and only for needs-you, failed, finished; several
finishes in a short window collected into one line; no-signal runs filed under the item, the card
saying "last checked Mon 09:07, nothing new".

Memory: per item its own context, compacting on its own; shared: the world, an index read at
item start, standing instructions; an item writes back only its outcome summary and explicit
"remember" entries, extracted when idle, one writer at a time.

## 4. Open questions

1. The confidence threshold: a small labelled set of Kenil's real Home messages (continue / new
   / answer here) before trusting the judgement; misroutes counted in the journal.
2. "Go ahead" in Home when exactly one approval is pending: convenience vs the audit rule.
3. All cards in Home, or only what needs the person: a density to test with Kenil.
4. Auto-resolve after inactivity: a state change only, the item and journal remain.
5. Watch runs: in the item's context or standalone, signal-only; where a watch's own memory of
   what it already reported lives.
6. Steering: limit it to additions; revision and retraction via Stop plus a new instruction?
7. Workers run on the Mac, not the cloud: Home must survive sleep and show "paused: computer
   asleep".
8. Memory write arbitration: a single writer or per-item appends with later consolidation.
9. Device hand-off (answering from the phone): out of scope; the card schema should not
   preclude it.
