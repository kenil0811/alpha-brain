# A second way to think: ChatGPT through the Codex CLI (3 October 2026, night)

Kenil: "similar to using claude subscription, can we add chatgpt subscription route as well?"

**What is on his Mac.** No `codex` on the PATH, but the Codex desktop app is installed and
bundles the CLI (`/Applications/Codex.app/Contents/Resources/codex`, `codex-cli
0.142.0-alpha.6`), and `~/.codex/auth.json` says `auth_mode: chatgpt`: signed in with ChatGPT,
last refreshed 16 June. `codex exec` is the headless mode: a prompt, `--json` events on stdout
(`thread.started`, `turn.started`, items, `turn.completed`), `-o` for the last message, `-c`
overrides for any config key (so Alpha's MCP server goes in as `mcp_servers.alpha.…` with no
file), `--ignore-user-config` (his own plugins and servers never load, like `--strict-mcp-config`
for Claude), `--ephemeral` (no session kept) or `exec resume <thread>` (a kept one),
`-s read-only` and `approval_policy="never"`. Two trial runs (a bare "say ok"; one with Alpha's
tools on a copy of the world) both ended in 2–3 s with "Your access token could not be
refreshed. Please log out and sign in again": the sign-in has lapsed, and only he can renew it.

**One route, two ways to think.** `runtime/route.py` is the runner everything uses now
(`route.run`): it reads the person's choice (`thinks_with`, a preference in the world: `claude`
or `codex`, Claude when unset) and hands the request to `claude_cli.run` or `codex_cli.run`. The
request is the same `TurnRequest`; the model tier travels as the Claude alias it always was
(`haiku` for judgements and noticing, `sonnet` for turns) and the Codex side turns it into its
own words (`-c model_reasoning_effort="low"` for the small ones, the person's own Codex model
from `~/.codex/config.toml` when they set one, `ALPHA_CODEX_MODEL` to override).

**`runtime/codex_cli.py`.** `codex exec` with: Alpha's rules and pre-pack as `AGENTS.md` in the
run's own temporary folder (Codex's way of taking standing instructions; the prompt is the
sentence alone), Alpha's MCP server as config overrides with the turn's world, turn, thread and
module in its environment, the sandbox read-only and approvals never (a shell exists in Codex
and cannot be removed; the instructions say to use only Alpha's tools, and the sandbox lets it
write nothing), no session kept except for a live conversation (`persist`), which resumes by
its thread id. Events feed the same `LIVE` registry the window polls (a reasoning line or a
message as the thought, an MCP call as what it is doing), the person can stop it the same way,
the same silence watch ends a hung run, and the reply is the last message. `runtime/
codex_account.py`: the binary (PATH, else the app's), `status` from `codex login status`
("Logged in using ChatGPT"), sign in by starting `codex login` (it opens the browser; Alpha
never sees it), sign out, install (opens the Codex download page; the CLI also comes with
`npm i -g @openai/codex`).

**The window.** Settings › Thinks with: two rows, Claude and ChatGPT, each with its state and
Install / Sign in / Sign out as before, and "Use this" on the one not in use; the first-run gate
("Connect Claude to start") now asks for whichever one is chosen. `GET /api/thinking` (the
choice and both states), `PUT /api/thinking`, `/api/codex/{install,signin,signout}`.

**Checked.** Core: the route follows the preference and falls back to Claude; the Codex command
line and `AGENTS.md`; events parsed (a thread started, a message, a tool call, a failed turn
with its words, a completed one with usage); account status read from the CLI's words; the
routes. Desktop: the Thinks-with rows and the choice. Lint, mypy, typecheck clean.
**Not proven for real:** no turn has run on the ChatGPT route, because his sign-in has lapsed;
the next step is Settings › ChatGPT › Sign in, then `just journeys` on that route. One more honest limit: `codex login status` still says "Logged in using ChatGPT" while a run says the token cannot be refreshed, so Settings shows Connected until a turn fails and says, in Alpha's words, to sign in from Settings. 210 core tests, 76 desktop.
