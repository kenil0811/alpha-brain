# The Avilo build on alpha-brain: what is left, and the order

*20 Oct 2026, night, for Kenil's yes. Kenil: "Can we do the avilo build now?", then "this is for
alpha-brain" (not alpha-v2). The requirements are `requirements/avilo/AB-four-projects-scope.md`
(Vikas, 13 Oct). The fit analysis and its plan are `requirements/alpha-fit-four-projects.md`:
P1–P14, D1–D7 agreed as Q84–Q90, and "platform first, modules after". No code until his yes.*

## Where it stands

**Platform, built and committed:**
- P1 tasks with places;
- P2 runs serving tasks (with Q92 and Q93);
- P3 cards as rows, agent drafts, staged writes with Always, the removal card;
- P5 a source per value;
- P6 documents with positions;
- P7 agents woken by events;
- P8 people for real;
- P9 the Mac's contacts.

Since then, sections A–C have opened the engine's reach (scripts may reach listed hosts and ask
for others, pages may talk to the network) and made the desk the one voice.

**Platform, not built:**

| # | What | Needed by | Size |
|---|---|---|---|
| P4 | Formula fields: evaluator, dependencies, overrides keeping the computed value, checks, versions, the fx panel, Excel export with live formulas | Accounting most; DealPilot's ratios and gates | XL |
| P10 | A page as PDF; a page asks the window to open a cell | Accounting | S |
| P11 | API connectors (QuickBooks Online, Gusto, Ramp) | Accounting, when a client needs it | L |
| P12 | Money; place and the Map view; a relation with many values; a relation to a calendar event. The tree and relative date filters already exist | DealPilot (money, place), all | M |
| P13 | A kit carries its setup rows (sources, the thesis, the call guide, accounts, benchmarks) under the ownership rule; module settings with their origin; sub-modules; table names per module | shipping any of them | M |
| P14 | Readers finished: a listing's detail page, its URL kept by default, a terms and robots check when a source is added | DealPilot | S |

**Modules:** none built in alpha-brain. Deal Tracker (15 of the broker sites, read daily
2–16 Oct) went with the 18 Oct reset.

**On this Mac:**
- the reference report `requirements/avilo-dashboard-v9/index.html`;
- RestoPros' six QuickBooks exports and three Tally P&Ls;
- four practice profiles;
- the tracker's **Platforms sheet only**, as a CSV of 20 sources.

The tracker's other sheets aren't here: 2026 Search with its 18 assessed deals, Targets with
the CIM notes, 2026 goals, the call guide, and Avilo's assumptions. The scope's text carries the
thesis gates, the weekly goals and the call guide's five parts.

## The order I recommend

One module at a time, each preceded by the platform pieces it needs. So "platform first" holds
for every module, and DealPilot, your live search, comes first because most of its platform is
already built.

1. **DealPilot's platform: P14, money (from P12), P13.**
   - Readers open each listing's page and keep its URL and its own ID.
   - A source's terms and robots are checked when it is added.
   - A money field kind.
   - A kit that carries the 20 sources, the thesis and the call guide as setup rows.
   - Each piece proposed in writing first, as always.
2. **DealPilot, built by Alpha in your app.** The modules are Alpha's know-how, never patched by
   hand, so Alpha builds it from your sentences, the way `watch_from_words` proved. I give you
   the sentences and a journey, `dealpilot_sources` (scope §8.5, without what needs the missing
   sheets), proves it:
   - the 20 sources from the Platforms CSV, each with its reader, keyed on the listing's own ID;
   - Deals with the tracker's fields and stages, and the ratios as values computed by a script,
     each with its formula as its source until P4;
   - the thesis with its four gates and SBA-style financing assumptions marked as assumed,
     scored per deal ("unknown" where a value isn't listed);
   - the Funnel as a page counting this week's actuals from stage changes;
   - outreach on cards;
   - the call guide prepared before a call.
3. **P4 + P10: formulas and fx, a page as PDF and opening its cell.** The biggest single piece. It
   turns DealPilot's computed ratios into formula fields too.
4. **Accounting, built by Alpha in your app:**
   - RestoPros' six exports, read with positions;
   - a label mapping approved once;
   - the report drawn to match `avilo-dashboard-v9/index.html` (copying its look, not its
     arithmetic: the fit analysis found three errors in it);
   - Standard and Raw data as tables with fx;
   - Avilo's own capacity model from the scope §7.8.
5. **Network, built by Alpha in your app.** Your contacts are already people (651 and 18
   organisations, 19 Oct). Then LinkedIn, calendar attendees and circles in your words, with
   brokers linked to DealPilot's sources.
6. **P11** when a client needs a direct QuickBooks connection.

## For your call

1. **The order:** DealPilot first, with its platform pieces just before it (recommended), or all
   of P4, P10, P12, P13 and P14 before any module (the 18 Oct wording)?
2. **The tracker:** send the full `ETA Tracker Accounting Vikas.xlsx`, so the 18 assessed deals,
   the CIM notes, past weeks' actuals and Avilo's assumptions come in too, and the *Multiple
   over SDE* error (scope §8.6) is found on import? Without it, DealPilot starts from the
   sources and the scope's thesis, goals and call guide, with no past deals.
3. **Accounting's benchmarks** (asked at step 4, not now): the reference's restoration ranges or
   the scope's.

Each step: written first, built, journeyed, looked at in your app, committed on your word.
