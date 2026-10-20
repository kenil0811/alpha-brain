# Section C: one stream, many sessions underneath

*Agreed by Kenil the same day ("makes sense"), with the four recommendations (Q107).*

*For Kenil's yes, 20 Oct 2026. His spec of the same day (C0–C7) is at the end, as he wrote
it. Above it: C0's answers, his "Today" lines checked against the code at `8f9dd78`, how path 1
will be built, the order, and four questions. No code until his yes. C0's log is
[`../log/2026-10-20-section-c-spike.md`](../log/2026-10-20-section-c-spike.md).*

## C0's answers: path 1, with no nudge

- **(a) Yes.** The desk started a subagent in the background and its turn came back in 8 s
  while the work ran. The subagent's calls reached PreToolUse and PostToolUse with its id
  (`agent_id`, the same as the task's id).
- **(b) Yes, and more.** With no query in flight, the completion arrived as stream messages
  (`TaskNotificationMessage`, whose `summary` is the subagent's final message). Then Claude
  Code took a turn of the desk by itself and reported the outcome in its own words. The
  core never has to start that turn.
- **(c) Yes.** `SendMessage` reached the running subagent ("Resuming agent …"), and its
  report carried what it was asked to add.
- **Two things path 1 needs that the spike showed:**
  - **The desk's client stays open between sentences.** Today the engine opens one client
    per turn and closes it at the end; background work lives in that process and would die
    with it.
  - **A subagent's own shell runs in the foreground.** One that backgrounded its own command
    "completed" early with an interim line, then completed again later. The desk reported
    twice, the first time wrongly.

## Checked against the code

| Item | The spec's "Today" | The code today | What it changes |
|---|---|---|---|
| C1 | Home's thread never does long work; `route()` decides first | As stated. Structure runs first, in the API (a thread given, `@Agent`, Alpha's own turn), then in `route()` (`@<item title>`; a short answer when exactly one item has an open question). Then one judge call over the roster of 12. An unsure answer gives a routing card, which is a card of kind `routing` in Needs you. `turn.md` paragraph 6: "The person speaks in Home; work lives in items, each with its own thread. A sentence is routed before you see it." | As specified. Paragraph 6 becomes his two sentences. |
| C2 | Items run in their own sessions | As stated (`api/turns.py`: a worker thread, the per-thread lock, `turn.ask(conversation=True)`, `settle`). | Path 1: a desk service holding one long-lived client (below). |
| C3 | Home.tsx shows the conversation with a card per item | **Differs.** Home.tsx is a dashboard: the tiles, Needs you cards, Scout's picks, Didn't work today, "Waiting on you" item cards (Q77), Coming up, Your modules. The conversation is the shared `Conversation` in `AssistantPanel.tsx`, used by the side panel and the Assistant page, with `ItemCard` ("Sent to X", or the full card that opens the item). An item card has no Open, Change or Try again buttons: the whole card opens it. Retry is on a failed reply. The companion (`AvatarWindow.tsx`) shows the focus conversation's last 12 entries and sends unrouted. `GET /api/conversation` takes the thread as `conversation`, accepts `module` but drops it, and returns every open ask unfiltered. `GET /api/threads/{tid}` exists, but nothing in the window calls it. | As specified on the conversation. On Home's dashboard, the Needs you cards and the "Waiting on you" item cards go (the cards are in the stream, and the Now strip points to them); the tiles, the picks, Coming up and the modules stay. The `module` filter is new in the core. |
| C4 | `engine.yes()` reads typed words | `yes()` is used only inside the engine, to read the answer given to a permission, removal or host card. The answer route matches a card's own buttons and reply. `/api/turns/{key}/move` and `misroutes()` have no caller in the window. | `card_answer` takes one of the card's own options, checked in code, plus the person's words for the journal. The model reads "go ahead", the hand checks the option, and no word list is left for the stream. |
| C5 | An agent row's `tell` flag | **No `tell` column exists.** `world_remember kind=instruction` ignores `about`: an instruction is a bullet in ALPHA.md with no scope. | A `tell` column. An instruction kept with `about=<agent id>` sets it, holding that instruction's text, and removing that instruction clears it. |
| C6 | Home's pre-pack carried the roster | B3's per-turn layer has a WORK ITEMS section (12 items) in Home. | That section goes. The per-turn layer lists outcomes since the desk's last turn, as paragraphs. |
| C7 | Journeys that open items | Ten journeys route through Home: `two_things_at_once` (the only one naming items), `memory_follow_up`, `carries_over_a_tool_change`, `compaction_keeps_what_was_made`, `files_in_a_turn`, `kit_roundtrip`, `page_clean`, `page_drawn`, `reminder_fires`, `removal_waits_on_its_card`. Also S4's page button runs in a "<page> page" item. | They become desk turns, and the suite's `home:` and `here:` steps go. A page's button becomes a sentence to the desk ("From the Deals page: …"), with no page item. |

## How path 1 is built (C1 and C2)

- **A desk service in the core:** one per world, on its own thread and event loop. It holds
  one `ClaudeSDKClient` resumed on the desk's session (Home's), with Alpha's tools, hooks and
  permission callback, for as long as the core runs.
  - **A person's sentence** is a query into it. The start and per-turn layers ride on the
    sentence as now (B). One turn at a time: a sentence typed while the desk speaks waits
    for the boundary.
  - **One reader** follows the client's whole stream:
    - the desk's replies, to the person or in a turn of its own, become `replied` lines in
      Home;
    - `task_started` opens a work thread (title, state working, `session_ref` = the task's
      id);
    - `task_progress` sets the thread's last line;
    - `task_notification` settles the thread with its summary as the outcome. The desk's own
      turn that follows writes the outcome in its words, tagged with the work thread's id.
- **Hooks:**
  - A subagent's calls arrive with `agent_id`. The hook journals each step under that work
    thread.
  - Its shell is forced to the foreground, as S2 already does for the Agent call.
  - The desk's own Agent calls are no longer forced to the foreground. That is the change
    that lets work run beside the desk.
- **Stop:** the desk's Stop interrupts its turn. A live work entry's Stop is the SDK's
  `stop_task`.
- **Reconnect:**
  - When the hand names, the skills or how the world is given change (A12's fingerprint),
    the desk reconnects on the same session.
  - It does so only when no work is running, because a reconnect would end the work.
- **A restart of Alpha** ends running work, as it ends a working item today. The work thread
  is stopped with a line, and Try again on it starts the same work again.
- **An engineering unknown, for C2's tests:** which thread a world write made inside a
  subagent belongs to. A hand doesn't know which call it is serving. The hook does (it
  carries `agent_id`), so the hook hands the call's thread to the hand. If that can't be
  made exact, a subagent's writes are journaled under Home with the work's id in their
  data.

## The order

As the spec says: **C1 and C2 together, then C3, C4, C5, C6, and C7 last.** Each is built,
journeyed, looked at in your app and committed on your word. Question 4 asks when your first
look should be.

## Questions

1. **Path 1, as C0 found.** Build on the SDK's background subagents, with the desk's client
   kept open and no nudge, and keep path 2 only as the fallback if C2's tests hit a wall?
   One consequence: work running when Alpha quits or restarts ends, and its entry says so,
   with Try again. I'd take path 1.
2. **Modules under one desk.** One session has one directory. Today a module's turns run in
   that module's directory (its skills by A9, its files by A4, its NOTES in the start layer).
   I'd have:
   - the desk's directory link every module's skills;
   - the desk and its work reach every module's folder;
   - a sentence typed on a module's page carry that module and its notes in the per-turn
     layer.

   The alternative is that work started from a module's page runs as a separate session in
   that module's directory (path 2 for modules only).
3. **Where an `@Name` answer shows.** C4 keeps `@Name` reaching the agent. The person asked
   it directly, so I'd show its answer in the stream with the agent's chip, as C5 shows a
   `tell` outcome. The alternative is that it stays on the agent's page and in Activity, with
   one line in the stream.
4. **Your first look.** C1 and C2 change the core. Until C3, the window would still show work
   threads as the old items. I'd build C1, C2 and C3, journey them, and bring the three to
   you together. The alternative is a look after C1 and C2 in the old window.

---

## The spec, as Kenil wrote it (20 Oct 2026)

# Section C: one stream, many sessions underneath

## The goal, stated once

From the person's side there is one place to talk. They type sentences; Alpha answers; when
something takes a while, a line in the same place says what is happening and later says what
happened, in full; nothing has to be opened. Underneath, work still runs in sessions of its
own with their own context, so one long job never blocks the next sentence and never fills
the main session's memory. The sessions are an implementation detail the window never shows
as places.

What this replaces, as built by slice 3 (18 Oct) and extended since: Home as one thread of
kind "home" and every other request as a thread of kind "work" with a card in Home, a state,
a last line and its own box; routing in runtime/conversations.py by structure and then one
Sonnet judgement over the roster (route(), roster(), corrections(), misroutes(),
routed_answer(), correct(), CONFIDENT from limits.toml [conversations]); the window's
cards-per-item in Home.tsx, the lanes in AssistantPage.tsx (laneItems: Needs you · Working ·
Done today · Earlier), an item's own conversation page, /api/turns/{key}/move.

Non-goals: no small-model judgement anywhere in routing; no "new item or continue" card; no
rule in the prompt about when to start work (the desk decides, as this harness does); no
second conversation surface, not even per module (a module's page shows the same stream
filtered); the companion window shows the same stream's tail, nothing of its own.

Order: C0 the spike, then C1 and C2 together, C3, C4, C5, C6, then C7 removes what is left.

## C0. The spike, first, one day

Three questions about the pinned SDK (0.2.168, bundled Claude Code) run headless from
engine.py, each answered yes or no in the log before anything is built:
  (a) Can a turn start the SDK's Task tool in the background (run_in_background) and return
      to the person while it runs, with the subagent's tool calls reaching PreToolUse and
      PostToolUse hooks (and carrying the subagent's id)?
  (b) When the background task finishes while the desk session is idle (no query in flight),
      does its completion reach the SDK client as a stream message, or only on the next
      query?
  (c) Can the desk send a message to a running background task (the way this harness's
      SendMessage reaches a running agent)?
If (a) and (b) are yes, build path 1 below; if (a) is yes and (b) is "only on the next
query", path 1 with the nudge in C2; if (a) is no, path 2. Record which, and why, in the log.

## C1. The desk

Today: Home's thread (kind "home") has a resumed session but "never does long work itself";
route() decides before the turn whether a sentence is Home's, an item's or new.
Change: Home's session is the desk, the only session that speaks to the person. Every sentence
typed anywhere goes to the desk's turn, with no routing before it (C4 keeps the two structural
cases). The desk answers what it can now; for anything longer than a few steps it starts
work (C2) and says so in one line; it keeps talking while work runs. B1's paragraph 6 ("where
you are") becomes two sentences: "You are the one voice; work you start runs beside you and
reports back to you; you tell the person what happened in your own words."
Keep: one turn at a time in the desk (a sentence typed while it speaks waits for the
boundary, as now); Stop as a button; the session fingerprint rule (A12).
Proof: a test that no judge is called on a Home sentence; the first-day journeys green.

## C2. Work beside the desk

Path 1 (SDK background subagents). The desk starts work with the SDK's Task tool in the
background; each background task is recorded as a thread row of kind "work" (title, state
working, session_ref = the task's id) so the window can show it, but no sentence is ever
routed to it. The subagent's hooks journal its steps under that thread (the journal's
`thread` column), which is what the live message reads from. When the task completes, the
desk receives it and writes the outcome into the stream as its own reply (a `replied` line in
the Home thread tagged with the work thread's id). Follow-ups: when a sentence concerns running
work, the desk messages that task (C0 c); if (c) is no, the desk waits for the outcome and
answers then, saying so. The nudge for (b) = "only on the next query": the core, on seeing
the work thread settle (the existing settle() path), starts a desk turn itself with actor
"alpha" and the sentence "Work finished: <title>" (journaled as `did`, never shown as the
person's), so the outcome is written without waiting for the person to type.

Path 2 (separate sessions, the fallback). Two hands, named here so they are allowed:
work_start(title, brief) opens a thread of kind "work" and runs turn.ask in it on a worker
thread with its own resumed session (as items run today), returning at once with the thread
id; work_tell(id, text) queues a sentence into that thread for its next boundary. When the
work thread settles, the core appends a journal line of kind `outcome` on the Home thread
with the work's final paragraph and starts a desk turn as above ("Work finished: <title>"),
so the desk writes the outcome in its own words. The desk's per-turn layer (B3) lists
outcomes since its last turn, so nothing is lost if the nudge turn was stopped.

Either path: an outcome returned to the desk is a paragraph (the subagent's final message, or
the work thread's last reply), never the transcript. The work thread keeps its state (working,
needs_you, done, stopped) and last line for the window, as now.
Keep: settle(), reset_working() (a stale working thread stopped at start), the gated hands
inside work reaching the callback, one card per gate.
Proof: a journey where one sentence starts work, a second unrelated sentence is answered
while it runs, and the outcome then appears as Alpha's reply in Home with the work's id; a
test that the outcome's journal line carries the work thread's id.

## C3. The stream, in the window

Today: Home.tsx shows the conversation with a card per item under the sentence that opened
it (title, state, line, Open); the Assistant page shows Home and every item by lane; an item
opens into its own conversation page with its own box; the companion panel speaks in Home or
in an item's box.
Change: one timeline, built from the journal of the Home thread plus the outcome and card
lines that concern it (GET /api/conversation already assembles a timeline; it takes a `thread`
filter and a `module` filter):
  - The person's sentences and Alpha's replies, in order, as now (Reply.tsx stays).
  - Work as one live message: when the desk starts work, the timeline shows one entry for the
    work thread with its title and its last step line, updated in place from the thread's
    journal (/api/turns/{key}/events exists for a turn; add the same for a thread, or poll
    /api/threads/{tid} as the panel polls today). When the work settles, the entry is replaced
    by the desk's outcome reply at that point in the timeline.
  - "Show the work": every outcome reply, and every live entry, has a fold that renders the
    work thread's journal steps (GET /api/threads/{tid}) inline, with the same step words the
    item page uses today. No model call.
  - A topic chip on each message that came from or concerns a work thread: its title; clicking
    it filters the timeline to that thread (the `thread` filter). A module's page shows the
    timeline with the `module` filter and the same box.
  - The Now strip above the composer: the work threads in state working or needs_you, three
    chips at most and "+N", each a filter; a dot when any needs the person.
  - Cards inline where they arise: the ask, permission, staged and proposal cards already
    render in the timeline (conversation slice 2); they stay there and nowhere else. Home's
    "only what needs me" list (Q77) becomes the Now strip's needs-you chips.
  - The companion window shows the timeline's last few entries and the Now strip, and its box
    sends to the desk. Nothing else.
Removed from the window: the item card in Home, the lanes and laneItems, the item's own
conversation page and box (an item's address opens the stream filtered to it), the Assistant
page's list of items (the page becomes the stream, full height), the "Sent to X" rows, the
Open / Change / Try again buttons on cards (Try again stays on a failed outcome reply).
Keep: the composer, the question card's keys, Markdown, Copy and Edit, Stop, the companion's
drag and placement.
Proof: desktop tests for the timeline with a live entry, an outcome with its fold, a chip
filter, the Now strip; just check-desktop on Home, the module page and the companion at both
sizes, light and dark; Kenil's look in WebKit.

## C4. Routing by structure only, then the desk

Today: route() anchors a sentence by structure (an item's box, a card's reply, @item,
@agent, a short answer to an open ask), then asks the judge (answer here / continue X / new
item) with the roster and the person's corrections; unsure puts a three-choice card;
/api/turns/{key}/move lets the person move a turn and counts a misroute.
Change: two structural cases stay, in code: a reply to a card, or its button, answers that
card (home.py's answer routes, unchanged); @Name reaches that agent (an agent's run, as now).
Everything else is a desk turn. The judge call, the roster for routing, CONFIDENT and
[conversations] in limits.toml, corrections(), misroutes(), routed_answer(), correct(), the
unsure card and /api/turns/{key}/move go. "Go ahead" in words: the desk's per-turn layer (B3)
lists the open cards in the stream; with exactly one open permission card, the desk answers
it on the person's behalf through the existing answer path (a hand card_answer(id, words),
allowed only for cards in the person's own stream, journaled "answered in words"); with two
or more it asks which, in words, with ask_person. This replaces engine.yes()'s word list for
the stream; the card's own buttons are unchanged.
Keep: Q75's audit rule in its new form: a card is answered only by its button, by its own
reply, or by the desk on the person's words naming it; never by an agent.
Proof: a journey: two permission cards open, "go ahead" → ask_person which; one open → done;
a test that no judge is called from conversations.py.

## C5. Agents stay out of the stream

Today: an agent made in an item owns that item (Q76); a scheduled run is under it; built-in
agents' items live on their pages; a run's card changes only when it has something to say.
Change: an agent's runs keep their internal thread (kind "work", owned by the agent) for the
window's Activity and the agent's page; nothing of a run enters the stream unless (1) it
raises a card (ask_person, act_outward, a staged batch), which lands inline, or (2) the agent
row's `tell` flag is on. The flag is set by mechanism, not by reading prose: when the desk
keeps an instruction about an agent (world_remember kind=instruction with about=<agent id>,
which it does when the person says "tell me whenever the tracker finds something"), the hand
sets tell=1 on that agent; deleting the instruction clears it. A run of an agent with tell on
appends its outcome paragraph to the Home thread as a `replied` line marked with the agent,
shown in the stream with the agent's chip. Morning (when built) is an agent with tell on by
default.
Keep: Q22's floor, quiet by default, Activity as the full record.
Proof: a journey where an agent's run with tell off leaves the stream unchanged and with tell
on adds one line; reminder_fires still lands its card inline.

## C6. The desk's memory

Today: an item's transcript is its own; Home's pre-pack carried the roster; a conversation's
checkpoint exists (Watson, A12 carry_over).
Change: the desk's context holds outcomes as paragraphs only (C2); "what exactly did you do
there" is the desk querying the `journal` view filtered by the work thread's id (B4; the
docstring names it). Work threads older than a day with state done are not in the Now strip
and never in the desk's context; they remain in the journal and in the stream's history. The
desk compacts like any session (B6) with its checkpoint.
Proof: a journey where, after an outcome, "what did you do there" is answered from the work's
journal; a test that the per-turn layer lists outcomes since the last desk turn and nothing
of their transcripts.

## C7. What goes, and the migration

Code: route()'s judgement branch and helpers (C4); the WORK ITEMS roster section (B3); B1's
paragraph 6 replaced (C1); /api/turns/{key}/move; the window pieces named in C3; the journeys
two_things_at_once (rewritten, below) and any journey that opened an item by name.
World: existing threads of kind "work" stay as internal rows (their journals are the history);
their cards in Home are not shown again; a thread in state needs_you keeps its card, which the
stream shows inline. No table is dropped; purge.py unchanged.
Proof: a world made before C opens, shows its old conversations in the stream's history, and
its one pending card inline.

## Acceptance for section C as a whole

Journey two_things_at_once rewritten: two unrelated requests in one stream; the first starts
work, the second is answered while it runs, both outcomes appear in the stream with their
chips, a follow-up about the first reaches it (or is answered after its outcome, said so),
nothing is opened. Journey go_ahead: one and two pending cards. Journey tell_me: an agent's
outcome line only with the instruction. Kenil in his app: three sentences in Home including
one long one, a follow-up, one "go ahead", the fold opened once to see the work, the
companion showing the same; nothing clicked into.
