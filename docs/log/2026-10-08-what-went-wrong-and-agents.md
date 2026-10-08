# What went wrong 4–8 October, and agents (8 October 2026)

Kenil: "soo many things have gone wrong. The schedules have failed; this should've worked, and if
not, should've fixed itself, and even if it couldn't, it shouldn't have silently failed. I asked
it to build a new module now, but it's not working. Let's discuss each before changing code." Read
from a backup copy of the live world, the core and host logs, the Mac's power log and Codex's own
session records. Nothing changed in the code for this entry.

## 1. The schedules

**When the four daily automations (07:00–08:00) actually ran:** 3 Oct in the morning as set;
4 Oct all four at 18:20, together; 5 and 6 Oct never; 7 Oct at 21:32; 8 Oct at 12:31. Each of
those is within a minute of the Mac's first full wake that day (`pmset -g log`: full wake 12:30:24
on 8 Oct, the runs at 12:31); on 5 and 6 Oct the Mac had 107 two-second maintenance wakes a day
and no full wake. That is the 3 Oct sleep rule doing what it says: nothing starts until the Mac
has been awake a minute, a missed run happens once on return. On a laptop that closes at night,
"daily at 07:00" is in truth "once a day, the first time the Mac is open after 07:00", and the
window says nothing of the kind.

**How each went when it ran.** The deal tracker (a pipeline, no model): 8 Oct read 15 of 15 sites,
13 new listings, zero seconds of model time; 7 Oct failed on two sites with network errors in the
moment of waking (Wi-Fi reconnecting), no retry, the day's run lost. The founding-engineer
listings (a pipeline): YC and Wellfound read both days; the two LinkedIn readers returned zero
rows on 7 and 8 Oct, were flagged broken, and the repair turn reported "blocked: Alpha tool calls
were cancelled" (61 s of model time for nothing). The LinkedIn connections run and the Sunday
nutrition summary, both procedures the model follows, ended with "cancelled before Alpha could
read" and "record reads were cancelled immediately". All four of those failures are §2.

**Why it felt silent.** Home said "4 didn't work; see Activity", the automation's line in
Intelligence held the failure, Activity listed it. Nothing reached him: no notice, no digest, and
the companion only bubbles what needs a yes.

**Why LinkedIn connections is a procedure.** It was set up on 1 Oct at 13:53; pipelines arrived
on 2 Oct; every automation made after that got steps; the two from 1 Oct kept their prose and
nobody converted them. Its procedure is a pipeline in words (run the reader into the table keyed
by profile URL, keep company, tags and notes, repair if broken, note what is new), so every day it
paid a model turn for nothing and depended on the model route. The nutrition one is judgement
(averages against targets, a sentence) and stays model work.

**Not broken:** the core ran five days without a restart; the only Python traceback in the log is
the removals crash from 2 Oct, fixed that day.

## 2. The new module

**Cause: the ChatGPT route of 3 Oct night.** Kenil signed in and pressed Use this at 22:41 that
night; since then every model run went through Codex. Codex refuses every call to Alpha's tools
before the tool server even starts, in about ten milliseconds, with "user cancelled MCP tool
call": its own record of the 8 Oct conversation shows seven of seven refused (a page read, three
plan proposals, two approvals, a thread list); trials today reproduce it one for one. It is
Codex's approval gate: with approvals set to never and a read-only sandbox it treats Alpha's tools
as needing the person's approval and auto-declines; with its approvals and sandbox bypassed
(`--dangerously-bypass-approvals-and-sandbox`) the call goes through and lists the tables.
Disabling the guardian feature or setting approvals to "untrusted" changes nothing.

**Then the model talked over it.** After "yes", gpt-5.5 said "Approved. The build will run in the
background" while both approval calls had been refused; no plan for the car-wash scorer exists.
The turn counted as a success because the model produced text: nothing in Alpha says "every tool
call failed, so the turn failed".

**Mine to own, twice.** The route shipped proven by tests only (his sign-in had lapsed) and said
so; but the switch had no guard: Use this should have run one real tool call through the new
route and refused when it failed. Kenil switched back to Claude on 8 Oct.

## 3. The decisions (Q33)

**Intelligence stays with the model; recurring standard work is code that Alpha manages, and the
model is used to fix it when it breaks.** That is the pipeline design of 2 Oct, reaffirmed, with
one rule added: an automation whose procedure only reads into tables is refused as a procedure
and must be steps; judgement work keeps the procedure form. The LinkedIn connections automation
is converted by asking Alpha (its own know-how, never patched by hand).

**Agents.** Kenil: "once a module has been built, the recurring things, integrations and
processes should be agents, with clear code, config, guidelines, success and failures, so they can
do things independently and consistently across runs." By the standard definitions (Anthropic's
workflows, where code sets the route, against agents, where the model directs its own process
toward a goal; OpenAI's model plus instructions plus tools with guardrails and approval gates),
Alpha today is one agent invoked per turn and everything recurring is a workflow. An agent in
Alpha is a long-lived thing that owns one recurring process of a module, with workflows as its
reliable tools and judgement only where it earns its keep: a goal in the person's words and a
scope; triggers (a schedule first, events later); tools (its own workflows, Alpha's reading tools
scoped to its module, acting only through actions with the person's yes); a guidelines page Alpha
writes in the build and the person edits; memory (brief, page, run history, facts); success and
failure declared and judged by code, a verdict stored per run; a failure policy in code (retry a
transient failure, repair its own workflow through the model, escalate with what it needs); and
reporting (a line per run, the digest, the companion when it failed or needs the person). The
loop: a trigger fires; the agent sees what changed; a workflow that covers it runs with no model
and code judges the result; the model steps in only on breakage, novelty, judgement or the
person's ask; then act, report, remember. Alpha stays the orchestrator the person talks to;
agents share the world and do not talk to each other in the first version. Decided: one agent
per process (today's five automations become five agents); schedule first, events next; nothing
outward without the yes, as before.

## 4. The order of work, proposed

1. Reliability, small and first: a turn whose tool calls all failed is a failed turn with the
   reason shown; switching routes runs a real tool call first; a run that fails on a network
   error at wake retries after a minute; the schedule's line says the truth ("07:00, or when your
   Mac next wakes; last ran 12:31"); failed runs reach the person through the companion; the
   read-only-is-steps rule; the LinkedIn conversion through Alpha.
2. The agents slice (Q33), schedule first: the table and its page, declared checks and verdicts,
   the runs table, the failure policy, the loop, the window, the build making agents, the five
   migrated. The digest (pending item 7) lands inside it.
3. The ChatGPT route stays off until it passes a real tool call: either Codex's own setting that
   pre-approves Alpha's tools without dropping the sandbox, or not at all.
4. Then people for real and the rest as before.
