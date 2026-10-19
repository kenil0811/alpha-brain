# P3b: an agent drafts; only the person's yes acts (19 Oct 2026)

Kenil: "Yes, the menu opens right now. Commit P3a with its docs to main, then go on to P3b (agent
drafts for my yes)." P3a went in as `fe5fceb`. P3b is item 9 of
`design/tasks-and-cards-proposal.md`, agreed with questions 6–8 as Q94. Not committed.

## Why

On 19 Oct his Deal Analyst could not draft the broker's email: `action_propose` refused in a
run ("An agent never acts outward"). So it left the wording on the row, asked him to sign in to
Gmail for nothing, and told him to ask in chat.

## What was built

### The core
- **An agent's run drafts.**
  - `action_propose` no longer refuses in a run. An agent's draft is the same `actions` row,
    dry run and card as Alpha's. Its card carries the agent as drafter, the run, and the task
    the run served (P3a).
  - `action_approve` stays refused in a run: only the person's yes acts.
- **Every agent draft asks** (question 7).
  - In a run, the standing-permission shortcut is skipped.
  - `acting.approve` refuses "always" on an agent's draft: "An agent's draft asks every time".
  - The window hides Always allow on its card.
- **A newer draft takes the older one's place** (P3 item 4): the same agent, the same task, or
  with none the same thread. `Cards.replace_drafts` withdraws the older waiting card, and its
  action is declined.
- **The task waits for the yes.** A run that leaves a draft waiting is told it "is waiting for
  your yes on the task …, so it is Blocked". The task shows "Waiting for your yes" (P3a's
  field).
- **After the yes, the agent settles its task** (question 8).
  - `acting.perform` hands the task back: `back_to_drafter` sets it Working when the draft was
    an agent's, for a task the agent owns.
  - The app's approve route starts it at once (`Scheduler.tasks`, or directly when not live).
    A yes in words reaches the scheduler's next tick.
  - Every run of an agent gets "What became of your drafts since your last run" once
    (`Cards.decided_for`, `told_at`):
    - a yes and what the action did ("done: Made: …", or its error);
    - a No and its reason;
    - a draft withdrawn.

    This replaces P3a's "What the person said no to".
- **On a No**, the reason is on the card. The task stays Blocked, and nothing runs by itself.
- **An agent's suggestion** (`tell_person` kind proposal): your yes goes to that agent's own
  item, with the suggestion and its why. That is where Alpha sets up a site's first procedure
  with the person there.
- **A site's procedure isn't learnt in a run** (the proposal's "the agent cannot learn it").
  - An agent's write list already keeps `skills` out by default.
  - `procedure_save` now also refuses in a custom agent's run, even one allowed to change skills.
  - Doc's repair of a broken procedure is unchanged (Q49).
- **The words.**
  - `agent_run.md` drops "Never send, post, message, apply or submit anything". Instead: draft
    an outward step with act_outward for the person's yes, settle the task Blocked waiting for
    it, and propose a missing procedure.
  - `agent_create`'s brief words say the same.
- **Doc's re-proposal now works.** The map found that Doc's repair asks it to "propose the
  action again", which the old wall refused in its run.

### The window
- **An agent's draft card** reads "Deal Analyst would prepare", with no Always allow, and the
  from line under "Prepares on google.com…".

## What ran

- **Tests:**
  - `test_agent_drafts.py`, 5 tests:
    - an agent's draft waits for the yes, a standing permission notwithstanding; "always" is
      refused; after the yes the action is done and the agent's next run, with "What became of
      your drafts", settles the task Done;
    - a No keeps the task Blocked, runs nothing, and its reason reaches the next run;
    - a newer draft for the task withdraws the older and declines its action;
    - a yes to an agent's suggestion starts a turn in its own item;
    - a custom agent can't save a procedure in its run.
  - `test_actions` and `test_cards` were updated to Q94.
  - Core 372, desktop 232 (1 skipped); lint and types clean.
- **Journeys with the real model**, each on a fresh world (no site procedures, so nothing could
  touch his Gmail):
  - `agent_takes_a_task` passed in 54 s (`docs/journeys/2026-10-19-1206.md`).
  - `answer_back_to_the_agent` passed in 83 s (`-1208.md`). The agent saved the broker from the
    answer and left the task Blocked.
- **`agent_drafts_for_yes` is written and not run.** It drafts in his real Gmail (a draft,
  which reaches nobody), so it runs only on his say.
  - It seeds an on-call Deal Analyst. Alpha learns the Gmail draft procedure with a draft he
    approves, then the deal and the task.
  - It checks a card drafted by the agent for the task. After the yes: the action done and the
    agent's run settling the task Done.
  - The suite gained a `card` check for it.
- **In the browser pane**, on the check copy of his world, with a draft seeded as the Deal
  Analyst's:
  - Home showed "Deal Analyst would prepare", with Do it / Change / Not now and no Always allow.
  - The from line was moved from under the buttons to under "Prepares on…".
  - "Do it" was not pressed there: the check core has no sign-in to drive.

## Found while he tried it: a pause written as a wait

To try an agent draft, Kenil first had Alpha learn Gmail drafts ("prepare a draft email in Gmail
to kenilshah081198@gmail.com saying hello"). Two dry runs failed before the third worked, all
within two minutes. His Home listed the first two under "Didn't work today".
- **Version 1** had `wait: 2000`, meaning a pause. `wait` takes a selector, so the browser
  failed parsing the selector "2000". The step check let it through.
- **Version 2:** the "Compose" text click didn't open the compose window, and the subject box
  never appeared (a 20 s timeout). Alpha looked at the inbox again, and version 3 clicks Gmail's
  own Compose button (`div[gh=cm]`). That dry run worked, and its card waited for his Do it.
- **On his yes** ("Yes, add the check: a wait step with a bare number is refused at save time
  with plain words pointing to wait_ms"): `check_steps` refuses a `wait` or an `expect` given a
  bare number, in the steps and in the checks after the commit. The words: "takes something
  the page shows (a selector or its text), not a number; for a pause, use {"wait_ms": 2000}".
  `test_actions` covers all three. Core 372 passed.

## Found while he tried it: dry runs that weren't dry (Q95)

Kenil: "so many drafts got saved". One "saying hello" left four Gmail drafts, because Gmail keeps
a draft of anything typed into a compose window:
- 12:14: version 1's dry run (it typed, then failed on `wait: 2000`), and a try or look between;
- 12:15: version 3's dry run;
- 12:17: the real run after his yes. It "failed" at Gmail's changed Save & close, after autosave
  had kept the draft: the one he asked for.

He also pressed Always allow, whose sentence read "Alpha may prepares an email draft…". Doc then
repaired the procedure (version 4, the new Save & close) and dry-ran it once more, leaving a "Doc
would prepare" card he was told not to approve.

Decided as Q95 and built:
- **A prepare has no dry run** (`acting.show`, `NO_DRY_RUN`). Its card is its payload, exactly
  as it will be typed, with "Nothing is typed until your yes: the card shows exactly what will
  be."
  - `approve` takes it without a screenshot.
  - The edit route and Try again's preview go through `show`.
  - `action_propose` answers `dry_run: "none"`.
- **A send carries discard steps** (`check_discard`, `DISCARD_KINDS`). They are required at save
  ("A send procedure needs discard steps …"), never type, and are kept in the skill's
  `steps.yaml`.
  - The browser job carries them, and the driver (`browser_session.mjs`) runs them in the same
    page right after a dry run and after a failed step.
  - A discard that breaks is said in the journal line ("a draft may remain").
  - `procedure_save` and `skill_keep` take `discard`.
- **The standing permission's words:** "Alpha may do this on google.com without asking: Prepares
  an email draft …".
- **The window.** A draft's card can be approved without a screenshot (`needs_preview` false),
  and shows its payload in the conversation's compact card too.
- **What ran:**
  - `test_actions` covers the discard check and drafts without a dry run; the dry-run tests
    moved to a send with discard steps.
  - The upload test and the agent-drafts tests were updated. Core 372 passed; desktop 232; lint
    and types clean.
  - The real driver ran on a local test page twice. A dry run filled the field, stopped before
    Send, and the discard ran (`discarded: true`, the page reading "DISCARDED"). A failing third
    step still ran the discard.
  - In the browser pane on the copy: a draft's card on Home and in the conversation, with the
    payload, the note, and Do it enabled.

## Numbers (`just stats`, 19 Oct)

- 372 core tests, 232 desktop tests;
- lint and types clean;
- 38 journeys defined;
- core 25,282 lines, tests 9,580, desktop 20,734;
- 291 commits, P3b not among them. The app is built on it and not restarted.

## Left

- His look in the WebKit app on a rebuild he says yes to, and his run of `agent_drafts_for_yes`
  (or the same by hand: a Gmail draft procedure, then a task that needs an email).
- P3c (staged writes and Always), P3d (a removal card that outlives a restart).
