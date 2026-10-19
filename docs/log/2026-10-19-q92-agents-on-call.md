# Q92: an agent's work is no task, agents on call, answers back to the agent (19 Oct 2026)

Kenil's first try of P2 in his app, on the rebuild of the morning. He said "make an agent called
Deal Analyst that, when given a task about a deal, works it out from the deal's row and saves
what it found on the row with its source", then gave it "Ask the broker for 3 years of P&L" and
pressed Start. Two messages followed:

- "i asked it to create an agent, why did it create a task??"
- "the task run asked me a question, and when i answered it, it completeley ignored that and did
  something else"

## What went wrong (read from his world's journal, read-only)

1. **The agent's standing job sat in his Open list.** P2 made one for every custom agent: a
   task the agent owns, on its module. The default list shows every open task, so the agent's
   job read as a to-do of his. This was the agreed design (P2 item 1); nobody had asked how it
   would look.
2. **The agent was named after the whole sentence, on a daily run.** The `agent_keep` hand
   needed a schedule and took no name; a missing name fell back to the title. So the agent was
   called "Deal Analyst: when given a task about a deal, work it out…" and ran daily at 08:00.
   Alpha said it couldn't make it start only when a task arrives. It also said the daily run
   "picks up any open task given to it", which was untrue: a given task waits for Start.
3. **His answer went to the wrong conversation.** The run blocked the task and saved a draft on
   the row. It asked "Who is the broker for Midwest HVAC, and how should the P&L request reach
   them?", then ended: nobody watches a run.
   - The card read "Alpha asked": `ask_person` journaled every question as Alpha's.
   - The answer route sent anything not a permission, pick, reminder or check on as "the
     person's next message in the conversation that asked". That conversation's session was
     the one that made the agent; the run's own session, with the question, was another.
   - So Alpha got "kenil shah, kenilshah081198@gmail.com" with no question in front of it.
     It kept them as his own name and email (two facts, `f_674addbcf0aa` and
     `f_7afa7247abfa`).

He said "Yes build these" to the four parts proposed for 1 and 2, and yes to a fifth for 3.
Recorded as Q92.

## What was built

### The core
- **An agent's own work is no task.**
  - `Tasks.standing_for` and `is_standing` are gone. A run serves a task only when started for
    one; a run on its schedule serves none (`runs.task` null).
  - On open, `Tasks._drop_jobs` removes the jobs P2 made, once: the record, its versions and
    its search row. A run that served one keeps its steps and serves none. The journal says so,
    naming them.
  - A removal's count, `run_ended`, `waiting_to_start` and `release_agent` lost their standing
    branches. Removing an agent gives back every task it was given.
- **An agent can be on call, and a new one needs a name.**
  - `agent_keep` (the model's hand) refuses a new agent without a title and a name (two or
    three words). A schedule is optional: with none, an agent with a brief works only when
    given a task and started, or @-mentioned. Its words say giving never starts a task; Start
    does.
  - `agent_create` takes `name` as a required keyword and `schedule` as optional. It refuses
    steps without a schedule.
  - `turn.md` lists `agent_keep` as an agent "on a schedule, or on call for the tasks they give
    it".
- **A question is asked as whoever asked it.** `ask_person` journals under the tools' actor, so
  an agent's run asks as the agent. Asks carry `by` (the agent's name) in Home's needs and in a
  conversation.
- **An answer to a run's question goes back to that agent** (`api/home.py`, `its_run` and
  `carry_on`).
  - When the question carries a run whose agent takes tasks, the answered line carries `to`.
  - The agent runs again (trigger `answer`, new) for the task the run served, with this in
    front of it: how its last run ended, "You asked the person: …", "Their answer: …".
  - No Alpha turn is started.
  - Several questions from one run, answered together, go back together.
  - If the agent is still running, the person is told so before anything is journaled.
  - A question from a run whose agent can't take tasks still goes to Alpha's conversation, now
    with the question in front ("question — answer").
- **The conversation** shows who asked each question, and the answer under it when it went
  back to the agent (it is no message of the conversation's).
- **The runner** builds one prompt from its parts: the head, the answer, the task's Around it,
  the agent's front, and the ending line. Its journal line is "Run of X for the task T" when it
  serves one.

### The window
- **The question card** reads "Deal Analyst asks" (and "asks N things" for a group).
- **An answered question** reads "Deal Analyst asked …", with "You answered …" under it when
  the answer went to the agent.
- **A task's Agent section and an agent's Its tasks** lost the standing job's words and
  branches: Its tasks is "what it was given".

### Tests and journeys
- `test_task_runs.py` rewritten: 8 tests.
  - An agent on call has no schedule, isn't due and owns nothing.
  - A name is needed, and steps need a schedule.
  - A scheduled run serves no task and its lines carry its id.
  - Jobs made before go once on open.
  - Giving never starts; Start runs.
  - Start in words waits for the tick.
  - A question a run asked goes back to its agent: no said line, no fact about the person,
    runs `answer` then `task`, the task Done, the question and answer in front, `by` and
    `answer` in the conversation.
  - Removal gives tasks back.
- The 41 test calls to `agent_create` that had none gained a name. `test_hands` checks the new refusal.
- One window test covers the agent's name on the card and "You answered".
- The journey suite gained an `answer_ask` step (through the app's own answer route) and two
  checks: `agent_made` (a short name, on call, no task of its own) and `answer_went_back`.
- A new journey, `answer_back_to_the_agent`, runs his three sentences, then his task and his
  answer, on a fresh world.

### Found while checking his world: the task left Done

Reading the task's versions on his world, "Ask the broker for 3 years of P&L" was Done, not
Blocked.
- The run had marked it Blocked itself ("I couldn't send the broker request, so I marked the
  task Blocked").
- The run then ended without an error, and `run_ended` set the task Done over the agent's word.
- Fixed in the same change: what the run said of its task stands, and only a task still Working
  is settled by the verdict. The run's line says "did", "could not finish" or "stopped on" from
  the task's state.
- A test covers it (`test_what_the_run_said_of_its_task_stands`).
- His task stays Done until he moves it; it was not changed by hand.

## What ran for real

- **`agent_takes_a_task`, `watch_from_words` and `answer_back_to_the_agent`**, together on one
  fresh world (`docs/journeys/2026-10-19-1030.md`).
  - The first two passed.
  - The third broke on its setup: one invocation shares its fresh world, so it found the first
    journey's Deal Analyst and deals, and the agent was updated, not made. Its run reported the
    missing broker instead of asking.
- **`answer_back_to_the_agent` alone** on a fresh world, with "and asks me for anything the row
  doesn't have" added to his sentence: passed in 82 s (`docs/journeys/2026-10-19-1034.md`).
  - The agent was made as "Deal Analyst" (2 words), on call ("when you ask"), owning no task.
  - The task was given and started; its run asked; the answer "Kenil Shah,
    kenilshah081198@gmail.com" went back to the agent (`turn: null`, `to` set).
  - The agent's answer run succeeded and saved the broker on the Midwest HVAC row. It said it
    could not send the request from a run. Nothing was kept about the person.
- **The desktop check** on a copy of his world: 25 of 25 pages clean at every size
  (`docs/checks/2026-10-19-1027.md`).
- **`agent_takes_a_task` again**, after the `run_ended` fix: passed in 70 s
  (`docs/journeys/2026-10-19-1037.md`).
- **The app was rebuilt and restarted on his world** (19 Oct, about 10:36 and again 10:38).
  - The removal ran once: his journal says "An agent's own work is no longer a task…
    Removed from Tasks: Deal Analyst: when given a task…"; no standing row is left.
  - In the WebKit window, his Tasks' Open list shows only "Reply to Vikas on WhatsApp".
  - "Deal Analyst asked" with the answer under it was not seen in his window. His one question
    was journaled as Alpha's before this change. The window test and the journey cover it;
    his next agent question is the real check.

## Numbers (`just stats`, 19 Oct)

- 359 core tests, 231 desktop tests (1 skipped);
- lint and types clean;
- 37 journeys defined;
- core 24,632 lines, tests 9,162, desktop 20,535;
- 288 commits; P2 and Q92 uncommitted.

## Left

- **His world** still holds what the misrouted answer left. Removing them is his call:
  - two facts about him: name Kenil Shah, and email kenilshah081198@gmail.com;
  - the old Deal Analyst, named after the whole sentence and running daily at 08:00. Remove
    it and ask again, or rename it and take its schedule off.
- **Kenil's run of P2 with Q92 in the app** (the acceptance):
  - make an agent and see it named and on call, with nothing in Tasks;
  - give it a task and Start;
  - answer its question on the card and see the agent carry on.
- `agent_verdict` given a seed of its own.
- P3: cards as rows, staged writes.
