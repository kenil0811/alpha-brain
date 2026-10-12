# Dashboard cards: Alpha proposes, the yes keeps them, a change that matters asks again (12 Oct 2026, Q47)

Branch `feat/dashboard-cards`, off `feat/file-import` (PR #7).

## What the owner asked (12 Oct)

- No standard dashboard view.
- Alpha proposes the cards a table's dashboard should have; the person's yes keeps them and they
  stay current.
- When a table's information changes in a way that matters, Alpha proposes new cards.
- One event-based automation across every module does this.

## What was built

- **Core:**
  - `world/cards.py`: a card is kept as what it measures (type, field, measure, title, why),
    never as a number; tables `cards` and `card_shapes`, both in `purge.py`.
  - Tools `card_propose` (a journal proposal, nothing kept) and `card_list`.
  - The proposal's yes in `api/home.py`: the answer, the cards and the journal line are one
    transaction; each card is checked against the table as it is now.
  - `GET /api/tables/{name}/cards`, `DELETE /api/cards/{cid}`.
  - `runtime/cards.py`, run by the scheduler on its own thread: compares each table's shape
    (fields, kinds, choices, has rows) with the last one seen. A new table with rows, its first
    rows, new fields, a field of a new kind or new choices gives Alpha a short turn to propose.
    Rows coming and going ask nothing: the numbers follow by themselves. Tables there before
    the first pass are taken as they are.
- **Window:**
  - The Dashboard view is gone; a table's kept cards show above its data (`KeptCards`), their
    numbers worked out from the rows each time, with a period that applies to every card.
  - ⋮ › Ask Alpha for dashboard cards (or more cards); Edit cards removes one after a confirm.

## The review

An agent that did not build it found 5 defects in the core and 3 in the window. All were fixed:
1. the first table in a world with none never got a proposal (no shape seen meant "first pass");
   a started marker now says the pass has run;
2. the same cards could be proposed again while a proposal waited; waiting ones are skipped;
3. the yes was neither one transaction nor conditional, so two clicks kept cards twice;
4. the same card twice in one proposal was kept twice;
5. the pass ran inside the scheduler's tick (blocking it) and two passes could act on one change;
   it now has its own thread, and a table's new shape is claimed with a conditional write;
6. a total or average whose number field had gone showed a record count under its title; it now
   shows nothing;
7. a card's button was labelled with the computed title, not the card's;
8. clicking one card's "show these" narrowed every card.

Also: cards kept in one transaction came back in a random order (same timestamp); now in the
order proposed.

## What ran

- **Journey `dashboard_cards`** (new): passed with the real model, 25 s
  (`docs/journeys/2026-10-12-1242.md`, after the fixes; first run `2026-10-12-1231.md`).
  Alpha proposed four cards for Deals, kept none before the yes, and said so.
- Core: 241 passed; `just lint` clean.
- Window: tsc clean; vitest 485 passed, 1 skipped (the Dashboard view's tests went with it).
- `just stats`: 241 core tests; 77 tools; 25 journeys; 241 commits; core 16,727 lines, tests
  5,816, desktop 24,844; lint clean.
- **Not run:** `just check-layout` with kept cards, and the Mac app walk (a yes on Home, then
  the cards on the table).
