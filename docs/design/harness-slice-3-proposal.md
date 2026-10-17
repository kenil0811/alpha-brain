# Harness, slice 3: conversations and work items

*A proposal, 18 October 2026, for Kenil's yes before any code. The third slice of
`alpha-harness-design.md` §18; the design's §7 made exact. Slices 1, 2a and 2b are built and
accepted.*

## What this slice is for

Today a sentence typed into Home is routed by `conversations.py` (by structure, then the System
One judge) into a conversation thread, and long work, an agent's run and a build each had a
thread of their own kind. The design's §7 replaces that with one shape, the one Claude Code
Projects states plainly: **Home** is the coordinator, **work items** are threads with their own
engine session, a **card** is the only way an item appears in Home, and the **overview** is
Home's lanes by state. Most routing is structure; one small judgement is the model's; when
unsure, a card asks. This slice builds that on what exists.

## What changes

1. **A work item is a thread with a state and a card.** `threads` gains `state` in the
   design's words (`working`, `needs_you`, `done`, `stopped`; `open` for a conversation), a
   `last_line` (the one plain line the card shows), and `touches` (the tables, sites and people
   it is about, for the roster and the routing). A build, a watch's runs, a long answer, a
   draft: all the same thread kind, `work`. The agents' run threads are work items too (their
   runs the entries under them).
2. **Home's session is the coordinator.** The companion's sentence and Home's box go to one
   long-lived conversation, `home`, whose session (slice 1's resume) holds the recent Home turns
   and reads a roster of the open work items (title, state, last line, touches; never their
   transcripts) in its pre-pack. It answers what can be answered now; for anything else it opens
   or continues an item (§7's five answers: answer here, continue X, new item, split, ask).
3. **Routing by structure first, in code** (`conversations.route` rewritten): typed in an
   item's own box → that item; a reply to a card or its button → the item that owns it (an
   approval only there); `@item` or `@agent` → that item; a scheduled or triggered run → a run
   under its agent's item, never a Home message; typed while looking at a running item → that
   item at its next tool boundary. Only a sentence typed in Home that none of these anchors
   goes to the judgement: the System One seam (`judge.py`, Haiku) over the roster, answering
   one of the five, with "ask" (a two-button card: "Continue X" / "New item") when it is not
   sure. Every routing decision is a journal line; the misroutes the person corrects are
   counted there.
4. **Cards and the overview.** A work item appears in Home as one card under the sentence that
   opened it, updated in place (its last line while working, two lines when done, the
   next-step buttons: Open, Try again, Change, the yes it waits for). Home's lanes become the
   states: Needs you · Working · Done today · Resolved, a dot when anything needs the person.
   Several items finishing within a short window make one Home line. "Alpha is working on"
   shows the items' cards, never a thread's steps (those are behind Open).
5. **Corrections kept.** "answer that here", "put that in the LinkedIn thread", "only tell me
   when something finishes or is blocked" are obeyed and kept as the person's preferences
   (`preferences`, read by the coordinator's pre-pack).
6. **Memory per item, shared through the world.** An item's session compacts on its own; an
   item writes back only its last line and what Watson files from it (facts, decisions, a
   commitment); nothing of one item's transcript reaches another's. The coordinator holds the
   recent Home turns, the roster and the world.
7. **The window.** The Assistant page lists work items by state instead of conversations by
   name; each item has its own box; the conversation's timeline (slice 2 of 16 Oct) is the
   item's view; the companion's bubble shows the coordinator. The build thread's kind and the
   "Build: …" items go (they are work items).

## What stays the same

The engine, the hands, the skills, the agents, the permission card; `turn.ask`; the journal as
the record; the question card.

## Journeys

A new journey on a fresh world: `two_things_at_once`: "watch We Work Remotely for back-end
roles" (an item opens, a card), then, while it works, "how many eggs have I logged this week"
(answered here, no new item), then "make that watch check every day at 7" (continued into the
item, the card re-surfaced). The checks: one work item, two cards at most, the routing lines in
the journal, no second item for the follow-up. `question_card` and `track_then_log` stay green.

## Acceptance

Kenil types three unrelated things in Home within a minute and sees one card per piece of work,
his follow-up land in the right item, and nothing he did not ask for; one misroute he corrects
in words stays corrected.

## Size

Four to five days: the thread state and roster (1), the coordinator's pre-pack and routing (2,
3), the cards and lanes in the window (4, 7), the corrections (5), the journey. Proposed as two
commits: the core (1–3, 5, 6, the journey with the API's view) and the window (4, 7).

## One fix carried in, found in your journal

Columbo's second-opinion turn of 17 Oct, 21:20 UTC, failed with "No such tool available:
ask_person": it resumed your conversation's session, which had been made on the 72 old tool
names before the app restarted on the 17 hands. Every update that changes the hands would do
the same to every open conversation, in your app and in a shipped one. The fix, in this slice
since it is the conversation's session: a fingerprint of the served tools is kept with the
session; a turn resumes the session only when the fingerprint is the same, otherwise it
starts a fresh one and the pre-pack carries the conversation's recent lines, as it does today
for the first turn. A journal line says when that happened.

## Questions for Kenil

1. "Go ahead" typed in Home when exactly one approval is pending (§19's open question): accept
   it there, or keep the rule that an approval is given only at its card or in its item? I'd
   keep the rule for now; it is the audit, and the card is one click.
2. Card density: every work item as a card in Home, or only the ones that need you plus the
   ones you opened in the last day? I'd start with every item, since Done today folds them.
