# P3c and P3d: staged writes, Always for a kind, a removal card that outlives a restart (19 Oct 2026)

Kenil: "yes fix it, and then do p3 fully, and p5-p7 as well." This entry covers:
- the fix: a failed dry run withdraws its card;
- P3c: items 5–6 of `design/tasks-and-cards-proposal.md`;
- P3d: item 7.

P5–P7 had no written proposal, so it was written for his yes before any code
(`design/provenance-documents-triggers-proposal.md`). Nothing here is committed: P3b, the wait
check and Q95 are still uncommitted beneath it.

## The fix: a failed dry run's card

- Two cards from that morning's failed dry runs read "waiting" in Decisions all day.
- `Actions._move` now withdraws an action's waiting card in the same transaction when the action
  fails from proposed. Try again's reopen brings it back to waiting.
- The start's sweep withdraws what a failed or declined action left waiting, so his two stale
  cards go on the next open.
- A test covers all three.

## P3c: staged writes and Always (items 5–6)

- **An agent's `stage:` line.**
  - The tables whose rows its runs bring in wait for the person's yes.
  - Stored in `agents.stage`, written in its file beside `may:` and read back from it.
  - Set by `agent_keep` / `agent_create` / `agent_update` (`stage`), whose words say to set it
    for an agent that takes in emails, contacts or a feed. Names that are no table are refused.
- **What is held** (`world/staged.py`, the `staged` table).
  - In a custom agent's run, `world_write` into a staged table holds the rows instead of writing
    them.
  - Every file the run fetches (`world_file fetch`) is moved into `files/.held/<id>/`, out of the
    module's files, and is not a document until the yes.
  - One card per batch, drafted by the agent: "Add 2 rows to Contacts", "File "Bank statement
    Sept 2025.pdf" into Accounting". A later run's rows for the same table join the batch, and
    the card's words follow the count.
- **The decision** (`runtime/staging.py`, `POST /api/staged/{id}/decide`).
  - Yes lands what is ticked (all when none said), with the person's changes, through the
    table's own rules. The card, the agent and the batch go into each row's provenance.
  - A file is kept as a document of the module chosen, its own unless changed. A change of
    ticks, values or place makes the card "Yes, edited".
  - No stores nothing, deletes a held file, keeps the reason, and the journal keeps that it was
    offered.
  - The agent's next run hears it: "the person said yes, after changing it; 2 row(s) added".
- **Always** (item 6).
  - After the same agent's writes into the same place were said yes to unchanged
    `staging.always_after` times in a row (3, a named judgement in `limits.toml`), the card
    offers Always.
  - It grants a standing permission for that agent and place (`permissions.agent` /
    `destination`, effect `stage`), worded "Intake may keep what it brings into Contacts without
    asking."
  - From then on its writes land at once. The card is still made and decided as "allowed", so
    Decisions keeps every one. Revoked like any permission.
- **Only an agent's run stages**: a turn in conversation writes at once, as before.
- **Removal:** an agent, module or conversation removed takes what was held for it, held files
  too, and withdraws its cards.
- **The window.** Home's staged card reads "Deal Analyst brought in":
  - the rows under the table's own field names, each ticked;
  - Change to edit them, or for a file "Keep it in" with the modules;
  - Yes, keep N / Always (when offered) / Not now with a reason.

## P3d: a removal card that outlives a restart (item 7)

- **The spike first**, as the proposal asked, with the real SDK and a one-tool server:
  - A PreToolUse hook returning "defer" ended the turn (`stop_reason: tool_deferred`). The call
    was kept (`deferred_tool_use`), and the tool did not run.
  - Resuming the session in a new process with the hook saying allow ran the deferred call (row 7
    removed) and finished the turn.
  - A deny didn't run it. With a plain prompt the model said "Row 7 stays. I didn't remove it."

  So the fallback the proposal kept was not needed.
- **Built.** In a turn that keeps its session (a conversation, `persist`), the removal goes
  through `engine.removal_hook`.
  - The first time, it puts the card (`removal_card`, shared with the old wait) with the call's
    id and session, and defers. The turn ends: "Waiting for your yes on the card." Nothing waits
    in memory.
  - The answer starts the item's next turn as before. That turn resumes the kept session, after
    a restart too, and the hook decides the deferred call from the card: yes runs it, anything
    else refuses it with "You said no: nothing changed."
  - A turn answering a deferred card resumes its session even when the tools changed since
    (`turn.answers_a_deferral`), or the call would be lost.
  - A turn that keeps no session (an agent's run) waits on the card in memory, as before.
- **The journey suite** answers a deferred card as the app does and runs the item's next turn.

## What ran

- **Tests:**
  - `test_staged.py`, 5 tests:
    - rows wait on one card and land as ticked and changed;
    - a No stores nothing and keeps its reason;
    - a file waits outside the module's files and can go elsewhere;
    - after unchanged yeses the card offers Always, and then it lands at once, as allowed;
    - only an agent's run stages, and removal takes what is held.
  - The engine: the deferred removal decided from its card (defer, still waiting, yes allows, no
    denies with its words, a turn answering it resumes), and a turn ending on a deferred card
    says it waits.
  - The cards: a failed dry run withdraws, Try again brings back, the start sweeps.
  - A window test: the staged card lands only what is ticked, with the change, and offers
    Always only when the card does.
  - Core 380 passed, desktop 233 (1 skipped); lint and types clean.
- **Journeys with the real model**, one fresh world each:
  - `removal_waits_on_its_card` (new, P3d) passed in 52 s (`docs/journeys/2026-10-19-1437.md`).
    The turn ended on the card, the answer resumed the kept session in a new process, and the
    eggs were removed.
  - `remove_asks` passed (`-1440.md`): the in-memory wait for turns that keep no session.
  - `answer_back_to_the_agent` passed (`-1442.md`). The agent saved the broker and proposed
    setting up email.
  - `staged_from_a_run` (new, P3c) passed (`-1446.md`): held on one card with nothing landed,
    then both rows on the yes.
    - It broke twice on its own setup first. The model named the table "People"; the sentence
      now names it.
    - Its first form expected the second run to bring the same rows again after a No. In fact
      the run heard "Not needed" and chose not to, saying so (`-1445.md`). That is the reason
      reaching the next run, as intended. The setup's first break is in `-1439.md`.
- **In the browser pane** on the check copy of his world, with a Deal Analyst batch seeded:
  - Home showed "Deal Analyst brought in · Add 2 rows to Deal list" with its from line and both
    rows ticked.
  - Unticking one and pressing Yes, keep 1 landed one row (Deals went from 1 row to 2), and
    Needs you went to 0.

## Numbers (`just stats`, 19 Oct)

- 380 core tests, 233 desktop tests;
- lint and types clean;
- 40 journeys defined;
- core 26,009 lines, tests 9,836, desktop 20,901;
- 291 commits. P3b, its two fixes, and P3c–P3d are uncommitted.

## Left

- **Kenil's look in the WebKit app** on a rebuild he says yes to:
  - an agent's staged batch;
  - a removal answered after quitting and reopening the app.
- **His yes to the P5–P7 proposal** (five questions), then P6, P5, P7.
- **His agent-draft test (P3b)**, then the commits.
