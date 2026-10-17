# 17 October 2026 — the rethink: Alpha as a harness (a design session, nothing built)

## What happened

On the evening of 16 October, on the fresh world (`w_dde1695d1d46`), Kenil typed "@Sherlock help
my sync all my linkedin connection in here". This session read the world's journal (101 lines
from 20:04 to 20:48 UTC), the one model transcript that survived (the conversation's; the build
session's was not kept), the module's workspace (`WORKFLOW.md`, `workflow.json`, `parts.yaml`,
`PROGRESS.md`, its three commits) and the gate code, and traced it:

- 44 minutes, seven model sessions, 15.6 minutes of model time, about $2.18 (the journal's
  `cost_estimate` sum), four threads, 0 rows in `linkedin_connection`.
- Sherlock took the turn from the mention and its two questions became the interview; the
  workflow page was drafted with a literal `\n\n` and "Say the word and I'll build it." in its
  body; a second Sherlock look started on the draft and landed after the yes with a question its
  own first suggestion had answered.
- Build 1 (43 steps, 11 min) had a reader working on the real connections page at minute 2
  (20 of 20 rows clean), was refused `reader_save`, then spent eight minutes running `find /`
  and reading Alpha's own source in `~/Desktop/dev/alpha/alpha-brain` to find out why.
- The chat did not know the build had stopped ("Just say go ahead whenever you're ready");
  build 2 hit the same two refusals; the stop reason was cut at 600 characters
  (`runtime/workflow_build.py:215`); the module card counted the two settings rows as data.
- **Root cause:** `Tools._gate` (`mcp/tools/base.py:217`) opens only in a build thread that is
  not a workflow's walled session, and since Q40 (12 Oct) nothing opens one; so `reader_save`,
  `agent_create`, `table_create` and `module_create` are refused everywhere. A sync from words on
  an empty world has had no path for four days; Kenil's old world hid it (its LinkedIn agent
  predated Q40), and no journey makes a reader from words on a fresh world (`linkedin_sync`
  runs a reader copied from the world). The refusal text ("happens only in a build the person
  said yes to") is wrong inside the build the person said yes to.

Kenil: "everything went wrong … really poor for such a small request. We need to take a step
back and completely reanalyse how alpha should work." Then, on my four decisions: "no wait … if
we look at claude code / codex / other harnesses, they're able to pretty much do anything on
their own. That's what I want via alpha as well, just that it's wrapped in a simple interface,
with standardized UI, and auto creation of agents / skills / schedules / proactiveness. But the
underlying power of AI should not be curtailed."

## What was decided (Q54–Q73, in the new design's §19)

Seventeen questions put to Kenil, answered 17 Oct: the Agent SDK as the engine on his
subscription; one session per conversation; his home, module directories, browser profiles and
granted folders, the whole Mac a toggle; plan-first by gate goes (say in a line, ask only what
cannot be defaulted); always ask for outward actions, deleting his own entries, money, sign-ins;
unattended runs may make standing things; standing permissions as sentences; arbitrary files
allowed; a module is a project directory; skills made by the model whenever it will do the thing
again; the five built-ins stay, never in his conversation; ad hoc subagents; research as the
model's judgement; all triggers on day one; proactive output on Home and Activity; the walls
stay; a freeze on new features until five first-day sentences pass in the app; a new design
document; first users onboarded by Kenil building their modules and shipping the app.

## What was written

- `docs/design/alpha-harness-design.md` (571 lines): the proposal; Kenil agreed it the same day
  ("ok makes sense to me"). The old design
  marked superseded as a proposal, kept as history.
- Three research reports by subagents with web search, read on 17 Oct:
  `docs/design/research/harness-agent-sdk.md` (the SDK's sessions, subagents, hooks,
  permissions, skills, sandbox, MCP, no scheduler, the auth and terms pages, providers),
  `harness-parallel-work.md` (how Claude Code Projects, Dispatch, Codex, Devin, OpenClaw,
  Hermes, Letta and the research handle many threads for one person; the routing model),
  `harness-open-source.md` (harnesses, gateways, browser automation, memory, scheduling,
  sandboxing, connectors, UI renderers; eight to adopt, five to skip).

## Found on the way, worth knowing

- Anthropic's pages (17 Oct): the Agent SDK and `claude -p` "still draw from your subscription
  limits"; an end user may sign into the unmodified binary with their own subscription; a product
  may not offer claude.ai login or route through Pro/Max credentials for its users. Kenil's own
  use is sanctioned; a shipped copy needs Anthropic's written answer or the user's own API key.
- Non-Claude models: unsupported by Anthropic; technically reachable through endpoints that speak
  the Anthropic Messages format (Ollama, DeepSeek, Kimi, GLM), no gateway needed; GPT and Gemini
  only through translators that break tool use.
- Claude Code Projects already states the parallel-work shape Alpha needs: one coordinating
  conversation, a thread per task with its own context, outcomes reported back as cards.
- The Python SDK is 0.2.168; `claude` here is 2.1.278; the SDK is not yet in the project.

## Not done

Nothing built. The docs are committed after his yes; the slice 1 proposal follows. The stopped
build and its empty module are still in his world. The bugs of 16 Oct listed in the design's §0
and the memory note are not fixed; they go with the slices.
