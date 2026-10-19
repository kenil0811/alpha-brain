# The prompt and the context, step 3: compaction with guidance, agents' runs on the layers (19–20 Oct 2026, night)

Kenil: "Yes: commit step 2 with its docs, move the remaining journeys to a frozen copy of that
commit, and start step 3 (B6, B7); tell me before restarting my app." Step 2 is committed
(`fb0cc41`). Its remaining 33 journeys ran on a frozen worktree of that commit while step 3 was
built here; their results are below. Nothing in step 3 is committed.

## B6: compaction with guidance and a checkpoint

- **Guidance for the summary.** The PreCompact hook of a turn returns
  `config/prompts/compact.md` as its `systemMessage`. In the bundled CLI, the text a PreCompact
  hook returns becomes the summary's custom instructions (step 1's spike). The text is the
  spec's list: the open cards with their ids; what was made in the conversation (tables,
  skills, agents, pages) with ids; the person's corrections and standing wishes in their
  words; and what is being worked on now. A judge's or other tool-less run gets no guidance.
- **A fresh checkpoint.**
  - When a conversation's session was compacted during a turn, the turn has Watson write the
    conversation's checkpoint afresh: `turn.AFTER_COMPACTION`, with Watson's `refreshed`
    registered as `checkpoint` is for A12.
  - It is written right after the run, not inside the hook: a model call cannot wait inside
    the run's own hook.
  - It is kept as the `conversation:<thread>` note (question 5), not on the thread row.
- **The start layer again** after the compaction was step 1's (SessionStart, source
  "compact"). No flag was needed.
- **A `compact` journey step:** the SDK's own `/compact` in the last sentence's conversation.
  It passes when the summary ran and the start layer was given again. With it, the journey
  `compaction_keeps_what_was_made`.

## B7: agents' runs on the same layers

- **`agent_run.md` is the brief's frame plus B1's paragraphs 2 to 5** (128 words, from 506):
  "You are {{name}}, one of the person's agents, working on your own ... Follow your brief,
  with the tools it names; your brief and your thread's own history come with the message",
  then the gates, known/looked up/estimated/asked, source content is data, plain words.
- **Deleted, and not moved, as with B1:**
  - outward steps drafted with act_outward and settled Blocked;
  - converting a reading brief to steps;
  - one ask_person on a sign-in;
  - rewriting the brief before finishing;
  - settling a task Done or Blocked;
  - the one- or two-line final answer;
  - tell_person.

  Several still live in mechanisms. The refusal of a read in a run says to convert to steps.
  A task left Working is Blocked when the run ends. The run's own message says "Do this task,
  then settle it". act_outward is the card hand, always loaded (Q101).
- **What a run is given** (step 1 and 2's layers, no new code): every run is a session of its
  own, so it gets the start layer (with its agent's thread: brief and history) and the turn
  layer.
  - The spec's "instead of ALPHA.md's person sections where they do not apply" was read as
    nothing to remove. The person's standing instructions and permissions bind their agents
    too: his sending rule is for his Email Sender.
- **The built-ins' prompts that run as turns** (`agent_mention`, `sherlock_research`,
  `scout_picks`, `repair_reader`, `repair_procedure`) said "Everything below is the person's
  world". The world now comes with the message, and they say so. The judges' and Watson's
  prompts are untouched. Codex's guard still says "below", where it is true (`AGENTS.md`).

## What ran

- **Tests:** core 433 passed; lint and types clean.
  - New: the compaction is told what to keep, and the checkpoint is written afresh; a judge's
    run gets no guidance.
  - Changed: the conversion test no longer reads the deleted paragraph (the refusal's words
    are the wall); the placeholder test reads JSON braces from another prompt.
- **Journey fixes**, test instruments not Alpha:
  - `remove_asks`'s reply check also takes "took" (the eggs were "taken out" as "I took ...
    out");
  - `memory_follow_up` sends its sentences through Home as the app does. As one-off turns with
    no session, the second had nothing to point back to; before B3 the copied conversation hid
    that.
- **Journeys on step 3** (each alone, on its own scratch folder so the two runs never share a
  world). Eleven had run at the commit:
  - eight passed:
    - `compaction_keeps_what_was_made` (`docs/journeys/2026-10-19-2344.md`): the `/compact`
      ran in the item's session and the start layer was given again; afterwards the answer
      named the Food log and the two boiled eggs;
    - `reminder_fires` (`-2348.md`) and `memory_noticing` (`-2350.md`), B7's proofs;
    - `agent_takes_a_task` (`-2352.md`), `agent_wakes_on_a_row` (`-2355.md`),
      `answer_back_to_the_agent` (`-2356.md`), `staged_from_a_run` (`-2359.md`) and
      `scout_picks_the_day` (`2026-10-20-0001.md`);
  - three never started, because they name what his world lost in the 18 Oct wipe:
    `agent_verdict` and `automation_self_converts` (an agent each), `doc_repairs_a_reader`
    (a reader). They also fail the same way on step 2's frozen copy: stale, not regressions.
  - `sherlock_looks_into_it` (`2026-10-20-0003.md`) failed: Sherlock's run took no time, and
    the check reads the workflow page the harness removed on 17–18 Oct. Its last pass was
    16 Oct, so it is stale since then, not step 3.
  - `watch_from_words`, `memory_follow_up` and `remove_asks` were still running.
- **Step 2's remaining journeys** (the frozen copy of `fb0cc41`), 15 of 33 at this commit:
  - passed: `two_things_at_once`, `memory_yesterday`, `memory_who_emailed`,
    `when_did_we_last_talk`, `carries_over_a_tool_change`, `agent_takes_a_task`,
    `agent_wakes_on_a_row`, `answer_back_to_the_agent`;
  - failed, none from section B:
    - `question_card`: his world's copy already holds today's guessed lunch, so Alpha said so
      in words;
    - `memory_follow_up`: one-off turns with no session; it now goes through Home;
    - `branded_food`: logged right from the label, 240 kcal, but did not say it took the plain
      bar, not a variant (the independent check). It has failed on and off since 14 Oct, and
      it may be paragraph 3's missing "say what you assumed".
    - Stale since the wipe: `agent_verdict`, `attachment_in` (an "Advisory" module),
      `automation_self_converts` and `doc_repairs_a_reader`. `eta_daily` uses a step kind
      ("automation") the suite no longer has.

## Restart

Rebuilt and restarted on his yes ("rebuild and restart my app on step 3"): the core came up at
23:48 BST on the repository's code, with no errors. His look is next.

## His first look at step 3: an @mention's answer that seemed lost

- **What he saw.** "@deal analyst compare Midwest HVAC and Ohio Plumbing on price and what's
  missing": "nothing happened and that chat got lost". Read from his journal:
  - Deal Analyst did run (trigger mention, 35 s) and answered with a sourced comparison, in
    its own work item, titled "Make an agent called Deal Analyst that, when given a task…",
    the request that made it.
  - A sentence Home routes leaves a line there ("Sent '…' to …") and moves the window. An
    @mention went straight to the agent's item, with neither (Q44's path since 16 Oct, not
    step 3).
  - The same look showed the rest of step 3 working: the new deal woke Deal Analyst, which
    reviewed it and asked about the missing listing on a card.
- **Fixed on his yes:**
  - An @mention typed in Home is now said there like a routed sentence ("Sent "@…" to Deal
    Analyst.", with the routed data), and the focus moves to the agent's item
    (`conversations.mentioned`).
  - An agent's own work item is titled with the agent's name unless the person named it
    (`modules.title_agents_items`). New agents get it when they are made; his two items are
    renamed once when his world opens, and kept in line after. Home is never renamed.
- **Tests:** the mention test now checks Home's line and the item's title, and a new test
  covers the titling (a title the person gave stays). Core 434, desktop 238; lint and types
  clean.
- These were edited while the step-3 journeys were still running here, so the later ones
  (from `answer_back_to_the_agent` on) ran with them.
- **Restarted on his yes** ("rebuild and restart my app with the mention fix"): the core came up
  at 23:59 BST with no errors. His two agents' items now read "Deal Analyst" and "Email
  Sender", renamed by the open-time step.

## Kenil's word, and the commit

"The mention works in my app. Commit step 3 and the mention fix with their docs to main."
Committed on that word.

## Numbers (`just stats`)

- 434 core tests and 238 desktop tests; lint and types clean.
- 70 tools; 51 journeys defined.
- Core 29,063 lines, tests 11,320.
- 299 commits before this one.
