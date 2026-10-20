# Engine reach, S4: buttons on pages, agents' runs with a turn's reach and memory (20 Oct 2026)

Kenil: "ok looks good, lets go to next" (S3 accepted and committed as `ed375e5`). S4 is A7 and
A10, agreed with section A (Q98), except A7's network reach, which was to be settled with him
when S4 was built. Asked, he chose: "A7: a page may reach any web host. Build S4 (A7 and A10)
as agreed." Nothing here is committed.

## A7: a page may trigger an action, never write

- **Network (Q104).** A page's content policy has `connect-src https:`: a page may fetch from
  any https host for live figures. It does not include plain `http:`, which would also let a
  page reach Alpha's own core (`http://127.0.0.1`), so a page still never writes (Q82).
  Everything else in the policy is as before: its own inline script and style, no frames, no
  forms away.
- **The button.** The page kit has a `button` block:
  `{button: {label: "Pass on Harbour Car Wash", says: "mark Harbour Car Wash as passed"}}`.
  - A press posts `{alpha: "act", words}` to the window. The window
    (`PageFrame.tsx`) passes it to the core (`POST /api/modules/{m}/pages/{name}/act`) and
    says in a line under the page: "Sent to Alpha from this page: "…" (in <item>)".
  - The core starts a turn with the words as the person's, in the page's own work item of its
    module ("<page title> page", opened once and reused; `pages.thread_of`). It is journaled
    "From the Deals page: mark Harbour Car Wash as passed", with the words themselves as the
    turn's prompt.
  - The turn runs through the engine and the callback like any other, so what must ask still
    asks.
- `page_keep`'s words name the button and the network ("It may fetch() from any https host
  for live figures").

## A10: agents' runs have a turn's reach and resume

- **A run resumes its agent's session (Q105).**
  - The session is its item's. An agent has its own item, so this is the agent's session; the
    spec's `session_ref` on the agent row would be the same thing.
  - A12's rules hold: a change of hand names or of how the world is given starts a fresh one,
    carrying the checkpoint.
  - The first run is a new session, given the start layer (its brief and its thread's
    history). Each later run sees only its own new lines.
- **One turn at a time per item.** A run and a sentence typed in the agent's item both resume
  that one session, so the per-thread lock moved from the API to `running.lock_of`
  (re-entrant), and a run takes it too.
- **A removal inside a run waits on its card in memory**, as before. A deferred yes would
  resume the conversation, not the run.
- **A turn's reach** (question 5 as recommended): a run is no longer refused `reader_run`,
  `page_to_table` or `procedure_save`. Acting through a procedure still needs a dry run and
  the person's yes (`act_outward`). A run already had a turn's tools, and with S2 its helpers,
  writes and network list.
- **Kept:**
  - a run never answers its own card;
  - the 30-minute floor between runs (Q22);
  - runs report to their item and Activity;
  - a mention (`@Name`) stays a one-off turn, not the run's session.

## What ran

- **Tests:**
  - A7: the page's policy (`https:`, no plain `http:`); a press journaled as from the page, in
    the page's own item, reused; an unknown page or empty words refused; the window passing a
    press and saying so.
  - A10: two runs, the second resuming the first's session; the three tests that asserted the
    lifted refusals now assert the turn's reach.
  - Core 443, desktop 240; lint and types clean.
- **Journeys**, on a scratch folder of their own (`TMPDIR`), each on a fresh world with the
  real model:
  - `page_button_changes_a_row` (A7), new, with a `page` seed, a `press` step and a `field`
    check, passed (`docs/journeys/2026-10-20-1110.md`): the press "mark Harbour Car Wash as
    passed" ran as a turn ("I've changed Harbour Car Wash in Listings from Looking to
    **Passed**"), journaled as from the page.
  - `agent_remembers_its_last_run` (A10), new:
    - Its first run (`-1112.md`) failed only on its check: the suite's judge reads the last
      turn, and an agent's run is not one ("No turn to judge"). The agent had answered
      right: "One new listing since my last run: **Lakeside Bakery** … That makes 3 in the
      table."
    - The check is now the agent's own result (`result_matches`). Run again, it passed
      (`-1123.md`): the first run counted two listings, the second named only Lakeside
      Bakery as "new since my last run".
    - **Seen in it, not acted on:** the first run wrote the prices in £, though the table
      records no currency. The second run said so itself and dropped it. It is an
      unstated assumption, like `branded_food`'s.
  - The runs that now resume a session, run again: `agent_takes_a_task` (`-1113.md`),
    `agent_wakes_on_a_row` (`-1115.md`), `answer_back_to_the_agent` (`-1118.md`) and
    `reminder_fires` (`-1120.md`), all passed. An agent's question and the person's answer
    still go back to it, now in its resumed session.

## Restart

Rebuilt and restarted on his word ("Yes, rebuild and restart my app on S4, then give me the test
steps in chat"): the core came up at 11:32 BST on the repository's code, with no new errors in
its log. His look is next: a page with a button in Deals and a live figure on it (A7), and Deal
Analyst woken twice by new rows, then asked in its own item what its runs found (A10).

## Kenil's look, and the commit

From his journal (read-only), 11:36–11:41 BST:
- **A7, the button.**
  - "draw a page for Deals … a Pass button on each" opened a work item. Alpha added a `status`
    field to Deal list, drew the page (its look: clean) and named each deal with its button.
  - His press on Ohio Plumbing was journaled as his own sentence, "From the Deals page: mark
    Ohio Plumbing as passed", and the row changed to Passed, with "stated by Kenil" as its
    source.
- **A7, the network.** "add today's USD to GBP rate, fetched live each time the page opens"
  went to the page's item.
  - Alpha added a tile that fetches the rate from the European Central Bank's figures as the
    page opens.
  - Its first look was not clean (an unlabelled row of tiles), and it fixed that before
    answering.
  - He moved the page to Overview and back, from the window's own button.
- **A10.** His two new deals woke Deal Analyst twice. Then his answer to its Summit
  Landscaping card ("The Maryland one") ran it a third time, and that run found the listing
  and its broker.
  - All three runs resumed one session (the item's `6269fb00…`). None was given the start
    layer again: what each was given holds only the per-sentence layer.
  - The second run's "open here" held the first run's question.
- **Seen, not acted on:**
  - Every run's matches include Alpha's own dev log files: his whole `~/Desktop/dev` is a
    granted folder (S3's note).
  - "Name Plate", a person, is named as "who the sentence names" for a run's own line.
  - He did not try the last step (asking Deal Analyst in its item what its runs found).

His word: "lokos good". S4 is committed on it as `42d2f16`.
