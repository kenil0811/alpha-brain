# The Claude Agent SDK as Alpha's engine (research, 17 October 2026)

*For the harness design (`../alpha-harness-design.md`, §3 and §12). Read from the SDK's own
pages at `code.claude.com/docs/en/agent-sdk/<page>.md`, the CLI pages they link to, the
authentication and legal pages, and the PyPI/npm registries, on 17 October 2026. Items marked
inferred or unverified are a reading, not documented behaviour.*

## Bottom line

- The SDK covers what the engine needs: sessions with resume and fork, programmatic and
  file-based subagents, hooks that can block, defer or rewrite, a permission callback,
  in-process MCP tools, a built-in sandbox.
- No scheduler a product can rely on: routines are cloud features tied to a claude.ai account;
  `/loop` and `CronCreate` run only inside an open CLI session. Alpha keeps its own scheduler.
- Auth and terms block "sign in with your Claude subscription" inside a distributed product.
  The documented route for a product is Console API keys or a cloud provider.
- Non-Claude models are not supported: Anthropic "doesn't support routing Claude Code to
  non-Claude models through any gateway".
- No "Fleet" feature in the docs. Parallelism is many sessions (one subprocess each), subagents
  (20 concurrent per session by default) and Workflows (TypeScript only).

## 1. Sessions

Supported and documented. Each `query()` starts a session unless one is resumed; the id comes
on `ResultMessage.session_id`. Python `ClaudeSDKClient` keeps one session across `client.query()`
calls. `resume=<id>` resumes a specific session; `continue_conversation=True` the most recent in
the cwd. `fork_session=True` with `resume` branches a conversation (not files). Transcripts are
local JSONL under `~/.claude/projects/<cwd>/` or `$CLAUDE_CONFIG_DIR/projects/`. Compaction is
automatic near the limit (`compact_boundary` message; `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`,
`CLAUDE_CODE_AUTO_COMPACT_WINDOW` 100k–1M; a `PreCompact` hook; `/compact` as a prompt; guidance
in CLAUDE.md). One session is one `claude` subprocess; no documented cap per process; sizing
floor 1 GiB RAM, 1 CPU per agent. A single-shot `query()` raises after an error result: wrap it.
*Unverified:* several `ClaudeSDKClient` instances concurrently in one Python process.

Sources: sessions.md, hosting.md, agent-loop.md, env-vars.md, python.md.

## 2. Subagents

Programmatic (`agents={"name": AgentDefinition(description, prompt, tools, disallowedTools,
model, skills, mcpServers, maxTurns, background, effort, permissionMode, memory)}`; the parent
needs `Agent` in its tools) and file-based (`.claude/agents/*.md`, `~/.claude/agents/*.md`;
programmatic wins on a name clash; existing directories watched live). Background by default
when the call omits `run_in_background`. `tools` is an allowlist; `disallowedTools` takes
`mcp__server__*`. Model: `fable`, `opus`, `sonnet`, `haiku`, `inherit` or a full id. A subagent
can be resumed by `agentId` + parent `session_id`. Limits: spawn depth 3, 20 concurrent (env
vars). Subagents cannot use `AskUserQuestion` and do not see the parent's history.

Sources: subagents.md, agent-loop.md, env-vars.md.

## 3. Hooks

Python events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `Stop`,
`SubagentStart`, `SubagentStop`, `PreCompact`, `Notification`, `PermissionRequest`. TypeScript
adds `SessionStart`, `SessionEnd`, `PostCompact`, `FileChanged`, `DirectoryAdded` and others.
Registered as `hooks={"PreToolUse": [HookMatcher(matcher="Write|Edit", hooks=[cb])]}`; the
callback is `async def cb(input_data, tool_use_id, context) -> dict`. A hook can **deny** (with
a reason), **defer** (ends the turn with `stop_reason: "tool_deferred"`; resumed later from the
persisted session), **ask**, **rewrite the input** (`updatedInput`) and **rewrite the output**
(`updatedToolOutput` in `PostToolUse`). Precedence deny > defer > ask > allow. Matchers match the
tool name only. Default timeout 600 s (30 s for `UserPromptSubmit`); a timed-out `PreToolUse`
blocks the call. Hooks run inside subagents too, with `agent_id` on the input.

Sources: hooks.md, python.md, agent-loop.md.

## 4. Permissions

Modes `default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`, `auto`; changeable
mid-session. Order: hooks → deny rules → ask rules → mode → allow rules → `canUseTool`.
`can_use_tool(tool_name, input_data, context)` returns `PermissionResultAllow(updated_input=…)`
or `PermissionResultDeny(message=…)`; it is never called for tools in `allowed_tools` (so keep
the sensitive tools out of that list), and it may stay pending indefinitely. For an approval
that must outlive the process: a `PreToolUse` hook returning `defer`. Python needs a dummy
`PreToolUse` hook plus an async-iterable prompt to keep the stream open for `can_use_tool`
(documented as a "required workaround"; may be stale).

Sources: permissions.md, user-input.md, hooks.md.

## 5. Skills

Loaded from the filesystem only: `~/.claude/skills`, `<cwd>/.claude/skills` up to the repo
root, `.claude/skills` in any `add_dirs` directory, plugins. `setting_sources` controls which
settings load; `skills="all" | [names] | []`. The CLI skills page says skill directories are
watched and add/edit/remove are picked up within a session (a new top-level directory needs
`/reload-skills`); the SDK pages do not restate it. *Verify with a spike* that a skill the model
writes mid-session is usable in that session.

Sources: agent-sdk/skills.md, claude-code-features.md, python.md, skills.md (CLI).

## 6. Working directory and sandbox

`cwd`; `add_dirs` (grants file access and loads that directory's skills, commands, agents).
`sandbox=SandboxSettings(enabled, autoAllowBashIfSandboxed, excludedCommands,
allowUnsandboxedCommands, network={allowedDomains, deniedDomains}, filesystem={allowWrite,
denyWrite, denyRead, allowRead}, failIfUnavailable, ignoreViolations)`. Built on the open-source
`@anthropic-ai/sandbox-runtime` (Seatbelt on macOS; bubblewrap + socat on Linux). Covers Bash,
PowerShell and Monitor only; Read, Edit, Write, WebFetch, MCP and hooks run outside it under the
permission rules. The network allowlist starts empty; the proxy does not terminate TLS. **Python
fails open** when the sandbox cannot start: set `failIfUnavailable=True`.

Sources: python.md, sandboxing.md, claude-code-features.md, github.com/anthropics/sandbox-runtime.

## 7. MCP

In-process: `@tool(name, description, schema)` + `create_sdk_mcp_server(name, version,
tools=[…])`, passed as `mcp_servers={"alpha": server}`; the handler returns `{"content": […]}`
(Python forwards only `content` and `is_error`; no `structuredContent`). External: stdio, SSE,
HTTP. Names `mcp__<server>__<tool>`; `allowed_tools` takes `mcp__<server>__*`. Tool search is on
by default and defers MCP schemas (`alwaysLoad: true` opts out). No OAuth flow in the SDK.

Sources: mcp.md, custom-tools.md, python.md.

## 8. Scheduling

Nothing the product can rely on. `/loop`, `CronCreate` are session-scoped and interactive (50
per session, recurring ones expire after 7 days, `CLAUDE_CODE_DISABLE_CRON=1`), not in the SDK's
built-in tools list. Routines are Anthropic cloud, tied to a claude.ai account, a research
preview; `/fire` is not part of the platform API. Desktop scheduled tasks are the desktop app's.
**Alpha keeps its own scheduler** and starts a session on schedule.

Sources: scheduled-tasks.md, routines.md, agent-loop.md.

## 9. Authentication and billing

- CLI precedence (authentication.md): cloud-provider env vars → `ANTHROPIC_AUTH_TOKEN` →
  `ANTHROPIC_API_KEY` → `apiKeyHelper` → `CLAUDE_CODE_OAUTH_TOKEN` → profiles → `/login`
  subscription credentials. *Inferred:* an SDK process on a Mac logged into a Pro/Max account
  uses that login when no key is set (the SDK docs do not say so). `claude setup-token` issues a
  one-year OAuth token on a subscription, for model requests only.
- Agent SDK overview: "Unless previously approved, Anthropic does not allow third party
  developers to offer claude.ai login or rate limits for their products, including agents built
  on the Claude Agent SDK. Use the API key authentication methods described in the Quickstart
  instead."
- Legal and compliance: developers building products on the SDK "should use API key
  authentication through Claude Console or a supported cloud provider. Anthropic does not permit
  third-party developers to offer Claude.ai login into their own applications, or to route
  requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover,
  developers may not collect, store, or intermediate Claude.ai credentials or session tokens."
  The same page: an end user may still sign in to the *unmodified* Claude Code binary with their
  own subscription, including where a platform hosts Claude Code; preinstalling or running Claude
  Code in a product requires the Commercial Terms; the binary must not be modified; customers may
  not "remove, disable, or restrict any authentication method built into it", may not pay for,
  resell or intermediate usage, and each end user authenticates with their own key, subscription
  or provider credential.
- **The tension:** the bundling rule bars restricting the built-in subscription sign-in; the
  product rule bars offering claude.ai login. Which applies to Alpha (an unmodified bundled
  binary, each user signing in themselves) needs a written answer from Anthropic before the app
  ships to anyone but Kenil.
- Branding: not "Claude Code" in the product name; "Powered by Claude" is allowed.
- Consumer Terms §3(7) restrict automated access except by API key or where permitted (read
  through a summarising fetch; check the page). The Commercial Terms page was not fetched.

## 10. Other model providers

Claude only. Native: Bedrock (`CLAUDE_CODE_USE_BEDROCK=1`), Google Cloud's Agent Platform
(`…_VERTEX`), Microsoft Foundry (`…_FOUNDRY`), the Claude Platform on AWS. Gateways
(`ANTHROPIC_BASE_URL`, Messages format, must forward `anthropic-beta` and `anthropic-version`):
Anthropic "doesn't endorse, maintain, or audit third-party gateway products, and doesn't support
routing Claude Code to non-Claude models through any gateway". What breaks behind a gateway
(llm-gateway-protocol.md): stripped beta headers (400s or silently-off features), rewritten
bodies, context-management and tool-schema fields on Bedrock/Agent Platform, buffered streams,
stripped `cache_control` (every turn billed uncached), unknown model ids (200K assumed). LiteLLM
and OpenRouter are not documented as supported.

Sources: quickstart.md, third-party-integrations.md, llm-gateway.md, llm-gateway-protocol.md.

## 11. Python vs TypeScript

Python `claude-agent-sdk` 0.2.168 (Python ≥ 3.10); TypeScript `@anthropic-ai/claude-agent-sdk`
0.3.302 (17 Oct 2026). Both bundle a native Claude Code binary pinned to the SDK version (a
source install has none: install the CLI natively). TypeScript has more hook events, the Workflow
tool (from 0.3.149), `persistSession`, `prewarm()`, `streamInput()`, per-agent
`autoCompactWindow`, `permissionPrompts: 'none'`; the sandbox fails closed by default (Python
fails open); `env` replaces the environment in TypeScript and merges in Python.

## 12. Many parallel sessions for one person

No Fleet in the docs. Many sessions = many subprocesses, no documented cap. Subagents: 20
concurrent per session. Workflows: scripts orchestrating up to 16 concurrent agents, TypeScript
only, paid plans with API access. Agent view (`claude agents`, `claude --bg`): a research
preview, local, not mentioned for the SDK; `--bg` cannot combine with `-p`. Cross-session
messaging (`ListAgents`, `SendMessage`, 2.1.224+): same-machine delivery by local sockets; `-p`
sessions bind an inbox socket; SDK-launched sessions not addressed.

Sources: workflows.md, agent-view.md, cross-session-messaging.md.

## Implications for the design

1. Settle auth and bundling with Anthropic in writing before shipping to anyone but Kenil; the
   API-key path is clean, the subscription path is not.
2. Alpha keeps its scheduler and its approval queue; `defer` for approvals that must survive a
   restart.
3. `CLAUDE_CONFIG_DIR` per app to keep transcripts and memory apart from the person's own
   `~/.claude`; `setting_sources=[]` for a locked-down runtime (`~/.claude.json` is read anyway).
4. `failIfUnavailable=True` in the Python sandbox settings.

## Could not verify

Several `ClaudeSDKClient` instances in one process; whether `CronCreate`, `ListAgents`,
`SendMessage`, `Monitor` reach SDK sessions; model-written skills picked up mid-session in SDK
sessions; whether SDK subprocesses bind the cross-session inbox; a Python Workflow tool; whether
auto-compaction can be disabled; the `defer` resume mechanics and `permissionPromptToolName`;
subscription login in practice with no key set; the exact Consumer and Commercial Terms wording.

## Pages read

agent-sdk/{overview, quickstart, sessions, subagents, hooks, permissions, user-input, skills,
claude-code-features, python, agent-loop, mcp, custom-tools, streaming-vs-single-mode, hosting},
sandboxing, skills, authentication, legal-and-compliance, third-party-integrations, llm-gateway,
llm-gateway-protocol, scheduled-tasks, routines, workflows, agent-view, cross-session-messaging,
env-vars (all under code.claude.com/docs/en/); anthropic.com/legal/consumer-terms;
github.com/anthropics/sandbox-runtime; pypi.org/project/claude-agent-sdk; npm
@anthropic-ai/claude-agent-sdk.
