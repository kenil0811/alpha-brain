# P2: runs serve tasks (19 Oct 2026)

Kenil: "Yes, start building P2 (runs serve tasks) as the proposal says." Built to
`design/tasks-and-cards-proposal.md` P2 (Q91), on P1 (`535f6f9`). Not committed yet.

## What was built

### The core
- **A run serves a task.**
  - `runs.task` holds the task a run serves, with an index on `runs(task, started_at)`. The
    `task` trigger was added.
  - A custom agent's run serves the task it was started for; otherwise it serves its standing
    job. Mentions serve none, and the built-in agents keep their own pages (Q76).
  - The task is Working while the run goes, then settles. A standing job goes back to Open, or
    to Blocked when the run failed or a source of its module waits for a sign-in. A task the
    agent was given goes to Done when the run succeeded, Blocked when it failed, and Open when
    the person stopped it.
  - A run started for a task journals one line naming the task and its outcome.
- **A custom agent's job is a task of its own** (`Tasks.standing_for`), owned by the agent and
  placed on its module. It is made when the agent is made, and on open for agents made before.
  It is kept out of a removal card's count, since it goes with its agent.
- **Every line a run writes carries its id** (`data.run`).
  - `journal.RUN` is a context variable set by the runner for its run.
  - The run's turn carries the id on `TurnRequest.run` (and `ALPHA_RUN` for the ChatGPT
    route) to its tools. Each tool call sets the variable on its own worker thread, so even the
    tools' lines carry the run.
  - `Runs.steps(run)` reads them by that id, with an index on `json_extract(data, '$.run')`.
- **Give, then Start.**
  - A task's owner can be an agent. Giving a Working task to one turns it back to Open:
    giving never starts it.
  - Start (`POST /api/tasks/{id}/start`) sets the task Working and runs the agent at once,
    with the task and what is around it in front of the run.
  - In words, `world_remember kind="task"` with `about` (the agent) and `state: "start"` sets
    Working. The scheduler's tick (`Scheduler.tasks`) starts what agents were given and
    someone moved to Working.
  - An agent that only runs its steps is refused in plain words: "only runs its steps; it
    can't take a task".
- **Removal.** Removing an agent (or its module) takes its standing job, and gives the tasks it
  was given back to the person, Open.
- **Routes:** `/api/tasks?owner=`, `/api/tasks/{id}/runs` (each run with its steps, and the
  agent: whether it takes tasks and whether it runs now), and `POST /api/tasks/{id}/start`.
- **The journey suite** gained a seed of an agent with a brief, a `start_tasks` step (the
  scheduler's tick, with the journey's model) and a `task_run` check.

### The window
- **A task's page** has an **Agent** section:
  - Give it to… (the person's own agents only);
  - the agent's name, which opens its page;
  - Start, Stop while it runs, and Take it back;
  - each run with its verdict and line, opening to its steps. A run still going shows its
    steps open.
- **An agent's page** has **Its tasks**: its job first, then what it was given.

## What ran for real

- **`agent_takes_a_task`**, new, on a fresh world with the real model: passed in 80 s
  (`docs/journeys/2026-10-19-0933.md`).
  - The sentence "add a task on Midwest HVAC to work out the asking price as a multiple of
    revenue, give it to the Deal Analyst and start it" put the task on the row, gave it and
    started it.
  - The agent's run served it with 6 steps carrying the run, worked out 0.75×, saved it on
    the row with its source, and left the task Done.
- **Again, with the real model:**
  - `watch_from_words` (fresh): a steps agent's run serving its job, 3 rows
    (`docs/journeys/2026-10-19-0935.md`);
  - `reminder_fires` (`-0937.md`);
  - `task_where_it_belongs` (`-0938.md`).
- **`agent_verdict`** broke on its precondition (`-0940.md`): "0 agents match 'Daily deal
  tracker'". That agent went with the world reset of 18 Oct; it is not this change. The
  journey needs a seed of its own to run on a fresh world.
- **Looked at in the browser pane** (Chromium) against a check core on a seeded copy, with a
  run made by a stand-in model: a task's Agent section, a run opened to its four steps (the
  tool's own line among them), a given task waiting with Start, and an agent's Its tasks.
  Fixed on the way: the run row's badge and step count wrapping.
- **In the WebKit app on his live world** (19 Oct, after a rebuild and restart on his yes): the
  world opened with `runs.task` and its two indexes; his world has no custom agent, so no
  standing job was made and the 18 runs kept so far serve none. A task's page (Ask the broker
  for 3 years of P&L) shows the Agent section, "give it to an agent, then Start", reading
  "Yours. No agent of yours yet." Kenil's run is the acceptance.

## Where it differs from the proposal

- **"Waits for a sign-in"** is read from the module's sources (`status = 'needs_signin'`),
  never from the run's words (Q78).
- **"Start in words"** reaches the scheduler's next tick (half a minute), not an instant run:
  the tools have no scheduler to call.
- **"The step it is on now"** is the open run's steps as they land, read when the page
  refreshes on a change; there is no separate live feed for a run's step.

## Numbers (`just stats`, 19 Oct)

- 356 core tests, 230 desktop tests;
- lint and types clean;
- 36 journeys defined;
- core 24,504 lines, tests 9,075, desktop 20,511;
- 288 commits; P2 uncommitted.

## Left

- Kenil's run in the app (rebuilt and restarted 19 Oct):
  - give a task to an agent with a brief, then Start;
  - watch its run's steps on the task;
  - see it on the agent's page.
- `agent_verdict` given a seed of its own.
- P3: cards as rows, staged writes.
