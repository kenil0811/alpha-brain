# Harness, slice 4: triggers and the quieter agents

*A proposal, 18 October 2026, shown to Kenil in the chat (the file is the record). The fourth
slice of `alpha-harness-design.md` §18: its §9 (proactiveness) and §13 (the five built-in
agents, quieter), and the first-day sentences 4 and 5 of §17. In two parts, each committed and
looked at in the app on its own.*

## Part 4a: the triggers, and sentences 4 and 5

**What exists already** (nothing to build, only to say): time (the scheduler), a mention
(`@Name`), the app opened (Scout's daily look), a change in the world (the journal as the event
stream, a cursor per agent), a folder changed (the watcher), the Mac waking (the sleep rule of
3 Oct). Mail arriving is not a trigger of its own: a mail watch is an agent like any other, a
reader of the signed-in Gmail on a schedule, whose rows are the change in the world Watson
already sees. Nothing per use case.

**New, 1: a time that comes once.** A schedule may be a moment: `at 2026-10-24 17:00`. The
model turns "on Friday at 5" into it (the time is a value: stated, so no estimate). An agent with
an `at` runs once and its item is done. The reminder is the plainest agent there is: no steps,
no brief, a `tell` with the words. When its time comes, the run puts one card where cards go
(Home's Waiting on you, the companion):

> **Reminder: call Sara.**   *Done · Tomorrow, same time*

"Done" closes it; "Tomorrow, same time" makes the next `at` by code, 24 hours on. No Mac
notification yet (the design's "later"); the card and the companion's line are the reminder.

**New, 2: sentence 4 for real.** "what did Vikas email me about last week": a sign-in card
first when Gmail is not connected (the `connect` hand's card, as today), then the read through
the browser and an answer naming the emails. No new mechanism; the journey `gmail_last_week`
runs on your say (it reads your account) and is the acceptance, with sentence 5's
`reminder_fires` on a fresh world (the suite moves the reminder's time to now and ticks the
scheduler, since it cannot wait until Friday).

## Part 4b: the five built-in agents, quieter

None of them writes in your conversation. Each change is one mechanism:

- **Watson**: his suggested facts leave Needs you (Needs you holds only permission cards and
  questions, §10) and live on your Profile page as "suggested", confirmed there; under Alpha's
  reply a folded meta line, "Watson kept 1 fact · 1 decision", opens to what he kept.
- **Columbo**: his second opinion no longer posts a correction turn in your conversation; a
  difference becomes the mark on the value and a line on his page, and a card only when you
  must choose between two sources (as today).
- **Sherlock**: no triggers of his own (the drafted page no longer wakes him); he runs when you
  `@Sherlock` or when Alpha calls him for a big job; his findings land on the module's notes.
- **Scout**: quiet on an empty world: no picks until there is a day of your turns to pick from;
  his page is never a fact-carrying node.
- **Doc**: as he is (he edits skill files and commits).

**The five briefs rewritten** in the turn prompt's spirit: a short page each, what the agent is
for and what a good run is, no incident rules. Each is shown in the chat before it binds.

## What stays

The agents' substrate (Q50), the runs with verdicts, the agents' pages, `@Name`, Columbo's
marks, Doc's repairs, Scout's picks on Home.

## Size

4a two days; 4b two days. Two commits each (core, then window), as before.

## Questions

1. The reminder card's two buttons, "Done" and "Tomorrow, same time": enough for now?
2. Mac notifications stay "later" (the card and the companion are the reminder)?
3. Sherlock only on `@Sherlock` or Alpha's call, never on his own: yes?
