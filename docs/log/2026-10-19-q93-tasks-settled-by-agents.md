# Q93: a task is Done only when its agent says so; tell_person; agent drafts written (19 Oct 2026)

Kenil ran Q92 in his app on the restarted build and sent the Deal Analyst's last reply: "Worth
telling: Gmail is signed in, but I couldn't prepare the P&L request… Agents can't create the
Gmail draft procedure or send anything outward when nobody is watching a run."

## What his world showed (read-only)

- **Q92 worked.**
  - The new agent was named "Deal Analyst" and on call.
  - "Check whether the asking price of Midwest HVAC is above $1M" was given, started, and set
    Done by the agent itself.
  - On "Ask the broker of Midwest HVAC for 3 years of P&L" the run asked as the Deal Analyst,
    and each of his four answers went back to it (`to` set, trigger `answer`). One answer was
    "Done, signed in", on the card of a sign-in question it asked.
  - It pushed back once on its own: "The reply … looks like your own details, not the
    broker's."
- **The task was Done though nothing was done.** All four runs were `succeeded` (the model
  replied without an error), so P2 set the task Done after each, while each said "I couldn't".
  A run that answered was taken for a task done.
- **It could not draft.** `action_propose` refuses in a run ("An agent never acts outward"),
  and the agreed P3 kept that. The agent didn't know this until it hit the wall, so it first
  asked him to sign in to Gmail.
- **"Worth telling:" showed in the reply.** The run rules asked the model to start a line with
  that label, and the runner read it out with a regex: prose parsing, which Q78 forbids.

He said: "Yes: build fixes 1 (a task is Done only when the agent says so; an unsettled one is
Blocked) and 3 (tell_person instead of the "Worth telling:" label) now, and write up agent
drafts for my yes (Q93) in the P3 proposal." Recorded as Q93.

## What was built

- **A task is Done only when its agent says so.**
  - `Tasks.run_ended` settles only a task still Working: Blocked, or Open when the person
    stopped the run. It never sets Done.
  - What the run set (Done, Blocked) stands.
  - The runner's `_settle` writes the task's line from the states, never from the run's words:
    - "did the task …";
    - "could not finish the task …";
    - "stopped on the task …";
    - "is waiting for your answer on the task …, so it is Blocked", when the run left one of its
      questions open;
    - "ended without saying the task … was done, so it is Blocked".
  - `agent_run.md` gains the rule: settle the task yourself with `world_remember` (Done, or
    Blocked with what stops it); a task left Working is Blocked, never Done. The run's prompt
    says "Do this task, then settle it".
- **A run tells the person with a hand.**
  - `worth_telling` and its regex are gone from the runner, and the "Worth telling:" rule is gone
    from `agent_run.md`.
  - In an agent's run, `tell_person` (kind note) journals a `noticed` line under the agent, with
    the run's id, as the label's line used to be.
- **Agent drafts for his yes, written, not built:**
  - P3 item 9 of `design/tasks-and-cards-proposal.md`: in a run, `action_propose` makes the card
    and stops; every agent draft waits for a yes; the task waits; after the yes the agent runs
    again and settles it; the first procedure for a site is learnt by Alpha in conversation.
  - Also the journey `agent_drafts_for_yes`, an acceptance line, and questions 6–8.

## What ran

- **Tests:**
  - `test_task_runs.py`: 11 tests. New:
    - a task is Done only when its agent says so (unsettled, then waiting for an answer, then
      Done);
    - an agent's run tells the person by a hand (a "Worth telling:" reply is kept as its line,
      never parsed).
  - The task-run tests' fake runners now settle their task with the tools, as the rules ask.
  - `test_agents` reports through `tell_person`.
  - `test_readers` lost the regex's test.
  - Core 360 passed; lint and types clean.
- **Journeys with the real model**, each on its own fresh world:
  - `agent_takes_a_task` passed in 56 s (`docs/journeys/2026-10-19-1056.md`); the agent set
    its task Done itself.
  - `answer_back_to_the_agent` passed in 73 s (`-1057.md`). The agent was named and on call.
    The answer went back to it, and it left its task Blocked itself: "I did not send it, so the
    task is Blocked. Sending needs your approval…".
- **His app** was restarted on this core; no window code changed, so there was no rebuild.

## Numbers (`just stats`, 19 Oct)

- 360 core tests, 231 desktop tests;
- lint and types clean;
- 37 journeys defined;
- core 24,644 lines, tests 9,218, desktop 20,535;
- 288 commits before this one. P2, Q92 and Q93 were committed together with their docs on
  Kenil's word ("Yes, commit P2, Q92 and Q93 (with their docs) to main, then we start P3").

## Left

- **Kenil's run** (the acceptance): a task the agent can't finish should end Blocked with its
  line saying why, and one it does should end Done by its own word.
- **His answers to questions 6–8** of P3 item 9 (agent drafts), then P3 itself.
- **His world, his call:**
  - "Ask the broker of Midwest HVAC for 3 years of P&L" and the first P&L task still show Done
    from before this fix; they were not changed by hand.
  - The two wrong facts about him (from the 09:14 misrouted answer) are still there.

## Agreed the same day (Q94)

Kenil: "Yes to P3 item 9 (agent drafts for my yes) with your recommendation on questions 6–8:
agents may draft, no standing permission covers an agent's draft, and after my yes the agent runs
again and settles the task." Recorded as Q94 in the design, and marked in the proposal. Nothing
built for it yet: it is built with P3.
