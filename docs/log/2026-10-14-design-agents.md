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

## Left

Each default agent's own session, Sherlock first; then C1 and T.
