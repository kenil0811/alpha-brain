# Interview me, and Tools — 4 October 2026, on main (90c1a5a)

Asked by Vikas: an AI interviewer that reads the present context and projects, finds the missing
pieces and what would have helped Alpha help them, then interviews them by voice in the time
they choose, with a live slider showing the share of questions covered, the questions ranked by
return on time and kept in a natural flow; a simple "Interview me" tile on Home; and a Tools tab
above Second brain (on main: above Map) where such tools are designed and built.

Decisions Vikas took (3 Oct): a tool is a person skill with its own UI (kind `tool`); answers are
drafted and approved, never written on their own; turn-taking is hands-free; first built on
`feat/bridge-parity`, then rebuilt on current main at Vikas's request (`feat/interviewer`): UI only,
nothing under `core/`, like pull request #4.

## What was built (on main, UI only)

- **Engine** (`desktop/src/shell/interviewPlan.ts`): Alpha prepares in the interview's own
  conversation (reads the world; context, gaps, questions with value 1–10 and minutes; reading
  only). Picking is greedy by value per minute with a flat 0.25 min for a new topic (marked
  `ponytail:`); order is topics by their best question, value inside a topic, the topic under way
  first; re-planned after every answer with the time left, a quarter-minute grace keeping the plan
  chosen.
- **Screen** (`shell/Interview.tsx`): what Alpha sees and the scope; a slider from the cheapest
  question to all of them with the live share of questions and of their value; the live interview
  speaks with the window's `speechSynthesis`, listens with main's `useSpeech` (the window's
  recognition), ends an answer after two seconds of quiet (words or mic level), hears "skip" and
  "stop", and has Skip, Pause, End, a typed answer and "5 more minutes". At the end Alpha drafts
  facts and notes; nothing is kept until ticked. Notes go straight to `POST /api/notes` (titled with
  the tool and date so no page is replaced); facts, which the window has no route for, go back to
  Alpha in one turn to record exactly with `fact_record`. A failed draft keeps the answers.
- **Tools** (Intelligence, first tab, before Map): the Interviewer built in; a saved tool is a wiki
  page under `topic:voice_tools` (title, summary = card line, body = purpose), so no new kind of
  thing in the core; Design a tool (Alpha drafts, the person edits and saves), Start from this,
  Retire (rewrites the page as retired: the core can't delete a page).
- **Home**: an "Interview me" tile.

## What ran

- Desktop: typecheck clean; 88 tests, 10 of them new (picking, ordering, parsing, commands; the
  whole interview with a fake model, and approved facts handed to Alpha exactly). `Rig.test` failed
  once in the full run and passes alone, with and without this change.
- In the window (Vite on a core with a fresh world): the tile opens the interview and asks Alpha
  to prepare; the core answered that Claude subscription access is off for the organization, shown
  as is with Try again.
- **Not run for real:** a prepared interview, spoken turns. **Known limit on main:** the Mac app's
  WebKit has no speech recognition, so hands-free listening works in Chrome only; in the app the
  answer is typed or dictated. Native listening needs the host's speech-to-text (pull request #1
  has it).
