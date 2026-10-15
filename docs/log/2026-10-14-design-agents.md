# Design sessions: dedicated agents (14 Oct 2026)

Kenil, after the clean-up: "lets start with the design sessions". The parked ones, from his
12 Oct answers to Vikas's list: C2 ("all decisions / checkpoints should be persisted"), C8
("having multiple persisted dedicated agents"), C1 (depth), T (a single unified view). C8 and C2
taken together; C1 and T later. No code changed.

## Session 1: framing (C8 with C2)

What Alpha has: eight kinds of background model work, none an agent the person can see, name or
talk to (the assistant, the interviewer, the builder, the repairer, the noticer, the checker,
the connector, the five process agents of Q33). Eight questions proposed. A prior-art survey ran
alongside (`design/research/dedicated-agents.md`, about 3,000 words): one voice where workers
share a conversation (86 against 56 for usability when people picked the agent, n=19); @ picks
who works inside the main conversation; Notion's Custom Agents as the nearest shipped shape;
parallel readers work and parallel writers fail; sprawl is the main failure; people decide on
plans, not single actions; "checkpoint" means run state or a restore point; research before
building pays only when scaled to the ask, and no shipped builder scans competitors first. The
recommendation changed with it: the person's process agents as the lasting units, Alpha's own
roles read-only.

## Session 2: the shape every agent shares

Kenil: "ok mostly makes sense, and I agree having certain predefined agents, however, for each
of them, we need to first discuss what exactly they are and how they work, what they do,
structure, etc. Also, i do want options for users to be able to create custom agents as well.
Also, i want default agents to have fun names (researcher can be sherlock for eg), and names
should be editable as well. Also, agents should have a clear description/summary for users so
they know what it is for and what it can do." On the survey's questions: @ for all; Mac
notifications "at some point"; the Noticer "good to be an agent"; question 12 explained (the
person's decisions bind, Alpha's stay open, the reason kept). Then the shared shape and the
roster drafted; Kenil: "makes sense". Recorded as Q44: one voice; one shape (name, look,
description, kind, scope, what it may touch, triggers, memory, conversation); built-in agents
renamed and paused but never deleted, custom ones made by asking or from a form; the five
process agents become custom agents of their modules; the roster Sherlock (researcher), Watson
(noticer), Columbo (checker), Scout (recommender), Doc (healer), each designed before it is
built; decisions at the plan and choice level.

## Session 3: Sherlock, the researcher (15 Oct)

Drafted on the shared shape, building on what the interview already does (a few look-ups for
sources and suggestions on the page) and on the research pass's two failures (a menu "not useful
/ intuitive", fourteen minutes said as "a few"). Kenil: "1. i want you to tell me what would be
best, also should this be fixed, or should we let the agent/ai decide no how to best do
research, 2. we need to think about this as well, because in some cases, a research may not be
warranted/asked for … 3. how long can be very subjective/dependent, we should probably just say
more thinking/deeper research means more time 4. yes 5. it can use (for read) when needed
6. maybe have custom nice faces for these 7. yeah looks ok for now". Answered: a fixed frame
(what it brings back checked by code, five lenses, its walls, its memory first) with a free
method; when research is warranted decided per ask by rule and a small judgement, visible with
Skip or "Look into it"; no time promises. Kenil: "starts by itself with skip, faces sound good".
Recorded as Q45, with the five faces (an animal and one accessory each, in the companion's
style).

## Session 4: Watson, the noticer (15 Oct)

Measured first: 36 facts kept about Kenil, 34 accepted, about a third not about him (workflow
settings, requests). Drafted Watson around filing each note by type (a fact about the person,
about someone, a commitment, a decision a conversation reached, or nothing but the journal),
reading what Alpha reads about people he knows, recording conversations' decisions and
conclusions (C2), inferences kept quietly. Kenil: "1 yes, 2 yes, 3a, 4 yes, 5 ok, 6 yes".
Recorded as Q46.

## Session 5: Columbo, the checker (15 Oct)

Measured first: 18 checks since 2 Oct (13 agreed, 2 differed), only after turns that wrote
worked-out values. Drafted Columbo to check five things (values written, answers relied on,
parts' values, Sherlock's sources, numbers going out) two ways (outside, the person's world),
never fixing (the owner corrects; the person settles disagreeing sources), with a mark on what
was checked. Kenil: "1 yes, 2 yes, 3 yes, 4 yes, 5 ok". Recorded as Q47.

## Session 6: Scout, the recommender (15 Oct)

Grounded in §5's unbuilt entries 3 and 4, the speaking-up ladder and its evidence. Drafted Scout:
five kinds of suggestion, the ladder with code's checks (evidence, one action, no repeats of a
no), picks on Home daily and cards at natural breaks, tied to goals. Kenil: "1 yes, 2 yes, 3 make
it a bit bolder to start with, so we can see how well it can do this, 4 yes, 5 ok". Recorded as
Q48.

## Session 7: Doc, the healer (15 Oct)

Read first: repair lives in three places (a reader rewritten at most twice a run with no memory
across runs, a procedure repaired and proposed again, workflow parts never repaired) and a
repaired reader's old script is overwritten. Drafted Doc as the one fixer of Alpha's know-how,
called by the agent whose run broke: whose fault first (passing, the person's, Alpha's
know-how, Alpha itself), parts' code fixed in the workspace, a rerun judged by code, one repair
of a thing at a time, no check-ups, every fix undoable. Kenil: "1. yes, 2. yes, 3. ok, 4. ok,
5. ok, 6. yes, 7. ok". Recorded as Q49. The five built-in agents are now all designed; none is
built.

## Left

C1 (depth) and T (a single unified view of Alpha), each in a session of its own.
