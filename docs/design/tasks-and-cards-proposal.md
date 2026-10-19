# Tasks, runs that serve them, and cards as decisions (P1–P3)

*Agreed by Kenil as written, 18 October 2026, with the recommendation on all five questions
(Q91). **P1 built the same night** (`../log/2026-10-18-p1-tasks.md`), accepted by Kenil in his app on 19 Oct; P2 and P3
next.*

*A proposal, 18 October 2026, for Kenil's yes before any code. These are the first three platform
changes Vikas's four projects need (`requirements/alpha-fit-four-projects.md` beside the repo),
under Q84–Q90. Built only once Q71's freeze lifts, as three slices in order: P1, P2, P3. Each is
looked at in the app and committed after his review. Nothing here is per use case: no word of
accounting, deals or contacts reaches the platform.*

## What this is for

All four projects stand on three things Alpha lacks:

1. **A to-do that lives where it belongs.** "Ask the broker for three years of P&L" sits on
   that deal. "Tie September revenue to the bank statement" sits on that line of that client's
   report. Alpha has reminders (a `commitments` row with a moment) and work items (conversations
   with a state). It has no task with a due date, a parent or an owner, and nothing attached to
   a record, a field or a page.
2. **An agent's work you can see as work.** A run is a row tied only to its agent. Its steps
   are journal lines found by their time. Nobody can hand an agent a task and press Start.
3. **A yes you can trust and look back on.** Today's cards live in three places:
   - questions and the removal card are journal `asked` entries;
   - proposals are `proposed` entries;
   - outward actions are `actions` rows.

   The removal card's wait dies at a restart. No card records who drafted it, what outside
   content it rests on, or why it was declined. Nothing stops a scheduled run raising the same
   card every day; the earlier build opened with 255 duplicates. Nothing lets an agent bring
   something in and wait for a yes before it lands (Q86).

## P1: tasks (Q85, Q87)

1. **A task is a row of one built-in table, `tasks`, owned by no module.** It is not a store of
   its own: as a table it gets for free everything a table has:
   - the eight views, inline and bulk edit, saved lists;
   - the record page with History, Undo, Notes and files;
   - `world_query`'s view, search, removal and the purge.

   The table can't be removed, and its fields are Alpha's (a schema only grows today; the
   person may add fields of their own). Its fields:

   | Field | Kind | |
   |---|---|---|
   | title | text | the only one needed |
   | state | status | Open · Working · Blocked · Done · Dropped (the last two are done) |
   | due | date | |
   | remind_at | datetime | the reminder's moment, as today |
   | repeats | text | "every Monday", "monthly on the 1st": the agents' schedule words |
   | priority | choice | P0–P4 |
   | owner | text | `person`, an agent's id, or `entity:<id>` (what someone owes the person) |
   | anchor | text | the address of the place it lives (below) |
   | references | relation, many | the records and people it touches |
   | parent | relation to `tasks` | tasks under tasks |
   | by | text | the person, Alpha, an agent, Watson: who made it |
   | suggested | bool | an agent's task until the person keeps it (question 3) |

2. **Commitments grow into tasks.** On open, every `commitments` row becomes a task once:
   - a reminder keeps its moment;
   - the person's promise is owned by `person`;
   - what someone owes the person is owned by `entity:<id>`.

   The table then goes, as the `skills` table did in 2b. The Reminders agent, Watson's filing,
   the pre-pack's "due within a week", Scout's packet, the person's page and the purge read
   tasks instead (46 references today). `world_remember kind="reminder"` makes a task with
   `remind_at`. Anything else the model writes with `world_write`/`world_change` on `tasks` like
   any table, so **no new hand**.
3. **The anchor is an address the window already understands, extended by two:**
   - a field, `#/m/<module>/<table>/<record>/<field>` (or `#/records/<table>/<record>/<field>`
     for a table in no module);
   - a module's page, `#/m/<module>/page/<name>`.

   A task made on a record, a cell or a page is placed there at once. Otherwise the model picks
   the place from the conversation and what the sentence names, and says it in one line: "On
   RestoPros › Report values › Revenue (Sept) · Change" (Q87). With nothing to go on, the task
   sits on the conversation's module, else on none, and says so. It is never asked.
4. **A repeat is code.** When a repeating task moves to Done, the next one is made in the same
   transaction, with its due moved on by the rule.
5. **Removal takes its tasks.** A task anchored on a module, a record or a page that is removed
   goes with it, said on the removal's card. A person or company removed takes the tasks they
   own, as their commitments go today. The journal keeps all of it.
6. **The window:**
   - **A Tasks page in the rail**, under People & Companies (question 2). It is the standard data
     view over `tasks`, with saved lists Today, This week, Overdue, Agents', Blocked and Waiting
     on others (P3 adds Waiting for my yes).
   - **Three generic additions that serve any table:**
     - relative dates in saved lists (today, this week, before today), where dates are fixed
       today;
     - a relation that holds many (it holds one id today), for references;
     - a **Tree** view, a ninth view for a table with an anchor or a parent: places first, then
       tasks under tasks, folded and unfolded.
   - **Places get a Tasks section:** a record's page shows the tasks anchored on it, its fields'
     and its children's, with Add task; a cell's menu gains Add task here; a module page gains a
     Tasks tab.
   - **The task's page** is the standard record page plus:
     - **Where it lives:** the anchor as a breadcrumb that opens the place;
     - **Around it**, nearest first:
       - the anchor's values with their sources;
       - the parent, the children and the tasks blocking it;
       - the other tasks on the same place;
       - the people and records it references;
       - the module's notes.

     A route builds "Around it", and the same text goes in front of any turn or run about the
     task, so the person and the model see one thing.

## P2: runs serve tasks

> **Changed by Q92 (19 Oct 2026, after Kenil's first try in his app):** an agent's own work is
> not a task. The standing job below was built and removed the same day: it sat in his Open list
> as a to-do. A run on its schedule serves no task; a run started for a task serves it. An agent
> with a brief can be on call (no schedule), a new agent needs a short name, and the answer to a
> question a run asked goes back to that agent. Item 1 as first agreed:

1. **`runs.task`**: the task a run serves. A custom agent has one standing task, its job:
   - it is made with the agent, owned by it and placed on its module;
   - every scheduled run serves it;
   - its state follows the runs: Working while one runs, Blocked when a run fails or waits for a
     sign-in, Open otherwise.

   A task assigned to the agent is served by the runs started for it. The custom agents already
   in a world (Kenil's five) get their standing tasks once, on open. The built-in agents are left
   out: their items stay on their pages (Q76).
2. **A run's steps carry its id.** While a run goes, every journal line it writes carries
   `run`, so the task's page shows that run's steps exactly, not by a window of time, and where
   it stopped.
3. **Assign, then Start.** A task's owner can be an agent. Start, on the task or "start it" in
   words, runs the agent with the task in front: its title, notes and "Around it". The run ends
   the task Done with the run's line as its evidence, or Blocked with why. An agent that only
   runs steps says it can't take a task. Assigning never starts anything.
4. **The window:** the task page's **Agent** section shows the live run (its step now, its last
   line, Stop) and the runs before it. The agent's page lists the tasks it owns.

## P3: cards as decisions, and staged writes (Q86)

1. **A card is a row of `cards`**, whatever it asks: a question (`ask_person`, Scout's costly
   pick, a reminder), a permission (a removal), an outward action (its `actions` row keeps the
   payload, preview and shots; the card points to it), a proposal, a drafted plan page (plan
   mode's yes), or a staged write. Its columns:
   - what it is: kind, the plain sentence, who drafted it (Alpha, an agent, Watson);
   - where it came from: thread, turn, run, task, module;
   - **what it rests on:** the outside sources the turn or run read before it (pages, emails,
     files), taken from the journal by code, never from the model's words;
   - its content, a before when it changes something, and its key;
   - the outcome: state (waiting · yes · edited · no · allowed · withdrawn), the reason, and the
     effect (done · applying · failed · not confirmed).

   The journal stays the record (`asked`/`answered`, `proposed`, each decision a new line);
   the row is the state. **Needs you, the rail's dot and Home count one thing: waiting cards.**
   A task with a waiting card shows "Waiting for your yes" (a field code keeps, which the Tasks
   page's saved list filters on). `cards` joins `purge.py`, and a removal takes the waiting
   cards of what it removes.
2. **A card shows where it came from:** "Drafted by Intake for you · from its run of 09:05",
   and when outside content shaped it, "Rests on: an email from anna@restopros.com".
3. **No has a reason:** Wrong place · Duplicate · Not needed · Bad timing · Wrong recipient ·
   Something else. The reason is kept on the card and put in front of the drafting agent's
   next run ("the person declined X: not needed"). It tunes what the agent does, never its code.
4. **One waiting card per identical step.** The key is the drafter, the target and the
   content.
   - A twin of a waiting card is never made: the run's line says "Waiting for your yes on …"
     and its task shows it.
   - A newer card from the same agent for the same target replaces the older one, which is
     marked withdrawn, grey, never deleted.
   - Cards from modules that are removed or uninstalled are withdrawn at start.
5. **Staged writes.** What an agent's run brings in waits for the person:
   - **files** it fetches always;
   - **rows** for the tables its file names under a new `stage:` line beside `may:`. The model
     writes that line when it makes the agent and says so; the person can edit it.

   A staged write is one card for the batch: "Add 12 people from email this week" with the rows
   and ticks; "File 'Bank statement Sept 2025' into Source documents" with the file's preview,
   the email it came from and the destination with Change.
   - **Yes:** it lands where the card says, with its source and the card in its provenance.
   - **Edit, then yes:** it may change the destination, the rows ticked and their fields, and
     must keep its kind; the table's own rules check it.
   - **No:** nothing is stored and the held file is deleted; the journal keeps that it was
     offered.

   What the person uploads or types is filed at once, as now, and a turn in conversation never
   stages. An agent still never acts outward; it may draft for the person's yes (item 9, Q93).
6. **"Always" for a kind.** After the same agent's staged writes to the same place were said
   yes to unchanged a few times in a row, the card offers **Always keep what Intake files into
   Source documents**. That is a standing permission (the `permissions` table gains agent and
   destination). From then on, such writes land at once as **allowed**, each one still a row in
   History. Revoked as permissions are today. "A few times" is a named judgement in
   `limits.toml` with its why, never a knob the person meets.
7. **A permission card outlives a restart.** A removal card waits on the SDK's `defer` (the
   turn ends and resumes from the persisted session when answered), not on a future in memory.
   The installed SDK has the hook's `permissionDecision: "defer"` and a result's
   `deferred_tool_use`; a spike proves it end to end first. If it doesn't hold, the fallback is today's: the answer starts
   the item's next turn, but the card itself stays true across the restart because its state is
   the row.
8. **History:** Activity gains a **Decisions** list, every card with its decision and colour:
   - yes and edited, green;
   - no, red, with the reason;
   - allowed, blue;
   - withdrawn, grey;
   - waiting, yellow.

   A task's page lists its cards in its Approvals section. A card stays answerable at its card
   and in its item (Q75); Home lists it by the task's or item's name.
9. **An agent drafts; only the person's yes acts (Q93, written 19 Oct; agreed with questions 6–8, Q94).**

   **Why.** On 19 Oct Kenil gave the Deal Analyst "Ask the broker of Midwest HVAC for 3 years
   of P&L". The run could not draft the email: `action_propose` refuses in a run ("An agent
   never acts outward…"). So it left the wording and the broker's address as words on the row,
   asked him to sign in to Gmail first (for nothing: signed in, it still could not draft), and
   told him to ask Alpha in chat. Drafting outreach for a yes is what DealPilot, the
   accounting intake and Network need from their agents. The wall moves from proposing to
   acting: an agent may propose, and nothing leaves until the person's yes.

   - **In a run, `action_propose` makes the card and stops there.**
     - The card is the same `actions` row and card as Alpha's: the exact payload, the
       procedure and its dry run (code, no model), with the screenshot.
     - It adds who drafted it, the run, the task, and what it rests on: "Drafted by Deal
       Analyst for you · from its run of 10:48 · for Ask the broker for 3 years of P&L".
     - A failed dry run leaves a card that can't be approved, as today. The run's line says so.
       The repair happens in conversation, never in the run.
   - **Every agent draft waits for a yes.**
     - A standing permission ("always make the draft") never covers an agent's draft;
       `action_approve` stays refused in a run.
     - A send asks every time, as it always has.
   - **The task waits for the yes.**
     - The run settles its task Blocked, and the task shows "Waiting for your yes" (item 1's
       field).
     - On the yes, the action runs in the person's session, as Alpha's does. Then the agent
       runs again for the task, with "your draft was approved; done: <outcome>" in front
       (Q92's answer route), and settles the task itself.
     - On No, the reason goes on the card and in front of the agent's next run (item 3). The
       task stays Blocked with "you said no: <reason>", and nothing runs by itself.
   - **The first time a site needs a procedure,** the agent cannot learn it: looking at a site
     in the person's session is not a run's work. Its card says what it would send, to whom,
     through which site, and asks for it to be set up. The yes goes to Alpha in the agent's
     item, with the draft in front: Alpha writes the procedure with the person there,
     dry-runs it and shows the card. From then on, the agent's drafts on that site are real
     cards.
   - **The rules for runs** (`agent_run.md`) lose "Never send, post, message, apply or submit
     anything" and gain "propose it with act_outward; it waits for the person's yes". The wall
     stays in code: in a run, `action_propose` only proposes, and `action_approve` is refused.

## What stays the same

- The engine, the hands, the permission callback as the one gate, Q75's rule that an approval
  is given at its card or in its item;
- the `actions` mechanics (dry run, preview, verify, "sent, not confirmed");
- work items as conversations;
- the journal as the record, verbatim, never deleted.

## What goes

- The `commitments` table, after its rows move into `tasks`.
- `needs_you`'s assembly from four sources, replaced by the one table.

## Not in this proposal

- P4–P14: formulas, value-level provenance, structured documents, event triggers, people for
  real, contacts, and the rest of the fit doc.
- Cards decided by one of several people (Alpha has one person).
- A batch card for outward drafts.
- The four projects' modules (Q84: after the platform work).

## Journeys

On a fresh world, with the real model:
- **`task_where_it_belongs`:** a table with a row by chat, then "add a task on that to ask
  for the last three years, due Friday". The checks:
  - one task anchored on the row, its line said;
  - shown on the row's page and in the Tasks tree;
  - "what's open on it?" lists exactly that.
- **`agent_takes_a_task`:** an agent with a brief and a task assigned to it, then Start. The
  checks: `runs.task` set, every step line carrying the run, the task Done with the run's line.
- **`agent_drafts_for_yes`** (Q93): an agent on call with a brief, a site procedure for a
  draft already kept, and a task "ask the broker for the P&L" with the broker's address on the
  row; Start. The checks:
  - one card drafted by the agent, with its run and task;
  - nothing done before the yes;
  - the task waiting for the yes;
  - on yes, the action done, then the agent's next run settles the task Done.
- **`staged_from_a_run`:** an agent with `stage:` on a table, run twice. The checks:
  - one card holding the rows, the twin held back, the line said;
  - on yes, the rows with their source and the card;
  - a second batch declined with "Not needed": nothing written, both in Decisions, and the
    reason in front of the next run.
- **`card_after_restart`**, only if the `defer` spike holds.

Kept green: `reminder_fires` (on tasks now), `remove_asks`, `question_card`,
`two_things_at_once`, `track_then_log`.

## Acceptance

Kenil, in his app:
- a task added by chat on a row and one by hand from the row's page, both in the Tasks tree;
- one assigned to an agent and started, its steps seen on the task;
- a staged batch from an agent's run: one declined with a reason, one approved, both in
  Decisions;
- an old reminder still firing;
- an agent's draft (Q93): the broker email drafted by the Deal Analyst, approved on its card,
  and the task settled by the agent's next run.

## Size

About twelve days in all:
- **P1, five:** the table and the migration, the anchors and addresses, repeats, the Tasks page,
  the Tree view and relative dates, and the places' Tasks sections with "Around it".
- **P2, two.**
- **P3, five to six:** the cards table and its producers, staged writes, keys and withdrawal,
  reasons and "rests on", the window's cards and Decisions, and the `defer` spike; agents'
  drafts (item 9, Q93) about one more.

Each slice is its own commits: the core, then the window.

## Questions for Kenil

Answered 18 Oct: the recommendation on each (Q91).

1. **Tasks as a built-in table** (every table feature for free) or a store of their own? I'd
   take the table.
2. **The Tasks page in the rail** under People & Companies, or inside the Assistant page beside
   the work items? I'd give it the rail: it's the person's list, not Alpha's conversations.
3. **What an agent makes is a suggested task** (✓ to keep, ✕ to drop, like Watson's suggested
   facts) until the person keeps it? I'd say yes: agents' noise is the risk, and the precedent is
   ours.
4. **What the person says in passing** ("I'll send Sania the deck"), which Watson files as a
   commitment today, becomes a task straight away, marked "from what you said"? I'd keep that as
   today.
5. **Decisions in Activity** rather than in Settings (the scope's place)? I'd keep Settings for
   what is not a record.

Asked 19 Oct with item 9 (Q93); answered the same day: the recommendation on each (Q94).

6. **Agent drafts at all:** an agent may propose an outward step as a card, and only the
   person's yes acts? I'd say yes. The agent still acts on nothing; DealPilot's outreach needs
   it.
7. **Standing permissions for agents' drafts:** never, so every agent draft asks; or let
   "Always" cover a prepare-level draft after a few yeses, as for Alpha? I'd say never for now.
   An unwatched run filling the person's drafts folder is the risk, and asking costs one tap.
8. **After the yes:** the agent runs again for the task with the outcome and settles it; or the
   task is Done when the action is done? I'd take the run. Sending the email isn't always the
   whole task ("ask for the P&L" may be Done when sent; "get the P&L" is not).
