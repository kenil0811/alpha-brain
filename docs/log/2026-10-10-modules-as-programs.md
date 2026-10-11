# Modules as programs (10 October 2026, Q38): the decision, no code changed

Kenil, after the second car wash build (the research pass of Q37 ran for real: 63 findings
from 41 pages, a grounded plan of 12 pieces; the build then made one table of 22 columns, one
row and a recipe in the note, retried a refusing service ten times, and reported "built and
verified"): "before we go deeper into applying patches and fixes, i want to once again take a
step back and think of a proper long term and effective solution for our builder and alpha in
general … look at the module generated in the project waterways by my friend, it has
structured data, properly segregated and stored, and a user would be able to follow through
with it with little help … okay if its not all done in a single prompt / single shot, but it
should be like this." And, before the design: "look up some best open source solutions and
technologies that are being used currently. I dont want to reinvent the wheel."

**What was read.** The Waterways engine (`~/Desktop/dev/project-waterways-main-2`: 43 engine
modules, 7,800 lines of Python, 22 documents, the handover): per-metro layers as GeoParquet,
DuckDB spatial, gates from the client's own process then a weighted score, TAQ fitted to four
benchmark stores, every parameter on a settings page, a 75-row report with source, method and
confidence per row, a map, saved lists (copied from Alpha), a pipeline board, exports; built
over a week with the human steering at each stage. The diagnosis: Alpha's module is tables
plus prose; its three kinds of know-how cannot hold a data layer, a join, a gate, a formula or
a calibration; the build rule itself says to write those as prose; the plan was one card; the
only surfaces are tables.

**Decided** (four yeses, then the prior art, then the design in §6.4 and Q38): a module is a
workspace Alpha codes in, inside Claude Code's own sandbox driven by Alpha's settings; a design
document agreed stage by stage; milestones one per fresh session, each ending in a real result
the person opens, done decided by a separate evaluator with scripted checks first; a page
contract of five kinds rendered by the shell; the data layer's defaults from the prior art.

**The prior art** (`../design/research/modules-as-programs.md`, four passes, one of which
probed Claude Code 2.1.278 on this Mac): the sandbox works with the flags Alpha already passes
(writes outside the folder and outbound network refused); Codex and Gemini CLI use the same
mechanism; containers and VMs are not practical on a person's Mac; Anthropic and OpenAI both
converged on the same three artifacts and a fresh session per milestone; 75.8% of coding
agents' "done" claims were false in one study and a standalone skeptical evaluator with
scripted checks is what works; DuckDB with GeoParquet and Hamilton is the light, local data
layer, with `census`, `pygris`, `overturemaps`, `esridump` and OSMnx to reuse; a small owned
page contract beats embedding apps; MapLibre with PMTiles and OpenFreeMap works offline.

**Not done:** any code. The order of work and the first slice are the next decision (STATE,
pending item 1). The car wash ask is the worked example in §6.4 and its M0 is the acceptance
of the first slice.
