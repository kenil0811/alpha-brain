# What to leverage for the harness (research, 17 October 2026)

*For the harness design (`../alpha-harness-design.md`, §12 and §14). Open-source projects and
components as of 17 October 2026, each with a verdict: **use** (adopt the code), **borrow** (the
idea, not the dependency), **skip**. Stars and versions from the live pages that day; what could
not be confirmed is listed at the end. Four passes with web search, then the policy and
Claude-Code-internals claims checked against Anthropic's live pages.*

## 0. The governing fact: the model route and the subscription

Anthropic's own pages, fetched that day:
- Legal (https://code.claude.com/docs/en/legal-and-compliance), "Authentication and credential
  use": OAuth is "intended exclusively for purchasers of Claude … subscription plans … for
  ordinary use of Claude Code and other native Anthropic applications"; developers "including
  those using the Agent SDK, should use API key authentication". A third party may not "offer
  Claude.ai login into their own applications, or … route requests through Free, Pro, or Max
  plan credentials on behalf of their users"; may not "collect, store, or intermediate Claude.ai
  credentials or session tokens — sign-in to a Claude account must complete through Anthropic's
  own flow". The carve-out: nothing "prevent[s] an end user from signing in to the unmodified
  Claude Code binary with their own Claude subscription". A product may run Claude Code if the
  binary is unmodified, no auth method is removed, each end user authenticates themselves, and
  nothing is resold or intermediated. "Advertised usage limits for Pro and Max plans assume
  ordinary, individual usage of Claude Code and the Agent SDK."
- Agent SDK overview: "Unless previously approved, Anthropic does not allow third party
  developers to offer claude.ai login or rate limits for their products, including agents built
  on the Claude Agent SDK." "Powered by Claude" allowed; "Claude Code" not.
- Support (https://support.claude.com/en/articles/15036540, notes of 15 Jun and 7 Oct 2026): the
  separate "Agent SDK credit" was paused; "Claude Agent SDK, claude -p, and third-party app usage
  still draw from your subscription limits"; Max and Team plans now include monthly API credits
  covering the Agent SDK, `claude -p`, the API and Managed Agents (amounts not on the page;
  secondary sources say $100 Max 5x / $200 Max 20x, unverified).
- History: enforcement against third-party harnesses on subscription OAuth from 9 Jan 2026;
  terms clarified 19–20 Feb; OpenCode removed its Claude OAuth plugin; reversed 13 May; the
  credit scheme paused 15 Jun. Anthropic "may enforce without prior notice".

**Reading for Alpha (not legal advice):** what Alpha does today, the person signing into the
unmodified `claude` binary through Anthropic's own flow on their own Mac and Alpha never touching
the token, is the sanctioned shape, and the Agent SDK (the same binary) sits in the same place
as long as the login stays Anthropic's and Alpha is the person's own tool. Out: an Alpha "Log in
with Claude" button, storing or proxying tokens, one subscription for several people, shipping
Alpha to clients on subscriptions without Anthropic's approval (clients: API keys or their own
Console organisation, as the 16 Oct shipping research concluded).

**Other providers' models with the SDK:** technically possible through `ANTHROPIC_BASE_URL` and
`ANTHROPIC_AUTH_TOKEN` (the SDK runs the same binary; the Bedrock, Vertex and Foundry flags too);
Anthropic "doesn't support routing Claude Code to non-Claude models through any gateway". §2.

## 1. Harnesses: learn from or embed

Repos moved this year: sst/opencode → anomalyco/opencode; block/goose → aaif-goose/goose;
All-Hands-AI → OpenHands/OpenHands; badlogic/pi-mono → earendil-works/pi.

| Harness | Licence · language · state | What it has | Verdict |
|---|---|---|---|
| **Claude Agent SDK** (Python 0.2.168; TS) | Anthropic terms · wraps the Claude Code binary · GA | built-in tools + in-process MCP; sessions as JSONL with resume/fork/`session_store`; `AgentDefinition` subagents; hooks → deny → ask → mode → allow → `can_use_tool`; skills and plugins; `setting_sources=[]`; `sandbox`; no scheduler | **use**: the engine |
| **OpenCode** (anomalyco) | MIT · TS/Bun · 214k★ · 1.19.3 | plugins + MCP; sessions in SQLite with parent_id; agents as Markdown with per-agent permission; allow/ask/deny with globs, "last rule wins"; Agent Skills; 75+ providers; Claude Pro/Max plugin removed (ToS) | **borrow** the permissions shape, agent files, session index |
| **Goose** (AAIF) | Apache-2.0 · Rust, desktop → Tauri · 55k★ | everything an MCP extension; recipes; in-process cron; modes Autonomous/Manual/Smart Approval; `goose serve` = ACP; Claude via `claude-acp` on the person's own login | **borrow** the Tauri-desktop-as-ACP-client shape |
| **OpenHands V1 SDK** | MIT · Python · 1.3k★ (app 91k★) | `Conversation(persistence_dir)` events; condensers; MEMORY.md injected as untrusted; confirmation policies incl. `ConfirmRisky` + LLM risk labels; SKILL.md; LiteLLM providers | **borrow**: the strongest Python-native fallback engine; "memory is untrusted content" |
| **Codex CLI** | Apache-2.0 · Rust · 130k★ · 0.163 | threads → turns → items; AGENTS.md; subagents inherit, can't widen; **sandbox (read-only/workspace-write/full) separate from approval policy**; skills; scheduled tasks with Gmail/Slack/GitHub triggers (desktop/cloud only); `codex app-server` JSON-RPC | **borrow** the sandbox-vs-approval split, the deny-default Seatbelt profile, the wire shape |
| **Gemini CLI** | Apache-2.0 · TS · 107k★ | policy engine: TOML rules with priority tiers allow/deny/ask_user; SKILL.md with consent; shadow-git checkpoints | **borrow** the policy-rule shape |
| **Pi** (earendil-works) | MIT · TS · 116k★ | tiny core; sessions as a JSONL tree with branch summaries; no permission system; `pi --mode rpc` | **borrow** the session tree |
| **Hermes Agent** (Nous) | MIT · Python · 255k★ · 0.22.2 | sessions SQLite+FTS5; MEMORY.md/USER.md with caps + FTS5 recall + write approval; `delegate_task`; approvals manual/smart/off, hard blocklist, `cron_mode: deny`; **self-written, self-patched skills** behind a write approval; one `cronjob` tool, 60 s tick, delivery to chats | **borrow heavily**: closest to "the agent makes its own skills and schedules"; skills write-approval, the cron tool, "cron sessions can't edit cron", memory caps |
| **Cline** | Apache-2.0 · TS · 70k★ | MCP, Plan/Act, checkpoints, `cline schedule`; auto-approve defaults true | **skip** |
| **Aider** | Apache-2.0 · Python · maintenance | no loop, no MCP; repo map | **skip** |
| **smolagents** | Apache-2.0 · Python · slowing | a loop, not a harness | **skip** |
| **Letta** (letta-code) | Apache-2.0 · TS · 0.34 | memory blocks in the system prompt + git MemFS + sleep-time "dreaming"; permission modes; schedules die with the process | **borrow** memory blocks and the sleep-time agent |
| **ACP** (Agent Client Protocol) | Apache-2.0 · schema 1.26 · Zed + JetBrains | JSON-RPC over stdio: session/new|load|prompt|cancel, request_permission, client-side fs and terminal; 43 agents incl. Claude, Codex, Gemini, OpenCode, Goose, Hermes, OpenHands, Pi | **borrow now, adopt later**: the escape hatch to other engines; permissions yes/no only, no skills or scheduling in the protocol |

Patterns worth copying whatever the engine: per-tool allow/ask/deny with globs and a hard-deny
layer no mode overrides; the sandbox boundary separate from the approval policy; agent files that
inherit but cannot widen; append-only session logs with fork and compaction entries; agent-written
skills behind a write approval; the desktop as a client of a local server.

## 2. Other models with a Claude-Agent-SDK product

Anything in front of the SDK must follow https://code.claude.com/docs/en/llm-gateway-protocol
(forward `anthropic-beta`, don't buffer SSE, relay pings, keep `cache_control`, survive
`thinking: adaptive`).

| Candidate | Verdict |
|---|---|
| **Vendor endpoints that speak the Anthropic Messages format**, no proxy: Ollama local/cloud (`ANTHROPIC_BASE_URL=http://localhost:11434`), DeepSeek (`/anthropic`; ignores `cache_control`), Z.ai GLM, Moonshot Kimi (every model slot must be mapped or background tasks fail), MiniMax, Qwen DashScope (community table), llama.cpp server | **use** as the "other models" story: nothing shipped; a provider is `{base_url, credential, model map per slot, flags}` in the subprocess env; smoke-test three to five tool-calling tasks per provider before enabling |
| **LiteLLM** (MIT; malicious PyPI releases 1.82.7/1.82.8 on 24 Mar 2026: pin and hash-verify) | **use only as "bring your own gateway"**, never bundled; the one translator Anthropic lists; known breakages: thinking blocks dropped in streaming, thinking+tools 400s |
| **OpenRouter** (hosted, 5.5% fee) | optional for Claude models on an OpenRouter key; their own words: non-Anthropic models "not supported through the native endpoint" |
| **Claude Code Router** (MIT, 37.7k★) | **borrow** the routing classes (default/background/think/longContext); its issues are the best catalogue of what breaks |
| 1rgs/claude-code-proxy, y-router (archived), ccproxy, claude-bridge | **skip** |

What breaks for tool-calling agents behind translators: reasoning content not round-tripped into
tool history (400 on the second tool turn), streaming corruption of tool-call JSON, `strict` and
`cache_control` rejected, unmapped model slots, lost caching. Models that hold up in 2026
reports: Kimi K2.6/K2.7-code and DeepSeek V4 Pro; GLM-5.x mixed; small Ollama models "basic chat
and file edits". GPT-5 and Gemini through LiteLLM or CCR work for simple loops; no 2026 source
shows them reliable through the full Claude Code tool set. Hosted WebSearch/WebFetch, the auto
mode classifier and fast mode are Claude-API-only.

## 3. Browser automation in the person's signed-in sessions

Ground truth: Chrome 136+ ignores `--remote-debugging-port` on the default profile; Playwright
says automating the default profile "is not supported"; Chrome 144+ added the sanctioned route
(a toggle at `chrome://inspect/#remote-debugging` and a per-connection Allow dialog); Google may
block sign-in in automation-controlled browsers, while reusing a valid session is reliable.
"Accessibility tree first, screenshot fallback" is the norm across Anthropic, Microsoft, Google
and Vercel.

| Candidate | Verdict |
|---|---|
| **Anthropic `browser_toolset_20260801`** (GA 19 Aug 2026; client-side; 27 tools incl. `read_page` with `[ref_N]`, `find`, `get_page_text`, `form_input`, click by ref, screenshot/zoom) | **use as the tool contract**: the names and ref semantics Claude is trained on, implemented against Alpha's bundled Chromium |
| **Playwright MCP** (Apache-2.0, Microsoft, 38k★) | **use or borrow heavily**: the cleanest ref-snapshot implementation; `--user-data-dir` per site; `--extension` bridge into the person's real Chrome with per-connection approval |
| **Chrome DevTools MCP** (Apache-2.0, Google, 54k★; telemetry on by default) | **borrow** the `--autoConnect` consent route as an escape hatch |
| **Vercel agent-browser** (Apache-2.0, Rust CLI, 44k★, churning) | **borrow** refs-invalidate-on-navigation; brings a second Chrome |
| **browser-use** (MIT, 118k★; stealth/CAPTCHA direction) | **skip**: the opposite of "read like a person" |
| **Stagehand** (MIT, v4) | **skip**: natural-language `act()` is the wrong abstraction |
| `computer_toolset_20260801`; Claude in Chrome | desktop-level fallback only; Claude in Chrome is not embeddable |

What we'd take: keep the bundled Chromium with one user-data-dir per site (what Alpha does, the
only supported path); a `browser_toolset`-shaped surface over Playwright persistent contexts;
sign-in once by the person, headed; human pacing as behaviour; Chrome 144 auto-connect or the
Playwright extension as the consent-gated escape hatch; never stealth, never the real profile.

## 4. Memory layers

| Candidate | Verdict |
|---|---|
| **Graphiti** (Zep; Apache-2.0, 32k★; needs Neo4j/FalkorDB, no SQLite) | **borrow heavily**: its edge model is Alpha's facts table (`valid_at/invalid_at` + `created_at/expired_at`, invalidate never delete, every fact pointing to its source episode) |
| **Anthropic memory tool** `memory_20250818` (file verbs `view/create/str_replace/insert/delete/rename` under `/memories`) + Claude Code auto-memory (a `MEMORY.md` index ≤200 lines, typed entries, topic files) | **use the posture, not the storage**: those verbs over a virtual `/memories` tree backed by the world; the tiny typed index |
| **Letta** memory blocks + sleep-time "dreaming" | **borrow**: pinned always-in-context blocks (who the person is, current work, standing preferences); the sleep-time agent as the scheduled consolidator |
| **mem0** (67k★) | **skip**: flat memories, no validity intervals or provenance; graph memory removed from OSS |
| **cognee** | **skip**: three stores for what one SQLite does |
| Karpathy "LLM Wiki" (Apr 2026) | **borrow**: a lint pass (contradictions, orphans, stale) as a scheduled agent job |
| Basic Memory (AGPL), claude-mem, Hindsight (Postgres), A-MEM, Memori, MemOS, Supermemory, LightRAG | one idea each (journal → observation compression; rank-fused recall if embeddings come via sqlite-vec); **skip** as code |

Nothing replaces the world.

## 5. Scheduling and triggers

| Candidate | Verdict |
|---|---|
| **An own cron table in the world + a minute tick** (what Claude Code Desktop, Hermes, OpenClaw, Goose, Letta, Cline all do); `cronsim` 2.7 (BSD) or `croniter` 6.2 for parsing | **use**: Claude Code Desktop's semantics verbatim (minute tick, deterministic stagger, "skipped: asleep / still running" journaled, one catch-up run on wake for the most recent miss within 7 days, keep-awake, lid closed = skipped and said); OpenClaw's "next heartbeat vs wake now"; Hermes' "cron sessions can't edit cron" |
| APScheduler (3.11 stable; 4.0 alpha since 2025) | **skip** |
| Temporal, Hatchet | **skip**: a server, Postgres |
| huey 3.4 (SQLite) | a fallback if a queue with retries is ever needed |
| **watchfiles** 1.3 (Rust notify/FSEvents, debounced, asyncio; MIT) | **use** for folders; skip watchdog (no release in ~2 years) |
| Gmail: `history.list` polling (2 quota units a call) vs Pub/Sub push (a GCP topic, 7-day renewal) vs IMAP IDLE (full scope; aioimaplib GPL) | **use polling** every 30–60 s from a stored historyId; Calendar `events.list` with `syncToken`; Slack Socket Mode. Gmail scopes are restricted → verification; stay in the testing tier for the POC |

One `triggers` table (kind = cron | file | poll; next_due, last_run, state) driven by a minute
tick; every fire, skip and catch-up journaled.

## 6. Sandboxing model-written code on macOS

| Candidate | Verdict |
|---|---|
| **Anthropic `sandbox-runtime` (srt)**: Seatbelt profiles generated at runtime + local proxies for a domain allowlist; `filesystem.allowWrite/denyWrite/allowRead/denyRead`, credentials denied; Node library or CLI; Claude Code's own Bash sandbox is built on it | **use**: from the harness vendor, already inside the SDK's Bash tool; the CLI from Python |
| The SDK's sandbox settings: `allowUnsandboxedCommands:false`, `failIfUnavailable`, `excludedCommands`, `blockReadsOutsideWorkingDirectories`, credential masking, `network.strictAllowlist`; only shell commands are sandboxed | **use** these keys; wrap MCP servers and Alpha's own module code with `srt` separately |
| Hand-written Seatbelt profiles | **borrow** Codex's deny-default shape; never hand-maintain |
| Apple `container` (macOS 26, VM per container), Microsandbox, Lima | **watch**: an optional strong-isolation mode for untrusted code |
| Docker Desktop, OrbStack, E2B | **skip** as requirements |
| Deno, Pyodide, wasmtime, Extism | **skip** for a shell; wasmtime + MicroPython a future "evaluate a pure function" tool |

Trade-offs to state: a shared kernel; hostname-only allowlists (an allowed github.com is an
exfiltration channel); reads must be denied explicitly; Apple's unannounced Seatbelt deprecation.

## 7. Connectors and the skill format

| Candidate | Verdict |
|---|---|
| **Agent Skills** (SKILL.md: `name`, `description`, optional `license/compatibility/metadata/allowed-tools`; `scripts/ references/ assets/`; ~45 adopters incl. Claude Code, Codex, Gemini CLI, OpenCode, Cursor, Copilot, Goose, OpenHands, Letta, Hermes) | **use**: the one format for model-made skills and connector know-how |
| anthropics/skills, obra/superpowers, skills.sh | **borrow** selectively; never auto-install unreviewed skills |
| **Claude Code plugin layout** (`.claude-plugin/plugin.json`; `skills/ agents/ hooks/ .mcp.json`; `userConfig` with `sensitive`) | **borrow the layout**: a subset readable from Python that loads unchanged in the SDK |
| **MCPB bundles** (`manifest.json`, `user_config` with `sensitive`; local servers only) | **borrow** `user_config` semantics |
| MCP Registry (preview) | discovery only |
| Gmail/Calendar: **taylorwilsdon/google_workspace_mcp** (MIT, Python, 3.4k★, own GCP OAuth client, `--read-only`); Google's hosted Workspace MCP a developer preview | **use** for the POC |
| Slack and Notion hosted MCP (vendor OAuth) | **use**: nothing to ship |
| LinkedIn: no official MCP; third-party servers drive a logged-in browser and warn about the User Agreement | **skip as a packaged slot**: Alpha browses as the person at human pace |
| Composio, Zapier MCP, Pipedream, Klavis, Nango | **skip** for the POC: a third party between the person's data and their Mac |

The connector slot: one directory per connector with `SKILL.md` (how to use it, what to ask
before writing, what to journal) + `connector.json` (a subset of plugin.json ∪ the MCPB manifest:
name, version, license, `mcpServers` inline or `{url, transport:"http"}`, `userConfig` with
`sensitive` → Keychain, permissions read/write) + `auth/` (provider, URLs, scopes; tokens in the
Keychain only; PKCE in the Tauri window). The same key names as Claude Code so a slot is a valid
plugin.

## 8. Standard UI for model-made output in the Tauri window

| Candidate | Verdict |
|---|---|
| **vercel-labs/json-render** (Apache-2.0, 18.7k★, 0.21, "experimental"): a catalogue with Zod props → the model emits a flat `{root, elements}` spec constrained to it; streaming; React renderer | **use**: the strongest candidate for model-made tables, pages and dashboards; safe by construction, validated before render, stored as data in the world |
| **OpenUI** (Thesys, MIT, 11.5k★; "OpenUI Lang" 1.0.1 on 15 Oct) | the bounded trial already decided on 16 Oct: the language and renderer only, never the shell, against the same catalogue |
| **A2UI** (Google, Apache-2.0; React renderer status conflicting) | **borrow** the flat-id + data-model shape |
| **MCP Apps** (SEP-1865, stable 2026-01-26; a tool declares a `ui://` HTML resource, rendered in a sandboxed iframe) + `@mcp-ui/client` | **use** as the host contract for connectors' own UIs; the same iframe sandbox |
| Sandboxed HTML in an iframe (what Claude Artifacts do) | **use** as the escape hatch for free-form pages |
| assistant-ui, AG-UI 1.0 + CopilotKit, AI Elements | **borrow** the tool-result → component registry and the typed event vocabulary; skip the frameworks (Alpha has its chat) |

Two tiers: a catalogue-constrained spec rendered by React (json-render with a small Alpha-owned
catalogue: Table, Stat, Chart, Card, Form, Timeline, Page) through a `render_page` tool,
validated and stored as data; a sandboxed iframe that doubles as the MCP Apps host. Keep the
spec small enough that swapping the renderer is a day's work: every generative-UI library is
pre-1.0 or weeks past it.

## The eight to adopt

1. The Claude Agent SDK (Python) as the engine: `setting_sources=[]`, a PreToolUse hook +
   `can_use_tool` as the one gate, `session_store` into the world, `AgentDefinition` for the
   agents, plugins and skills for model-made skills; the person's own login through Anthropic's
   flow, API keys or Anthropic's approval for anyone else.
2. `sandbox-runtime` + the SDK's strict Bash sandbox for model-written code and MCP servers.
3. Agent Skills (SKILL.md) as the single format for skills and connectors.
4. `browser_toolset_20260801` as the browser tool contract over Playwright persistent contexts on
   the bundled Chromium, one profile per site; Chrome 144 auto-connect as the escape hatch.
5. An own trigger table + minute tick with Claude Code Desktop's semantics; cronsim; watchfiles;
   polling for Gmail and Calendar; Slack Socket Mode.
6. The memory-tool posture over the world; the typed index; two-axis time on facts (kept);
   pinned blocks; sleep-time consolidation and a lint pass as scheduled agents.
7. The connector slot = an Agent Skills directory + `connector.json` + Keychain; first slots
   via google_workspace_mcp, Slack hosted, Notion hosted.
8. json-render with an Alpha-owned catalogue for model-made pages, plus the iframe tier that
   hosts MCP Apps; OpenUI Lang the bounded trial.

## The five to skip

1. Bundling any translation proxy (LiteLLM, Claude Code Router, the proxies): a provider record
   pointing at native Anthropic-format endpoints instead.
2. browser-use and Stagehand; automating or copying the person's default Chrome profile.
3. mem0, cognee, Graphiti-as-code, Letta-as-code, Basic Memory: a second store beside the world.
4. Temporal, Hatchet, APScheduler 4; Docker Desktop or OrbStack as requirements.
5. Hosted OAuth aggregators; LinkedIn as a packaged connector; assistant-ui, CopilotKit, AI
   Elements as chat frameworks.

## Could not verify

The monthly API-credit amounts on Max/Team after 7 Oct and whether they cover third-party apps;
Pi's and Hermes' claims that Claude Max OAuth in third-party tools is billed as extra usage;
A2UI's React renderer; Google's hosted Workspace MCP enrolment and whether a local desktop client
escapes CASA for restricted Gmail scopes; Chrome 146 auto-connect details; agent-browser profile
persistence; Apple `container` dates; the mem0 version that dropped graph stores; a published
Agent Skills spec version; Goose's Temporal backend being gone (inferred); MiniMax and Qwen
endpoints (community table).
