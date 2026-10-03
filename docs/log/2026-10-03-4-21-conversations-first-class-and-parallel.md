# §4.21 Conversations, first-class and parallel (built 3 Oct 2026, morning)

*Moved verbatim from `build-plan.md` §4.21 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.21" mean this file.*


Design §3.7, points 5, 6 and 8. Built:

- **Store and runtime**: a conversation is a thread of kind `chat` (scope = module or General,
  title from the first sentence, state open / working / waiting / done); `Modules.live_chat`,
  `chats`, `set_session`. `TurnRequest` gained `resume` and `persist`: a conversation's turn
  runs with `--resume <its session>` and without `--no-session-persistence`; every other run
  (builds, automations, the second opinion) stays stateless as Q21 decided; the migration
  nulls sessions only on non-chat or closed threads. The pre-pack's RECENT CONVERSATION became
  THIS CONVERSATION (the conversation's own last 12 turns) plus, on a resumed turn, SINCE YOUR
  LAST TURN HERE (what changed elsewhere in the world, which overrides what the session
  remembers). `runtime/conversations.py`: open, close (the session is dropped, the turns stay),
  close_idle (half an hour quiet, on the scheduler's tick), the companion's focus (in `meta`),
  routing, and the journaled routing note.
- **Routing, by structure then the judge, never by name.** One live conversation: it. A
  short sentence when exactly one live conversation has an open question: that one. Otherwise
  the System One seam (`runtime/judge.py`: a typed question, rules first, a no-tools Haiku run
  otherwise, Jev or Laya later) chooses from the real state (each conversation's scope, title,
  open question, last exchange, which is in focus), leaning toward the focus; under 0.6 it
  asks the person with the candidates as choices and the pick routes the original sentence
  (`routed_answer`). Each judged routing is journaled with its confidence and reason.
- **API**: `AskBody.conversation`; `Turns.start` places every person turn in a conversation
  (the one named, the scope's live one for the panel, or routed for the companion, which may
  come back as `state: "asked"` with options); `/api/conversations` (live, with scope, state,
  open question, last line, live progress), `POST /api/conversations`, `/close`, `/focus`,
  `/api/companion` (focus, conversations, needs you), `/api/turns/{key}/move` (ask again in
  another conversation), `/api/conversation?conversation=`; an answer to a question continues
  the conversation that asked.
- **The app**: the panel speaks in a conversation of its own (the page's live one, else a new
  one), shows a strip of live conversations with their state to switch between, the active
  one's title and scope in the header, Done to close it; the companion follows a focus, sends
  with no conversation so the core routes, shows "In <scope>:" when the conversation changed,
  renders a routing question and Alpha's questions as pills, and Send it / Do it / Not now for
  a proposed action; Open lands on the focused conversation's page with it open.
- **Checked** on a copy of Kenil's world in the browser pane: two conversations on two module
  pages (Nutrition 18 s, Deal Tracker 13 s), the strip with both, then "and protein today?" from
  the companion with both live and no focus: the judge chose Nutrition, the companion's header
  switched to it, and the resumed turn answered in **6 s** (the first in that conversation
  took 18 s): the session cache is the speed win Kenil felt was missing.
- Tests: `test_conversations.py` (one live needs no judge; a short reply goes to the asker;
  the judge decides from the state; unsure asks with choices and the pick routes; a
  conversation keeps its session while live and drops it when closed, a build never resumes;
  the panel's scope; idle closing), `test_judge.py`. 146 core tests; lint and types clean.
- Not yet: noticing at close (the wiki slice), "move to…" in the panel's UI (the route
  exists), a routing journey with real sentences, measuring the per-turn context.
