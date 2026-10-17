# 17 October 2026 — harness slice 1, the five spikes (answers before `engine.py`)

The slice 1 proposal (`../design/harness-slice-1-proposal.md`) rested on five things the SDK
research could not verify. Each was a short script (`spikes/2026-10-17-slice1/`) against
`claude-agent-sdk` 0.2.168 (it bundles Claude Code 2.1.301; the Homebrew `claude` here is
2.1.278), run on Kenil's Mac on his subscription with no API key, on Haiku. All five ran for
real; the answers below are what came back, not the docs.

## 1. The subscription, no key, a bare environment — yes

Run as `env -i HOME USER PATH=/usr/bin:/bin:/usr/sbin:/sbin`, no `ANTHROPIC_API_KEY`, no
`CLAUDE_CONFIG_DIR`: the init message says `apiKeySource: "none"` (the `/login` credentials),
the model answered, `Result[success] … cost=0.006 session=166bf14d…`. The `USER` and
default-config-home conditions of `claude_cli.py` hold for the SDK as for the CLI.

Two things seen in the same init that slice 1 must take into account:
- `setting_sources=[]` still lists the person's own plugins' slash commands (`deep-research`,
  `design`, `code-review`, …) as skills the `Skill` tool could invoke. Today's turns keep `Skill`
  out of `allowed_tools`, so the model cannot reach them; a build that allows `Skill` would.
  Where the switch for plugins is, is open (the `plugins` option only adds).
- The SDK session's own tool list includes `CronCreate`, `CronList`, `ListAgents`,
  `SendMessage`, `Monitor`, `Workflow`, `RemoteTrigger`, `PushNotification`, `DesignSync`,
  `ScheduleWakeup`: the research's "could not verify whether these reach SDK sessions" is
  answered, they do; `allowed_tools` keeps them out, as it does today.

## 2. Two sessions at once in one Python process — yes

Two `ClaudeSDKClient`s under `asyncio.gather`, each with the same in-process MCP server
(`create_sdk_mcp_server`) and one tool: both answered, distinct session ids, the shared tool
called once by each (`BRAVO` then `ALPHA`, 0.6 s apart), 4.4 s wall against 5.1 s of summed
model time. One process per core, as today's design assumes, holds.

## 3. A skill written mid-session — usable after the watcher fires, about 3 s later

`cwd` a scratch directory with an empty `.claude/skills/`, `setting_sources=["project"]`,
`skills="all"`. The model wrote `.claude/skills/zebra-greeting/SKILL.md` with `Write`. A `Skill`
call 2 s later: `Unknown skill: zebra-greeting`. Then `System[commands_changed]` arrived (3 s
after the write). A third query 4 s after that: `Launching skill: zebra-greeting` and the answer
was the marker (`ZEBRA-7731`). So: picked up within the session, asynchronously, and the engine
has the event to wait for. Slice 2's `skill_keep` returns only after `commands_changed` (or
says the skill is ready on the next turn), never tells the model the skill exists before.

Found on the way, both binding for slice 1:
- **`.claude/` is protected from auto-accepted writes.** With `allowed_tools=["Write", …]` under
  `dontAsk` the write was refused ("running in don't ask mode"); under `acceptEdits` it was
  refused too ("Claude requested permissions to write to …/.claude/skills/…"). It went through
  only under `permission_mode="default"` with a `can_use_tool` callback that allowed it. Skills
  under `.claude/skills` therefore need the callback path; today's build turns (which write
  elsewhere in the workspace) are not affected until slice 2 moves skills there.
- **Without `strict_mcp_config=True`, the person's own claude.ai connectors join the session.**
  On the second turn of spikes 3–5 the tool list grew `mcp__claude_ai_Canva__*` tools from
  Kenil's account. With `strict_mcp_config=True` (what `claude_cli.py` already passes as
  `--strict-mcp-config`) the list stays Alpha's: `claude_ai tools in session: []`.
- The SDK warns (`CanUseToolShadowedWarning`) that any whole tool in `allowed_tools` is
  auto-approved before `can_use_tool`; the callback is reached only for tools left out of it.

## 4. The event stream — carries what the window shows today, and the hooks carry the journal

With `include_partial_messages=True`: `System[init]` (model, permission mode, session id, the
tools), `System[status]`, `StreamEvent`s (`message_start`, `content_block_start` with the block
type, `content_block_delta` with `text_delta`, `content_block_stop`, `message_delta`,
`message_stop`), `AssistantMessage` with `TextBlock` / `ThinkingBlock` / `ToolUseBlock`,
`UserMessage` with `ToolResultBlock`, `RateLimitEvent`, and `ResultMessage` with `num_turns`,
`duration_ms`, `duration_api_ms`, `total_cost_usd`, `session_id`, `stop_reason`,
`terminal_reason`, `result`. Thinking also arrives as `System[thinking_tokens]`. Everything
`claude_cli.py` parses out of stream-json is there as typed messages. First text delta 5.6 s
after the question on Haiku with one tool call in between.

Hooks: `PreToolUse` fired with `tool_name`, `tool_input`, `tool_use_id`, `session_id`, `cwd`,
`permission_mode`, `mcp_server`, `transcript_path`; `PostToolUse` with the same plus
`tool_response` and `duration_ms`. That is the journal line for every call, in code, as the
design's §3 wants; `matcher=None` matches every tool.

## 5. The permission callback — reached, allow and deny both work, no workaround needed

`permission_mode="default"`, `allowed_tools=[]`, an in-process `secret_send` tool,
`can_use_tool` recording and deciding: the first call was asked and allowed (`sent to vikas`);
the second asked and denied with "The person said no: nothing leaves without their yes.", and
the model's tool result carried exactly that sentence (`err=True`), its reply saying it was not
sent. The "dummy PreToolUse hook plus async prompt" workaround in the docs was not needed on
0.2.168 with `ClaudeSDKClient`: the SDK configures the callback itself.

## What this changes in the slice 1 proposal

- `strict_mcp_config=True` is mandatory (the connector leak).
- Turns stay `dontAsk` + `allowed_tools` (Alpha's tools, WebSearch, WebFetch; `Skill` out). The
  `can_use_tool` path (`default` mode, the sensitive tools out of `allowed_tools`) is built now
  but used from slice 2, when skills live under `.claude/skills` and outward actions move to it.
- The engine listens for `commands_changed` and exposes it (slice 2's `skill_keep` waits on it).
- Nothing else: one process per core, the stream mapping and the hook journal are as proposed.

## Numbers

Five spikes, nine runs in all, about $0.45 of Kenil's subscription usage by the SDK's own
`total_cost_usd`; the longest run 13 s. Nothing in the repo's code changed; `just stats` is as
at the last entry.
