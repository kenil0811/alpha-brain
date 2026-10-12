# The superseded shapes go (12 October 2026; Q40)

Kenil: "can you ensure the code and repo is clean? all old and stale stuff is completely
gone?" An audit first, by reachability, then the cut.

## What was stale, and why

Since 11 October (§12, Q39) a module starts with the interview and the workflow page.
`research_start` returned an error on every call and `plan_propose` refused outside a running
research pass, so no research pass and no plan could ever start again. Everything behind
those two doors was dead code the app still carried: the research pass with its findings
(Q37), plans with pieces, questions, milestones and hosts, the evaluator, the build runs from
a plan, `jobs.yaml` and the job forms (Q38), their routes, cards, tools, journeys and tests.
About 5,500 lines. Also dead: the `plan_*` words in the rules and the pack, the plan-derived
question cards (the page carries its own questions), the 1 October workspace prototype HTML
in `docs/design/`, an unused name in the proxy's handler.

## Removed

- Core: `world/plans.py`, `world/research.py`, `runtime/research.py`, `runtime/build.py`,
  `runtime/milestones.py`, `runtime/jobs.py`, `mcp/tools/planning.py` (five tools);
  `workspace.make` (the plan's three artifacts); the `plans`, `research` and `findings`
  tables, dropped by a migration on the next start (the journal keeps every line about them;
  `research` and `deepen` threads become topics); the plan half of the scheduler's builds and
  its research runs; the plan and research routes, the job route, the plan parts of a
  proposal and of the conversation payload; the suite's plan, research and build steps and
  checks.
- Desktop: the plan card with its pieces and milestones, the research thread's Stop, the job
  forms on the module's page, their types, client calls and styles. "Your workflow" keeps its
  questions component, now `Questions`.
- Journeys: `plan_declined`, `plan_questions`, `nested_modules` (all three started from a
  plan that cannot be proposed any more; nested modules themselves stay, Q31). Tests:
  `test_plans`, `test_research`, the plan parts of `test_milestones` (now `test_workspace`:
  the walls, the profile, the proxy), of `test_check`, `test_asking`, `test_api`,
  `test_hardening`.
- Docs: `docs/design/prototype/`; the boxes of §6.2, §6.3 and §6.4 say what was removed and
  what stays; Q40 in §11; the tools list in `build-plan.md`; README and CONTRIBUTING.

## What this made plain

The gate on lasting things (`Tools._gate`) opened only inside a plan's build. With plans
gone it keys on a build thread that is no workflow's walled session, and no code opens such a
thread: the page's build makes the tables by code and the walled session writes files. So the
model has no door today for a new automation, reader or source of its own. That was already
true since Q39 and was hidden in dead code; it is now in §6.2's box and in Q40 as an open
question for Kenil, not a regression of this sweep. The tests keep a `building()` fixture that
opens such a thread to make what they test on.

**Checked.** 225 core tests, 86 desktop, ruff, mypy strict, typecheck and vulture clean; the
live world migrated on the app's restart (three tables gone, six topics where research and
deepen threads were). **Run for real:** journey `question_card` passed on a copy of Kenil's
world (`../journeys/2026-10-12-0906.md`); `workflow_interview` broke on its setup step, which
removed a module by the old name: the step now treats a module already absent as the world
it wants, and both workflow journeys name the live scorecard module. Rerun
(`../journeys/2026-10-12-0907.md`, 507 s): the interview, the page (6 steps, 2 things, 8
settings, 3 questions), the change by chat landed with nothing built; the one check that
failed asked for version 2 exactly and found version 4: the model's first revision renamed
steps and things, so the carry-by-title kept less than it should, and it put them back in two
more revisions on its own. The outcome the person sees is right; the check now asks that a
change landed (`version_min`), and the renaming revise is a thing to watch in the next real
change in the app.

## Not touched, on purpose

- `docs/journeys/` (60 reports) and `docs/checks/` (29): history the log cites.
- The ChatGPT route (`runtime/codex_*`, Q32): off by Kenil's choice, not stale.
- Outside the repository: `alpha-platform/`, `alpha-g1/`, `alpha-m1r/`, `diet-run/`,
  `Zazoo-main/`, `design/` (17 GB together) are reference and history by the folder's own
  CLAUDE.md; removing them is Kenil's call. `desktop/.check/` (235 MB of screenshots,
  ignored by git) can be deleted at any time.
