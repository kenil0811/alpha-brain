# Governance: what Alpha may cause, and where that is enforced

Design §4.0 classifies effects, not tools. This page says where each rule lives in code. A rule
written only in a prompt doesn't count: every row below is enforced by a mechanism and covered
by a test (`core/tests/test_governance.py`, `connectors/browser/scripts/browser_session.test.mjs`).

## Effects

| Effect | Rule | Enforced in |
|---|---|---|
| Read | free once the source is granted; journaled | connectors; every read appends a `saw` entry |
| Write inside Alpha | free; journaled; undoable | `alpha/mcp/tools.py` (each tool journals what it changed) |
| Write outward | only as a pending action the person approves | `alpha/world/actions.py` |
| Never | refused, whatever Alpha or a page says | `actions.never`, and the browser driver |

## Browser read sessions

`connectors/browser/scripts/browser_session.mjs`, for every `read` and `script` job:

- From the moment the context opens, every request other than GET, HEAD or OPTIONS is blocked.
  That covers the page's own scripts and the driver's scrolling and "Show more" paging.
  The one exception is a reader's `allow_posts` list (origin + path pattern, on the reader's
  own site). It is checked in `world/readers.allowed_posts`, stored with the reader, and every
  POST it lets through is journaled (`posts_allowed`).
- While Alpha's own script runs, requests (fetches, images, navigations, WebSockets) may go only
  to origins the page used while it loaded. Everything else is blocked.
- Service workers, DNS prefetch and non-proxied WebRTC are off, so nothing can leave by a route
  the guard doesn't see.
- Results report `writes_blocked` and `egress_blocked`, and both go into the journal.
- Setting a password or card field's value throws (the never list, at the driver).

## The taint rule

The full list is in `alpha/world/taint.py`. Every run holds a baseline: the person's own words
and the pre-pack. The run becomes **tainted** when it reads beyond that baseline:

- search, the journal or records;
- documents, the calendar, people or facts, or notes;
- a page read through a sign-in;
- files, a folder, images or audio the person attached to the message;
- a pre-pack that carries calendar, record, document or source matches, or an earlier reply from
  a tainted run.

After that, for the rest of the run and of its thread (a thread resumes the same session):

- Claude Code's WebSearch and WebFetch are refused by a PreToolUse hook, `python -m
  alpha.world.taint`. The hook command ends in `|| exit 2`, so if the gate itself fails, the
  tool is refused. WebFetch to this Mac or the local network is always refused.
- Pages open only on sites the run already read, sites signed in to, or sites named in the
  turn's own words (`Tools._open`).

The claude process gets an environment allowlist (`claude_account.child_env`), not Alpha's
environment.

Known ceiling: a public page is untrusted but doesn't taint. Text planted on one could steer a
later fetch into carrying baseline material out. The fix would be to run research in a separate
run with no pre-pack.

## The core's API

Loopback only, and a request carrying another site's `Origin` is refused, token or not. The
main window's token reaches everything. The companion window gets its own token, which reaches
only home, the conversation, asking, a turn's progress and transcription (`server.COMPANION`),
so a script planted there can't approve, change settings or edit records.

## Pending actions

`pending_actions` stores the exact payload. A trigger refuses any change to kind, payload,
connector or effect. The flow:

1. `propose_action`, a tool, stores the payload and journals an `asked`.
2. The person approves with `POST /api/pending/{id}/approve`. Answering that question on Home
   ends in the same `Actions.approve`.
3. The row is claimed before anything runs, so a payload runs at most once. If it fails, it is
   not retried.
4. The outcome is `allowed_once`, `rejected` or `unavailable` (no executor yet, or never
   allowed). A proposal expires after a week.

Each decision is journaled as `answered`, and the result as `did` or `failed`.

Only the person decides. `approve` and `reject` refuse inside a model run (`ALPHA_TURN` is set in
the tools' process), and no tool can decide. An automation can therefore only propose.

Executors live in `actions.EXECUTORS`. AB ships none yet. A connector that gains a write
registers one there, and that is the only place an outward write can run from.

## Access modes

The composer's + -> Advanced -> Access, seeded from Settings -> Builds (`alpha/world/access.py`,
`alpha/models/settings.py`). A mode only adds approvals; none takes one away.

| Mode | Waits for the person's yes |
|---|---|
| Ask for approval (default) | reading the web through Alpha's browser (`page_read`, `page_script`, `page_to_table`, `reader_run`) and removing a record |
| Approve for me | removing a record |
| Full access | nothing beyond the rules above |

A call that waits is stored as a pending action of kind `approved_call` with the exact call as
its payload, and approving runs that call once, from the core. In every mode, writes outward are
still only pending actions, the never list still refuses, and the taint gate still applies.
Automations and the turns that make a project (`build` threads) are not held, as in Alpha.

## The never list

- Moving money: kinds that pay, transfer, buy, sell and the like.
- Permanent deletion outside Alpha's space: purge, wipe, erase, empty trash, or
  `permanent: true`.
- Passwords, card numbers or other secrets: secret-named keys, Luhn-valid card numbers, and
  typing into password or card fields in the browser.
- Installing a plug-in: possible only as a pending action. `--strict-mcp-config` loads no other
  MCP server.

## The journal

The journal is append-only, and SQLite triggers enforce it. A DELETE is refused. An UPDATE is
refused unless it is the one tombstone: text and data blanked, `deleted_at` set once, every
other column unchanged. Clearing the conversation tombstones its rows and journals the clearing.
Removing a project or connection never touched the journal. Existing stores pick up the triggers
and new tables on open (`store.migrate` adds new columns).

## Not adopted from Bridge

- **Roles, delegation, row-level security.** AB is one person's world on one Mac, and the
  person is the only principal. The boundary that matters is between the person and the model,
  and that is where these walls sit.
- **The seven-state action lifecycle.** Five states (pending, approved, rejected, expired,
  unavailable) cover one approver and a single run.
- **The variance adjuster** (the stage after Policy(post) in Bridge's pipeline). AB has no
  post-policy stage for it to correct. Confidence gating comes with standing permissions (§7).
