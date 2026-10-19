# Values that say where they came from, documents with positions, agents that wake on events (P5–P7)

*Agreed by Kenil the same day with the recommendation on all five questions (Q96): built in the order P6, P5, P7, the same afternoon (`../log/2026-10-19-p6-p5-p7.md`). Where the build differs: the import is `world_file` with action `import` (the hands stay few), and an agent's on: lines are `wakes_on:` in its file, since YAML reads a bare `on` as true.*

*A proposal, 19 October 2026, for Kenil's yes before any code ("do p3 fully, and p5-p7 as well";
each slice is proposed in writing first). These are the next platform changes of
`requirements/alpha-fit-four-projects.md`, after P1–P3: the chain that lets an agent take an
email's statement in, read it with its positions, keep every number with where it sat, and wake
when something lands. Nothing here is per use case: no word of accounting, deals or contacts
reaches the platform.*

## What this is for

Vikas's Accounting and DealPilot both need three things Alpha lacks:

1. **A number that says where it sat.** "Revenue, Sept: 48,200" should say "Bank statement Sept
   2025 · page 3", or "P&L.xlsx · sheet P&L · B12", or "the person said so". Today a record has
   one free-text `source` for all its values. Only the person's edits and Columbo's marks are
   kept per field (`provenance.fields`).
2. **A document read with its positions.** Today an `.xlsx` becomes text: rows joined by " | ",
   blank rows and formulas dropped, cell positions lost. A PDF loses its page breaks. An `.xls`
   isn't read. A file has no hash, so the same statement taken twice becomes two documents.
   Rows come from a file only as the model types them.
3. **An agent that wakes when something happens.** The built-in agents look at the journal from
   a cursor. A custom agent can only run on its clock, on Start, or by @: it can't wake on "a row
   was added to Deals", "a document was filed", "my draft was decided", or "an hour before the
   call".

## P6: documents with positions (first, the other two stand on it)

1. **Reading keeps where things are.** `connectors/files.py` extracts a document as positions
   as well as text:
   - a PDF page by page;
   - a sheet cell by cell, with A1 references, the value, and the formula when there is one (the
     workbook read twice: values, and formulas);
   - a `.docx` paragraph by paragraph;
   - a `.csv` row by row.

   `documents` gains `structure`: the pages, or each sheet's size and header row. The text the
   model reads marks positions ("[page 3]", "P&L!B12 = 48200 (=SUM(B2:B11))"), so it can name
   them.
2. **`.xls`** is read through a new dependency, `xlrd` (question 2).
3. **One file, one document.**
   - `documents` gains a `hash` (sha256 of the bytes).
   - Taking a file whose hash is already kept returns the document it is, with "already kept"
     in the line. No second copy is made.
   - A file an agent brought in that is already kept shows "You have this already" on its
     staged card, with Keep both or Not needed (question 3).
4. **`document_read`** gains `page` (a PDF's page), and `sheet` with `range` ("B2:F40"), so a
   turn reads only the part it needs, with positions.
5. **A deterministic import:** `world_import(document, into, sheet?, header_row?, columns?,
   key?)`.
   - Code maps the sheet's (or CSV's) columns to the table's fields: by the header's words,
     or by `columns` when the model names them ("Amount" → amount).
   - Code types the rows, never the model. Each value carries its cell as its source (P5).
   - Rows that don't fit the table are set aside and counted, as `upsert` does today.
   - A run's import into a staged table waits on its card (P3).

   This ports the idea of `file_to_table` from Vikas's unmerged PR #7 (`feat/file-import`), not
   its code.

## P5: every value with its source

1. **`world_write` takes `sources`, per field**: `{field: source}`. A source is one of:
   - `{"document": id, "page": 3}` or `{"document": id, "sheet": "P&L", "cell": "B12"}`;
   - `{"url": address}` (the time it was fetched is added by code);
   - `"stated"` (the person said it);
   - `{"formula": "revenue / months", "inputs": {"revenue": ..., "months": ...}}` (worked out,
     with the inputs as they were);
   - `"estimated"`, with `assumed` saying what was assumed.

   A field without its own takes the row's `source`, as today.
2. **Code checks a source, never the words.** A document must be kept, its page must exist, its
   sheet and cell must be inside the sheet. A source that fails is refused in plain words
   ("P&L.xlsx has no sheet 'Profit'"), so a number is never pinned to a place it didn't come
   from.
3. **Stored where the person's edits already are:** `provenance.fields[field]` with `source`,
   `kind` (document · url · stated · formula · estimated), the position, and when. An edit by
   the person replaces it with "stated" (the person), as today.
4. **Seen in the window.**
   - A value's tooltip and the record page's Details say "from Bank statement Sept 2025 · page
     3" or "P&L.xlsx · P&L!B12".
   - Opening it shows that document at that page or sheet.
   - "Around it" and a run's prompt show the same words, so the model sees them too.
5. **Columbo** checks a value against its own source when it has one: the document's cell is
   read again by code, not the model's memory.

## P7: agents that wake on events

1. **A custom agent can have `on:` lines** beside its schedule (or instead of it), in its file
   and through `agent_keep(on=[...])`:
   - `{"rows_added": table}`;
   - `{"rows_changed": table, "fields": [...]}` (`fields` optional);
   - `{"document_filed": module}`;
   - `{"card_decided": "mine"}` (its own drafts and staged writes);
   - `{"before_event": minutes, "matching": words}` (a calendar event whose title holds the
     words, that many minutes before it).
2. **The look is code, from the journal.**
   - The scheduler's tick gives custom agents the same kind of look the built-ins have: the
     journal since the agent's cursor, matched against its `on:` lines by data, never by words.
   - For calendar events, the window between now and the lead time.
   - What matched goes in front of one run as its work ("Since your last run: 3 rows added to
     Deals: Midwest HVAC, …"), and the cursor moves past it.
3. **No loops.** An agent's own writes never wake it. A line carries the run that wrote it, so a
   run started by an event never wakes the same agent again on what that run wrote. A chain
   (Intake files a document, then Extractor wakes on it) is one run per agent per tick.
4. **`when_words`** says it: "when a row is added to Deals; every day at 08:00".
5. **Removal:** an agent's `on:` lines go with it; a table or module removed leaves the lines
   that name it saying so on the agent's page, never firing.

## Order and size

P6 first, then P5, then P7: the import writes P5's sources, and P7's "document filed" wakes on
P6's documents.

| Part | Days | What |
|---|---|---|
| **P6** | 3 | positions for PDF, xlsx with formulas, docx, csv; `.xls`; hash and duplicates; `document_read` by page or range; `world_import` |
| **P5** | 2 | `sources` per field with code checks; stored and shown; Columbo against a value's own source |
| **P7** | 2 | `on:` lines, the generic look, the work in front, no loops, words |

Each is its own commits: the core, then the window.

## Journeys

On a fresh world, with the real model:
- **`statement_imported`** (P6, P5): a two-sheet `.xlsx` and a two-page PDF kept in a module,
  then "import the P&L sheet into a table". The checks:
  - the rows come from code, not the model;
  - every value's source is its cell;
  - the same file taken again is "already kept".
- **`value_says_where`** (P5): "what was September's revenue and where is it from?" The check:
  the answer names the sheet and cell, and they are right.
- **`agent_wakes_on_a_row`** (P7): an agent `on: rows_added: deals`, then a deal added in words.
  The checks:
  - one run within a tick, with the new row in front;
  - its own writes don't wake it again.

## Acceptance

Kenil, in his app:
- one real export (a RestoPros QuickBooks `.xlsx` from `requirements/avilo/`) imported, with a
  value's source opening the right cell;
- an agent woken by a row he adds.

## Questions for Kenil

1. **Order P6 → P5 → P7?** I'd take that order: each stands on the one before.
2. **`.xls` through a new dependency (`xlrd`)?** I'd say yes: the RestoPros files include `.xls`,
   and the library is small and read-only.
3. **The same file twice.** Taken by hand, I'd return the one already kept and say so. Brought
   in by an agent, I'd show "You have this already" on its card, with Keep both or Not needed.
4. **The first event kinds:** rows added, rows changed, document filed, a decided card of its
   own, before a calendar event. I'd start with those five and add more as projects need them.
5. **A formula's source keeps its inputs as they were, not live** (P4 makes formulas live)?
   I'd keep them as they were: a source is what the value rested on when it was written.
