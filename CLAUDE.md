# Working in alpha-brain

Alpha is an agentic second brain (see `README.md`). This file is the standing rule for every
session that touches this repository, so that any new session can pick up from the docs alone.

## Docs and code stay in sync, every session

The docs are the memory of the project. A session that changes code is not finished until the
docs say what the code now does. Concretely, before a session ends (and in the same commit or
the one right after it):

1. **`docs/design/alpha-second-brain-design.md`** — every section ends with an *As built*
   paragraph. If the change alters what a section's *As built* says (built / partial / not
   built, how something works, what differs from the intent and why), rewrite that paragraph.
   A decision taken with Kenil goes into §11 as a new Qn row with the date and the failure or
   reason behind it.
2. **`docs/design/build-plan.md`** — add what was built under §4 (a dated subsection or a bullet
   in the matching one: commits, what runs for real, what the real runs found), update the
   state table in §4.3, the pending list in §4.9, and the one-breath summary in §1. Say
   "proven by tests only" when nothing ran for real; "it ran" is not "it works".
3. **`README.md`** — when the layout, the commands or the data directory change.
4. **A change to how Alpha behaves is judged by the journeys**, not by tests alone:
   `just journeys` (all) or `just journeys <name>` runs the real journeys in `journeys/` on a
   copy of the world and writes `docs/journeys/<stamp>.md`; the build plan cites the latest
   report. A journey that fails after a change is a regression until shown otherwise.
5. **Numbers are measured, never carried.** Test counts (`just test`, `just test-desktop`),
   tool counts (`grep -c` the registered tools), lint state (`just lint`) and commit counts are
   re-run before being written. If `just lint` is not clean, the docs say so.
6. **Memory** — the auto-memory under `~/.claude/projects/-Users-kenil-Desktop-dev-alpha/memory/`
   gets a dated line in the relevant file (vision, direction, feedback, state) and `MEMORY.md`
   is kept as a one-line index. Memory holds what the repo can't (why, what Kenil said, what is
   open); the repo holds what is.

## Starting a session

Read in this order: `README.md` → the design's *As built* paragraphs → `build-plan.md` §4.3
(state), §4.5 (what next), §4.9 (pending) → `git log --since=<the date in build-plan §1>` to
see what the docs may not yet cover. If the log is newer than the docs, bring the docs up first.

## Rules that bind the code (decided with Kenil; details in the design)

- Nothing per use case; the platform knows no domain. Never site- or app-specific logic in the
  platform; Alpha's know-how (readers, procedures) is never patched by hand — ask Kenil.
- Plan first by mechanism: lasting things are made only inside an approved plan's build.
- No limits, quotas or technical knobs; the person stops what isn't going anywhere.
- Known, assumed or asked: every value has a source, or is estimated and says so, or is asked.
- Removal deletes everything related; the journal is never deleted.
- Acceptance is a real run in the person's own app or world, never a test or an API call alone.

## Toolchain

`uv` (Python 3.13.9), Node from `/opt/homebrew/opt/node@24/bin` (the default Node is broken),
pnpm 10, Tauri 2.11.6. `just test`, `just lint`, `just test-desktop`, `just journeys`, `just app`. The model
route is the Claude Code CLI on Kenil's subscription; `claude` must be signed in from the
default config home and `USER` must be set. Keep `desktop/src-tauri/Cargo.lock`.
