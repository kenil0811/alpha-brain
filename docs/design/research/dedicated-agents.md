# Dedicated agents, one voice or many, decisions and checkpoints: prior art (14 October 2026)

Why: Kenil wants "multiple persisted dedicated agents throughout Alpha" (a research agent before
a new module, healing agents that maintain modules, proactive agents that connect the person's
world), agents addressed with @, and "all decisions / checkpoints persisted". Today an agent is
one recurring process of a module (Q33). It has a schedule, a pipeline, a goal, a page and a
verdict per run, and agents do not talk to each other. This builds on `research-before-build.md`
(9 Oct) without repeating it.

Marks: **V** the page or paper was read; **S** a search excerpt or secondary source only;
**R** recalled, not checked.

## What this means for Alpha

1. **Keep one voice.** Where workers run inside one conversation, only the main agent talks to
   the person. Claude Code takes the question tool away from subagents, Factory's subagents
   "cannot ask the user questions", and OpenAI's manager pattern is for when one agent should
   "have access to the user". The clearest comparison found scored a single voice 86 for
   usability against 56 when people picked the agent themselves (n=19; §2). Agents can still be
   named, owned and addressable. They reach the person through the companion: a card, a digest
   line or a question.
2. **@ picks who does the work inside the companion's conversation.** It does not open a new
   chat. That is how Copilot, Gemini Enterprise, ChatGPT plugins and Claude Code use it; Notion
   also gives each agent a chat tab of its own (§1). The reply should say which agent did the
   work.
3. **Readers in parallel, one writer per thing.** Research, noticing and review only read, so
   they can fan out. Changes to the world stay single-threaded: multi-agent setups work "when
   writes stay single-threaded" (Cognition, Apr 2026; §2). Healing is done by the agent that owns
   the module, one repair at a time.
4. **A persisted agent is a small, known shape.** It has a name and an instructions page, scope
   granted explicitly, memory of its own, triggers, and a log of runs with verdicts. Q33 has most
   of this. The gaps are event triggers, memory per agent and escalation as a question. Notion's
   Custom Agents are the closest shipped analogue (§1).
5. **Record decisions where people decide: on plans, not on single actions.** Claude Code users
   reject 39% of plans but only 3% of permission prompts. A planted dangerous command was caught
   13.6% of the time, and about 5% after 50 prompts (§3). A decision record says who decided
   (the person, Alpha or which agent), what, why, what else was considered, the evidence, and
   what it replaces. An accepted decision binds the agents; they may propose changing it but not
   quietly override it.
6. **"Checkpoint" means two things.** One is resumable run state, so a failed run continues
   instead of restarting (Temporal, LangGraph). The other is a restore point for the person;
   Alpha already has record versions and Undo. Each restore must say what it covers: Claude
   Code's rewind skips Bash edits, and nothing un-sends an email (§3).
7. **Research before building pays only when it is scaled to the ask.** Spec tools were "a
   sledgehammer to crack a nut" for small changes, and in May 2026 Kiro added a mode with no
   gates between phases. No shipped builder was found that scans competitors or open-source alternatives
   first. That is open ground, so measure it on Alpha's own builds (§4).
8. **Too many agents is the main failure.** OpenAI is retiring custom GPTs into plugins that run
   inside one ChatGPT, 94% of surveyed IT leaders fear agent sprawl, and Zapier documents runaway
   agent-and-automation loops. The number of agents should follow the person's processes (Q33),
   not Alpha's features.

## 1. How products model persistent, dedicated agents

- **Claude Code subagents** (V, [docs](https://code.claude.com/docs/en/sub-agents)). Each agent
  is a Markdown file:
  - `name`, a `description` ("when Claude should delegate"), and a body that is its whole system
    prompt;
  - a tool allowlist or denylist, a permission mode, a model, and optional memory per agent (a
    `MEMORY.md`, of which the first 200 lines or 25KB load at start);
  - "a fresh, isolated context window", and only its final result returns.

  It is called by automatic matching on the description, by name, or with `@"name (agent)"`,
  which guarantees that agent runs. Subagents cannot ask the person questions. The docs say to
  use the main conversation "when the task needs frequent back-and-forth". **Agent teams** (V,
  [docs](https://code.claude.com/docs/en/agent-teams); experimental) add a lead, teammates, a
  shared task list and a mailbox. Their listed limits are that the lead "starts implementing
  tasks itself", task status lags, the lead stops early, edits to one file collide, and there is
  no resume. Agents' messages are never taken as the person's consent.
- **Factory** (V, [custom droids](https://docs.factory.com/cli/configuration/custom-droids)):
  the same shape. Delegation goes through a `Task` tool, and subagents "cannot ask the user
  questions or spawn their own". The current docs no longer list the earlier product droids
  (Code, Knowledge, Reliability; S); whether they were consolidated is not verified.
- **OpenAI Agents SDK** (V, [handoffs](https://openai.github.io/openai-agents-python/handoffs/),
  [orchestration](https://openai.github.io/openai-agents-python/multi_agent/)). A handoff is a
  tool (`transfer_to_refund_agent`) that passes the conversation to a specialist. "Agents as
  tools" keep the manager in charge. The guide says to "maximize a single agent's capabilities
  first" and to split only on tangled logic or overlapping tools (V,
  [practical guide, 2025](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)).
- **Notion** (V, [Custom Agents](https://www.notion.com/help/custom-agents),
  [3.0](https://www.notion.com/releases/2025-09-18)). There is one personal agent with an
  instructions page that "remembers over time". Custom Agents run separately "in the background
  based on triggers and schedules":
  - triggers are schedules, Notion events (a comment, a page added, a property changed) and Slack
    messages;
  - each has a name, instructions and a model, and access is granted explicitly in "Tools and
    access" (linking a page grants nothing);
  - an Activity tab logs each run's trigger, actions and errors, and version history restores
    the configuration;
  - people reach it with @ in pages, comments or Slack;
  - there is no approval step; control is scope plus reversibility, and each sub-agent hand-off
    costs credits.
- **Microsoft 365 Copilot** (V, [agents overview](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agents-overview),
  30 Sep 2026). Declarative agents are instructions, knowledge and actions on Copilot's own
  orchestrator, reached "via @mentions"; proactive agents need a custom engine. **Autopilot**
  (25 Sep 2026, preview; S, [coverage](https://pasqualepillitteri.it/en/news/18368/microsoft-launches-autopilot-copilot-agent))
  is a named agent with a role and a goal, its own identity, memory and mailbox, mentioned in
  Teams and Outlook. **Agent 365** (S, [coverage](https://venturebeat.com/ai/microsofts-agent-365-shifts-ai-agents-from-sandbox-tools-to-enterprise-grade))
  is a registry: every agent has an owner, an ID, permissions, telemetry, review and
  deactivation.
- **OpenAI** (V, [PCWorld, 18 Sep 2026](https://pcworld.com/article/3238025/custom-gpts-in-chatgpt-are-going-away-heres-how-to-save-yours.html)).
  Custom GPTs are being retired; in Enterprise, creation stops 25 Sep and existing GPTs stop on
  11 Dec 2026. Their replacement, plugins, are picked "with an @ mention" or chosen automatically
  inside the main ChatGPT (S, [help](https://help.openai.com/en/articles/20001519), which
  returned 403). **Dots** (V, [TechCrunch, 29 Sep 2026](https://techcrunch.com/2026/09/29/openai-launches-dots-its-bubbly-agentic-avatar/))
  start with one "primary dot" that pursues the person's goals; "teams of Dots" are a stated
  future. Custom rules say what a Dot may do alone (S).
- **Lindy** (V, [Feb 2026](https://wf.lindy.ai/blog/lindy-assistant-launch)) launched one
  assistant with context from "every prior conversation", which "flags only what needs you".
  Third parties say Lindy now leads with it and the builder remains (S). **Zapier Agents** (V,
  [help](https://help.zapier.com/hc/en-us/articles/45697420326285-Zapier-Agents-unexpected-activity-usage))
  keep an Activity tab per run and advise "a few closely related actions" per agent. They also
  document loops in which an agent triggers an automation that changes the data the agent
  watches.
- **Others** (S): CrewAI agents are a role, goal and backstory for pipelines
  ([docs](https://docs.crewai.com/en/concepts/agents)). Relevance AI sets approval per action
  (auto, approve, "let agent decide";
  [docs](https://relevanceai.com/docs/build/workforces/workforce-features/approvals-and-escalations)).
  Manus Projects share one instruction and a knowledge base
  ([docs](https://manus.im/docs/features/projects)). Gemini Enterprise uses `@agent_name`
  ([docs](https://docs.cloud.google.com/gemini/enterprise/docs/agent-gallery)). In Letta, hidden
  background subagents update one agent's memory "without interrupting your active work" (V,
  [docs](https://docs.letta.com/guides/agents/architectures/sleeptime)).

**What recurs:**
- identity is a name plus a description a router matches;
- instructions are an editable page;
- scope is granted, never implied;
- memory is a page per agent, or shared memory a hidden worker keeps up;
- triggers come as schedules, then events, then chat;
- visibility is a log per run plus history of the configuration;
- @ routes inside one host.

**Complaints:** writers working in parallel conflict (§2); leads that do the work themselves or
stop early; runaway loops; every hand-off costs; and enterprises cannot count their agents.

## 2. One voice vs many voices

**For one voice**
- *One Agent Too Many* (V, [arXiv 2401.07123](https://arxiv.org/abs/2401.07123)) compared one
  voice that routed to several assistants with people choosing the assistant. Usability scored
  86 against 56, accuracy 71% against 57%, all p<.01 (n=19). People didn't know what each
  assistant could do, and the routing was "unbeknownst to the user".
- Chaves & Gerosa (CHI 2018; S, [abstract](https://dl.acm.org/doi/10.1145/3173574.3173765))
  put several chatbots in one conversation. The structure was the same, but people were more
  confused.
- Practitioners agree. Anthropic: "the simplest solution possible", with planning steps shown
  (V, [Dec 2024](https://www.anthropic.com/engineering/building-effective-agents)). OpenAI: the
  manager pattern gives "a unified user experience". Alexa+ routes each request to "the best
  model for the task" behind one Alexa (V,
  [Amazon](https://www.aboutamazon.com/news/devices/new-alexa-tech-generative-artificial-intelligence)).

**For many voices**
- *Different but Equal* (V abstract, [arXiv 1808.08157](https://arxiv.org/abs/1808.08157)) set
  four expert chatbots against one assistant. Goals were met about equally, and the team's
  users predicted its behaviour better.
- A CHI 2026 study (S, [abstract](https://dl.acm.org/doi/10.1145/3772318.3791157)) found that
  showing many agents' process helps on complex tasks and costs trust on simple ones: a
  "Goldilocks" level.

**Why many-agent systems fail**
- MAST (S, [arXiv 2503.13657](https://arxiv.org/abs/2503.13657)) found 14 failure modes across
  seven frameworks. Most are design and agents misaligning with each other (withholding
  information, ignoring another agent's input). Gains over a single agent are "often minimal".
- Cognition (V, [22 Apr 2026](https://cognition.com/blog/multi-agents-working)) still finds that
  parallel writers fail. What works: read-only subagents, a reviewer with a clean context
  (2 bugs per PR on average), escalation to a stronger model, and managers with child agents,
  which "needed significant work". Unstructured agent networks are "mostly a distraction".
- Anthropic's research agents beat a single agent by 90.2% on breadth-first research. They are a
  poor fit when agents "share the same context", and they cost about 15x a chat (V,
  [Jun 2025](https://www.anthropic.com/engineering/multi-agent-research-system)). LangChain:
  reading parallelises, writing does not (V,
  [Jun 2025](https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems)).

**What products did.** Some consolidated into one host: GPTs became plugins inside ChatGPT,
Lindy's front door is one assistant (its reasons are not verified), and Notion keeps its
personal agent apart from the background agents. Others split into a few named workers with
owners: Copilot Autopilot, Dots (one primary first) and Notion Custom Agents. Enterprises show
what splitting costs. 94% of about 1,900 IT leaders fear sprawl and 12% manage agents centrally
(S, [OutSystems](https://sdtimes.com/ai/agentic-ai-goes-mainstream-in-the-enterprise-but-94-raise-concern-about-sprawl-outsystems-research-finds/)).
Gartner expects more than 40% of agentic projects to be cancelled by 2027 (S). **No study was
found that compares one companion against several persistent named agents for a non-technical
person over weeks.**

## 3. Decision logs and checkpoints

**Resumable state** (for the system)
- LangGraph checkpoints the state at every step of every thread. That gives pauses for a
  person, "time travel" (replay, or fork with changed state) and fault tolerance; a separate
  store holds memory across threads (V/S, [docs](https://docs.langchain.com/oss/python/langgraph/persistence)).
  Steps run again on resume, so side effects must be safe to repeat (S).
- Temporal records every step's inputs and results, so a run "picks up where it left off" after
  a crash. Its OpenAI SDK integration became generally available in March 2026 (V,
  [Temporal](https://temporal.io/blog/announcing-openai-agents-sdk-integration)).
- Anthropic's long-running harness keeps a progress file, a JSON list of features with pass or
  fail, and git commits. A feature passes only after an end-to-end test, and JSON is used because
  models "inappropriately change" it less than Markdown (V,
  [Nov 2025](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)).

**Restore points and audit** (for the person and admins)
- Claude Code checkpoints each prompt that starts a turn (the last 100 are kept) and restores
  code, conversation or both. It skips Bash edits, most subagent edits and outside changes, and
  is "not a replacement for version control" (V, [docs](https://code.claude.com/docs/en/checkpointing)).
- Devin keeps machine snapshots and proposes Knowledge from its sessions (S,
  [2024](https://cognition.com/blog/sept-24-product-update)). Notion and Zapier log each run
  and keep each agent's configuration history (V). Salesforce traces every turn and reasoning
  step for admins (S, [docs](https://developer.salesforce.com/docs/ai/agentforce/guide/otel-api.md)).
  *Visibility into AI Agents* proposes identifiers, live monitoring and activity logs (S,
  [arXiv 2401.13138](https://arxiv.org/abs/2401.13138)).

**Decision records**
- Spec Kit records each research finding as Decision / Rationale / Alternatives considered (V,
  [template](https://github.com/github/spec-kit/blob/main/templates/commands/plan.md)).
- Davidson (V, [1 Sep 2026](https://duncandavidson.com/agents-love-decisions)) treats accepted
  decision records as "binding". Proposed ones are context and superseded ones are history; on a
  conflict the agent stops and proposes. His warnings:
  - agents hold on to obsolete decisions;
  - they "preserve their deliberation", so small clarifications swell into rules;
  - stored memory is not an accepted decision.

  His evidence is anecdotal.

**What granularity helps a person**
- People judge plans and rubber-stamp actions. Plans are rejected 39% of the time and permission
  prompts 3%. Among 1,053 testers, a planted dangerous command was caught 13.6% of the time
  (about 17% early in a session, about 5% after 50 prompts); a classifier caught 89% (V,
  [Anthropic, Aug 2026](https://claude.com/blog/auto-mode-default-in-claude-code)). Anthropic
  calls it "approval fatigue" (V, [Mar 2026](https://www.anthropic.com/engineering/claude-code-auto-mode)).
- Experienced users auto-approve more (from 20% to over 40% of sessions) and interrupt more
  (from 5% to 9% of turns). Oversight becomes "being in a position to intervene when it matters"
  (V, [Feb 2026](https://www.anthropic.com/research/measuring-agent-autonomy)).
- Magentic-UI's users valued planning together with the agent. They wanted gates only on
  payments, emails and subscriptions, not on adding to a cart, and a third answer besides
  approve and reject (S, [arXiv 2507.22358](https://arxiv.org/abs/2507.22358)).

So the person should see decisions with their alternatives and reasons, a line and a verdict for
each run, and exceptions as questions. Every step stays in the journal, for repair and replay,
shown only on demand.

## 4. Research-before-build agents

**What builders do**
- Kiro (V, [12 May 2026](https://kiro.dev/blog/faster-smarter-specs/)) now asks its questions
  first and writes requirements, design and tasks in one pass, because approving each phase "can
  feel like more process than the problem requires".
- Lovable's Plan mode (V, [docs](https://docs.lovable.dev/features/plan-mode)) researches the
  project with subagents, writes "Key decisions, assumptions, and constraints", and keeps
  approved plans as dated files. It "can still end without a plan" when a change "is not worth
  making".
- Bolt searches the web when needed and lists its sources (V,
  [docs](https://support.bolt.new/best-practices/plan-mode)). Spec Kit turns each unknown into a
  research task (V). Devin drafts an editable plan first (S,
  [docs](https://docs.devin.ai/work-with-devin/interactive-planning)). Replit can start with a
  clickable prototype (S, [docs](https://docs.replit.com/learn/plan-vs-build-mode)).
- Claude Code: "Explore first, then plan, then code", but "If you could describe the diff in one
  sentence, skip the plan" (V, [docs](https://code.claude.com/docs/en/best-practices)).

**No shipped builder was found that looks at competitors, open-source alternatives or common
practice before proposing what to build** (searched again 14 Oct). Their "research" is of the
codebase, or a lookup for a technical question.

**Evidence it helps.** Parallel readers gained 90.2% on breadth-first research (V, §2).
Planning-and-analysing first and reusing existing repositories measurably helped
(`research-before-build.md` §1). People engage at the plan, rejecting 39% of plans (§3). The plan
is where research changes the outcome.

**What made it noisy.** Böckeler (V, [Oct 2025](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html))
found Kiro turned a small bug into 4 user stories with 16 acceptance criteria. Spec Kit's
Markdown was repetitive ("I'd rather review code than all these markdown files"), and agents
still ignored notes in the spec. Deep-research agents invent or dead-link 10.7% of URLs, and most
errors arise where the orchestrator merges results (`research-before-build.md` §3).

## Options for Alpha

**A. Built-in roles under one voice.** The companion is the only voice. Behind it work a few
fixed roles: a Researcher before a build, a Keeper that heals modules, a Noticer that connects
things. Each has a page in Intelligence (instructions, memory, runs) and can be @-named, but it
answers in the companion's thread, marked with its name.
- *For:* the usability result; subagents that cannot ask the person questions; the manager
  pattern; Letta's hidden workers. There is nothing new to manage.
- *Against:* "the thing watching my deals" blurs into Alpha unless every card says who made it,
  and the roles are Alpha's categories, not the person's.

**B. One agent per module process (extend Q33).** Each recurring process is an agent with a goal,
a page, scoped tables and tools, memory, triggers and a verdict per run. It heals its own module
(at most two repairs a run, as now) and is @-mentioned in the companion. Agents read each other's
results through the world, never message each other, and each table has one writer.
- *For:* Notion Custom Agents, Copilot's named agents, Zapier's narrow scope and single-writer
  safety; the count follows real processes.
- *Against:* the count grows with modules (the sprawl risk), so the Agents page and the digest
  must stay short, and noticing across modules has no owner.

**C. Agents the person makes.** The person describes a standing job ("watch these three
competitors weekly") and gets an agent through the workflow page's yes (§12). It can be paused
and removed; removal deletes everything except the journal.
- *For:* the most flexible; matches Gems, GPTs and Notion.
- *Against:* the evidence is against it for a non-technical person. GPTs are being folded into
  one host, stores filled with low-effort agents, and people don't know what each one can do. It
  also reopens how a new automation gets made (Q40).

**Where the evidence points, for Kenil to decide:**
- one voice;
- B's agents as the lasting, addressable units;
- research and noticing as A's read-only roles, which write only proposals and decision records;
- C later, in B's shape;
- decisions stored at the plan and choice level, with alternatives and what each supersedes; the
  steps stay in the journal.

**Questions to settle:**
- Does @ address only agents, or modules and people too?
- Does an agent ever speak outside the companion?
- Is the Noticer an agent of its own, or a step at the end of every run?
- Which decisions are the person's (binding) and which are Alpha's (open to revision)?

## Not verified

- OpenAI's help page text (403).
- Lindy's reasons for moving to one assistant.
- Whether Factory consolidated its droids.
- Microsoft's own wording on Autopilot.
- The CHI 2018 and CHI 2026 papers beyond their abstracts.
- Magentic-UI's benchmark figures.
- The original 2025 Cognition post, read only through its 2026 follow-up.
- Gartner's press release.

No comparative long-term study was found of one assistant against several named agents.
