# Settings › Models: what each model call costs (12–13 Oct 2026)

Branch `feat/models-spend`, off `feat/file-import` (PR #7). Q49.

## What the owner asked (12 Oct, Vikas)

- A Models page in Settings like SuperPenguin's Projects screen: a toggle per integrated model,
  and inside each model, what each project costs.
- Bring in whatever else SuperPenguin does (by outcome, goal, user).
- Choices taken with him: breakdowns by conversation, by outcome (agents), a daily budget, and
  billed vs estimated; the toggles filter the view and never switch the model Alpha uses. He
  first chose window only, then asked for the core half in the same session.

SuperPenguin, from its public pages (superpenguin.ai, 12 Oct): spend by tool, model, project or
repo, PR and session; "outcomes" are merged PRs (cost per PR, unallocated spend); billed vs
estimated ("API-equivalent"); a daily threshold, a spike warning and a monthly cap; members see
their own spend, owners everyone's. Nothing public on goals. Users don't apply: a world is one
person's.

## What was built

- **Core:**
  - A `usage` table (`world/usage.py`): one row per model a call used, with turn, thread,
    module, kind, route, model, tokens (input, output, cache read, cache write) and cost.
  - Written in `route.run`, where every model call passes: answers, agent runs and the
    background passes (noticing, checking, judging, connecting) alike. A failed write is logged
    and never stops the answer.
  - The cost is the tool's own: Claude Code's `modelUsage[*].costUSD` (API-equivalent, at list
    prices). The Codex CLI gives tokens and no price, so a ChatGPT row has none; Alpha never
    guesses one.
  - A background pass's row takes its turn's project and conversation (a join on the journal).
  - The answers from before are carried over once, while the table is empty: route from the
    price (priced = Claude, an unpriced reply = ChatGPT), model unknown.
  - `GET /api/usage?since=`; the query uses the `usage_at` index (query plan checked).
  - Removing a module keeps its usage rows, like the journal (`purge.py`'s docstring).
- **Window** (`shell/Models.tsx`, `shell/spend.ts`), Settings › Models:
  - An assistant toggle (All, Claude, ChatGPT) and a model toggle (Sonnet 5.5, Haiku 5.5, …;
    "Not recorded" for the carried-over answers, "Unknown" when even the route isn't known),
    each with its calls; a range (today, 7 days, 30 days, all).
  - Tiles: Spent (calls, and how many had no price), Billed (nothing on a Claude plan, the
    estimate with an API key, from today's sign-in), Today against yesterday (flagged at twice).
  - A daily budget kept as a preference (`daily_budget`): a warning, never a stop (no caps on
    work).
  - Projects, Conversations and Agents ranked by spend with a bar each; a project opens its
    conversations; an agent shows its runs, cost per run and last verdict (the closest Alpha
    has to SuperPenguin's outcomes).
  - The section is as wide as the page; tiles scroll sideways in one row; the table scrolls
    inside its card when the window is narrow.

## What ran for real

- On a SQLite backup of the owner's world (13 Oct), a core with `--no-background` and the
  window on Vite: the 7 old answers carried over with their prices. One real question ("how
  many modules do I have?") recorded two rows for one call: Sonnet 5.5 (91k cache read, $0.055)
  and Claude Code's own Haiku 5.5 call ($0.0001). The page showed both models in the toggle.
- No background pass ran for that question (nothing worth noticing), so their rows are proven
  by tests only. The ChatGPT route is proven by tests only.
- Checked at 1100×560 and 1240×820, light and dark. Found and fixed on the way: the table cut off
  at 1100 wide, two buttons named Save on Overview, a lone toggle pushed right, "1 calls", a
  query returning two `module` columns, and a backfill that would have counted new answers twice.
- Journeys not run: no answer changes; recording sits beside the call.

## Not done

- The route trial on switching (`route.trial`) calls the runners directly and isn't recorded.
- The window sums every row itself; the core can total by range when that grows slow.
- `asking`'s options pass records its turn as `options:<turn>`, so it has no project.
- No price for ChatGPT; Billed reads today's sign-in, not each call's.
