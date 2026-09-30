# Connectors, browser, and macOS sources — research report (subagent, 2026-09-30)

[V] verified against a primary/dated source; [I] inference; [V-3rd] vendor-blog number.

## Headline findings
1. No third-party connector platform lets you skip registering your own Google/Microsoft OAuth app in production (Composio, Nango, Arcade, Pipedream all say use your own for production; Nango: shared app "violates most providers' ToS") [V]. Only Anthropic's own connectors (claude.ai login) remove the Google app entirely.
2. Gmail read is a Google "restricted" scope → verification + CASA (annual). Calendar/Contacts are "sensitive" (verification only). Unverified apps: 100-user lifetime cap per project, cannot be reset [V].
3. Chrome 136 (Mar 2025) blocked CDP on the default profile; Chrome 144 (Dec 2025) added chrome://inspect/#remote-debugging toggle + per-connection Allow, used by chrome-devtools-mcp --autoConnect [V]. Other sanctioned route: extension using chrome.debugger (Playwright MCP Bridge, Claude in Chrome), shows a "started debugging" bar on every tab [V].
4. Claude Code already gives a real-profile browser via Claude in Chrome (`claude --chrome`) — subscription login only, not API key/setup-token/Bedrock/Vertex [V]. Matches current route, breaks on API route.
5. macOS native sources are TCC-gated; TCC attributes access to the responsible process: a Python sidecar launched by the Tauri app inherits grants only while the parent–child chain is intact; bundle must carry NS*UsageDescription keys. Ad-hoc-signed builds lose every grant on rebuild (grant keyed to cdhash); stable signing identity fixes it [V].
6. Convergent "connector shape": a directory bundle (Agent Skills SKILL.md + scripts/references) for *how*, plus a small manifest for transport/auth/tools/triggers (Composio/Arcade/Nango: toolkit → auth config → connected account → tools + triggers). MCP 2026-07-28 went stateless and made mid-call input first-class (MRTR: tool returns input_required, retried with answers) — fits ask-before-write [V].

## 1. Connector platforms (summary of table)
- MCP reference servers: Filesystem, Git, Fetch, Memory, Time only; Google Drive/Slack/GitHub/Puppeteer archived 29 May 2025 [V]. MIT. Nothing for Gmail/Calendar/LinkedIn.
- Anthropic connectors (claude.ai): Gmail, Calendar, Drive, M365, Slack, Notion, GitHub; Anthropic hosts OAuth app and token; auto-available in Claude Code / Agent SDK / -p when logged in with claude.ai; not with ANTHROPIC_API_KEY [V]. Sync "silently no-ops" bug May 2026 (#56794).
- Google Workspace MCP (official, *mcp.googleapis.com): your own OAuth client → verification/CASA apply; Developer Preview only (2026-09-18) [V].
- Microsoft Work IQ MCP: needs M365 Copilot licence; no personal accounts.
- Composio: Gmail (61 tools), Calendar, Outlook, Slack, Notion, Airtable, HubSpot; LinkedIn = official API only (no connections list, jobs, DMs) [V]. Managed OAuth app or BYO; tokens in Composio cloud; backend closed; Hobby free 100K calls/mo (20K via managed apps); Pro $29/mo.
- Nango: 1,000+ APIs; shared dev app for testing only; free self-host = auth + proxy only; ELv2; Starter $50/mo.
- Pipedream Connect: 3,000+ apps; tokens in Pipedream; Startup $99/mo.
- Zapier MCP: 2 tasks per call; Free ≈ 50 calls/mo; unusable for continuous reads.
- Klavis (Strata): Gmail, Calendar, Outlook, LinkedIn, Slack, Notion; Apache-2.0; self-host server; young (YC X25).
- Arcade.dev: 8,000+ tools; action-level OAuth; default Google provider not for production; $60M Series A Jun 2026; acquired Smithery 5 Aug 2026.
- Smithery: registry of 23k+ MCP servers; now Arcade.
- mcp.run: dormant. Merge/Unified/Paragon: B2B, $650–750/mo. Unipile: unofficial LinkedIn (cookies/extension), €49/mo/10 accounts, ToS risk.

What it means: Today (subscription) sessions can call Anthropic's Gmail/Calendar/Drive/M365 connectors with no Google app, no CASA — tokens live with Anthropic (not local-first), dies on API route. Later (API): own Google app; Calendar/Contacts = verification only (~10 business days); Gmail read = restricted → CASA (~$540–1,000/yr via approved labs). Mitigations: drive.file instead of drive.readonly; keep Gmail out of scope until justified; "internal" app type for Workspace orgs. 100-user cap makes "ship unverified" a dead end. Microsoft: publisher verification free but needs partner account, work tenant, publisher domain; personal Outlook.com via Graph with MSA-enabled registration.

## 2. Browser
- Claude in Chrome + `claude --chrome`: MV3 extension + native-messaging host; a11y-tree tools (read_page, find, form_input, computer); real profile, session tab group, pauses on login/CAPTCHA; per-site permissions, auto-mode classifier; GA 26 Aug 2026 on Pro/Max/Team/Enterprise; subscription only; works in -p (bug #67181); "started debugging" banner (#69287); "ClaudeBleed" extension-to-extension bypass reported Jul 2026 [V-3rd].
- Chrome DevTools MCP (Google): CDP; --autoConnect with Chrome 144+ (user enables chrome://inspect/#remote-debugging, Allow per connection); 52.8k stars, Apache-2.0; no procedure persistence.
- Playwright MCP --extension: Playwright MCP Bridge over chrome.debugger; real profile; Apache-2.0.
- Raw CDP on user's Chrome: blocked since Chrome 136; needs --user-data-dir; Chrome for Testing suggested. Copied profiles drift/lock.
- Browser Use (Python, MIT, 116.8k stars): Browser.from_system_chrome(); Skills: records network calls, LLM picks the "money request", saves YAML to ~/.config/browser-skills/, replays via CDP (off by default); workflow-use: record → deterministic script, agent fallback ("very early").
- Stagehand (MIT): act/observe/extract; caching only with Browserbase sessions (locally "no effect").
- Skyvern (AGPL): cached script falls back to live agent and updates cache; heavy.
- Open Browser Use / agent-chrome / browser-buddy: MV3 extension + native host references for building own bridge.
- Anthropic computer use: GA on API Aug 2026; slowest, fallback for native apps.
LinkedIn: User Agreement §8.2 prohibits scraping via crawlers/browser plugins and bots that add/download contacts or send messages [V-3rd]. Vendor claims ~40% of accounts on non-compliant tools restricted Q1 2026; cloud-proxy architectures targeted. Lowest risk: reading pages the person is looking at, in their own Chrome, at human pace; bulk export/automated outreach is the flagged pattern [I]. Official API has no connections/jobs/messaging.

## 3. macOS native sources
- Calendar/Reminders: EventKit (requestFullAccessToEvents, macOS 14+); pyobjc works (maccal, macOS 14–26); Rust eventkit-rs; kTCCServiceCalendar; NSCalendarsFullAccessUsageDescription. Headless Python cannot trigger the prompt; mcp-ical-swift ships a signed helper with own Info.plist + responsibility_spawnattrs_setdisclaim. Apple DTS confirms child→parent chain works when intact.
- Contacts: CNContactStore; pyobjc-framework-Contacts; NSContactsUsageDescription; notes field needs entitlement.
- Mail: Envelope Index SQLite (FDA; fast) or AppleScript/JXA (154 s vs 0.05 s); bodies .emlx under ~/Library/Mail.
- Notes: NoteStore.sqlite (gzipped protobuf; apple-notes-parser); FDA; ~50 ms reads.
- Messages: ~/Library/Messages/chat.db; FDA; denial reports persist (openclaw #23133).
- Files: FSEvents via watchdog; Spotlight mdfind/NSMetadataQuery; Files & Folders / FDA.
- Screen (later): ScreenCaptureKit + Vision OCR (ocrmac); Screen Recording; Sequoia re-prompts monthly, no opt-out. Rewind: 0.5 fps, Vision OCR, SQLite FTS4, ~26 MB/h metadata, ~180 MB/h video, ~20% CPU.
- App Intents: exposes your actions to Siri/Shortcuts; not a data source.
Signing/Tauri: TCC keys grants to code identity; ad-hoc builds lose FDA/Accessibility per build; sign with Developer ID or self-signed cert. Notarised Tauri needs hardened runtime + JIT entitlement. tauri-plugin-macos-permissions covers Accessibility, FDA, Screen Recording, Mic, Camera, Input Monitoring — NOT Calendar/Contacts (prompts must come from EventKit/Contacts calls inside the app's process tree with plist keys).
EventKit vs Google Calendar API: EventKit gives attendees, organiser, alarms, recurrence, URL; no OAuth/verification/cloud token; no conferenceData; write-back through Apple sync. API: structured conference data, reliable writes, sensitive-scope verification + token.

## 4. Files
FSEvents watcher (watchdog) + full rescan on start. Parsing: PyMuPDF4LLM fastest but AGPL; Docling MIT, best tables/scanned, ~2.4 GB, ~70× slower; MarkItDown MIT, tiny, best for docx/pptx/xlsx, weak on PDF tables. Default: MarkItDown for Office, pypdf/pdfplumber or Docling for PDF. Peers: Khoj (AGPL) embeds chunks locally; Rewind stores OCR text in SQLite FTS with bounding boxes + app-focus segment table. "Verbatim + FTS5, no embeddings" is consistent with Rewind.

## 5. The single connector shape
Ecosystem agreement: Composio toolkit → auth config → connected account → tools + triggers; Arcade @tool(requires_auth=Provider(scopes)), missing auth returns a URL (auth is a result, not a precondition); Nango integration → connection; proxy, actions, syncs (→ webhooks); MCP 2026-07-28: tools/resources/prompts, stateless, MRTR input_required, Tasks/MCP Apps/EMA extensions, CIMD auth; roots/sampling/logging deprecated. Agent Skills: SKILL.md (name, description, license, compatibility, metadata, allowed-tools) + scripts/ references/ assets/; three-tier progressive disclosure (~100 tokens metadata → <5k body → files); Claude Code adds context: fork, agent, hooks, paths, disable-model-invocation; OpenClaw frontmatter declares required MCP tools.

Proposal: a connector is a skill directory with a manifest:
```
connectors/<name>/
  connector.yaml   # identity, transport, auth, tools[], resources[], triggers[], health
  SKILL.md         # how the agent should use it (site quirks, recorded procedures)
  scripts/         # tool implementations or recorded steps
  references/      # API notes, selectors, samples
```
connector.yaml: identity (name, description, provider, version, origin builtin|mcp|agent-built); transport mcp-stdio|mcp-http|native-macos|http-api|browser; auth kind none|tcc:<service>|oauth{provider, scopes, custody anthropic|platform:<vendor>|local-keychain}|browser-session{profile}|api-key + status; tools[] (name, input schema, effect read|write ⇒ write asks first, rate hints, idempotency); resources[] (read-only views the core syncs into derived tables, cursor, freshness); triggers[] poll|webhook|fsevents|browser-observe; health (last success, failure counts, repair policy re-observe-page|re-record|escalate).
Every MCP server maps 1:1; native source = tools+resources with auth tcc; HTTP API = tools with oauth; agent-built browser connector = transport browser with recorded procedures in scripts/ and the discovered "money request" cached as an http-api tool.

## 6. Ranked recommendations
(a) Browser: 1. Leverage Claude in Chrome via `claude --chrome` now (real profile, per-site permissions, CAPTCHA/login handoff, zero build; risks: subscription-only, banner, no procedure memory, security record, LinkedIn ToS). 2. Thin fallback bridge later on Chrome 144 --autoConnect route, reuse chrome-devtools-mcp. 3. Store site procedures as connector skills (SKILL.md + recorded steps + discovered API request) so the second run is cheap/deterministic, agent fallback on failure. Never --remote-debugging-port on the real profile or copied profiles.
(b) Files: build FSEvents watcher + MarkItDown/pypdf into FTS5 store; optional Filesystem MCP server.
(c) Calendar: 1. EventKit natively (no OAuth, on device; needs usage key + stable signature + Python core as child of the app or a signed Swift helper). 2. Google Calendar API only for Meet links / reliable writes. 3. Anthropic Calendar connector interim on subscription.
(d) Email later: 1. Mail.app locally (Envelope Index + .emlx, FDA) for Apple Mail users. 2. Anthropic Gmail connector while on subscription. 3. Own Google app + CASA on API (~$1k/yr, 2–8 weeks), minimal scopes. Managed-auth platforms do not remove this and move tokens off device.

## 7. Build vs leverage
Leverage: Claude in Chrome (now); chrome-devtools-mcp (later fallback); MCP Filesystem server; Agent Skills format; Anthropic connectors for Gmail/Calendar on subscription; pyobjc; MarkItDown/pypdf.
Build: connector manifest + registry; native macOS connectors (EventKit, Contacts, Mail index, Notes, Messages) as a signed TCC-correct bundle; procedure-recording layer for browser connectors; repair hooks.
Avoid: Composio/Nango/Pipedream/Arcade as primary auth layer; Zapier MCP; Merge/Unified/Paragon; Unipile.

## 8. Open questions for the founder
1. Will the product ever run on an API key? If yes, browser and Gmail/Calendar each need a second implementation. If subscription for a long time, Claude in Chrome + Anthropic connectors cover browser/Gmail/Calendar with no verification work — but tokens sit with Anthropic (disclose vs local-first pitch).
2. LinkedIn posture: read-only, human-paced, in the person's own browser — or connection export and outreach (the enforced-against pattern)?
3. Signing: Developer ID now? Without a stable signature every TCC grant is lost per build.
4. Process topology: Python core as child of the Tauri app (inherits TCC) vs launchd daemon (own responsible process, own signed bundle).
5. Which Google scopes, ever? drive.file + Calendar avoid CASA; gmail.readonly/drive.readonly do not. Decide before the first consent screen (100-user cap permanent per project).
6. Does an agent-built connector persist as a skill bundle the person can inspect? The person should only see "connected / needs your OK / broken, repairing".

Sources: see the subagent's list (MCP servers README, Claude Code docs /mcp /chrome /cli-reference /skills, claude-code issues #56794 #67181 #69287, Google Workspace MCP guide 2026-09-18, Microsoft publisher verification, Google OAuth verification support pages, Nylas guide, Composio/Nango/Pipedream/Zapier/Klavis/Arcade/Merge/Unified docs and pricing, Chrome DevTools blog 2025-03-17 and 2025-12-11, chrome-devtools-mcp, Playwright MCP, browser-use + workflow-use, Stagehand caching docs, Skyvern, agentskills.io spec, MCP blog 2026-07-28, mcp-ical-swift, maccal, Apple forums thread 805245, pyobjc Contacts, tauri-plugin-macos-permissions, Rewind teardown (kevinchen.co), Khoj, watchdog).
