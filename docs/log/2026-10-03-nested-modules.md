# Modules inside modules (3 October 2026, night; Q31)

Kenil: "can we discuss and add support to adding nested projects/modules?" The discussion:
projects were planned on 29 September as an optional grouping, the conversations round on
3 October decided "no projects above modules" for routing's sake, and the modules table carried
an unused `project` column. His answers: what he nests is an area with parts ("it would be like
job, it would have search module, resume module, etc"); one concept, not two; a parent's
conversation reaches its children; any depth "if it doesnt add too much complications". Q31.

**One concept.** A module has a `parent` (a column added on open, idempotent), to any depth;
nothing is per level. `modules.create(parent=…)`, `move` (never inside itself or anything
below it), `children`, `subtree` (a recursive query, parents before children, by name), `path`
and `path_words` ("Job › Search"). What a module owns stays its own: tables, automations,
sources, pages, goals.

**A parent is the place that holds its children.** Its page shows them ("Inside Job": each with
its goal, tables and what it holds, Open); its activity is the subtree's (the journal reads a
set of modules); its summary rolls the subtree's tables, automations and goals up; its
automations and sources list the subtree's; its conversation is scoped to it and the pack lists
the tree with the sentence's own branch first (`- Module Job … holds Resume, Search` then the
children indented, each with its tables), so a question asked on Job sees Search's openings.
The maps draw a child inside its parent (an `in` edge). Removal takes the subtree, each module
with everything of its own, and says what went inside. A conversation's scope reads as the path.

**For Alpha and for the person.** `module_create` takes `parent`; `module_move` puts a module
inside another or at the top, on the person's ask; `modules_list` says each module's path. The
window: the rail shows the tree, folded or not per parent (remembered per window); a module's
page has crumbs to its parents, the Inside section, and in Settings "Where it sits" (a list of
every module it could go under, never itself or what it holds); Home shows the top-level modules
with "N modules inside"; ⌘K and the panel say the path. `POST /api/modules/{ref}/move`.

**Checked.** Core: a module inside another to any depth, the move's refusals, the parent's
page/summary/activity reaching what it holds, the pack and the map showing the tree, removal
taking the subtree; 204 core tests. Desktop: the tree from flat cards (an orphan shown at the
top, not lost), the rail's fold and unfold; 76 desktop tests. Lint, mypy and typecheck clean.
Journey `nested_modules` (the Job area with Search and Resume inside, proposed then built after
the yes), on a copy of Kenil's world (`docs/journeys/2026-10-03-2211.md`): passed, 1 of 1. Alpha
proposed "Job area: Search + Resume modules" (81 s), built it in 71 s: made Job, moved the
existing Job Search under it with its 118 listings, automation and goal untouched, and made
Resume inside Job with a table for resume versions; the checks found Job Search at Job › Job
Search and Resume at Job › Resume. One thing it said in passing and is true: Alpha cannot rename
a module, so the part kept its old name under the new path; a rename is a small missing tool.

**In the window, for real.** The app rebuilt and restarted. A copy of Kenil's world with Job
Search and a new Resume moved under a Job module, served to a Vite build in the browser pane
(Chromium): the rail shows Job with Job Search and Resume nested under it and a fold on Job; the
Job page says "Inside Job: 2 modules; what you ask here reaches them all" with both as cards,
and its summary rolls up Job Listings' 118 rows from the child; the panel says "I'm looking at
Job and what it holds"; Job Search's page carries the crumb "Job ›" and, in Settings, "Where it
sits: Inside Job". `just check-desktop home settings`: 2 of 2 pages clean at every size
(`docs/checks/2026-10-03-2212.md`).

**Redone after Kenil saw it** ("very bad looking"; "what if i want a new parent module? eg. i
want to create avilo and have deals and advisory in it"). "Where it sits" was a bare native
select on a card; it is now a list card in the kit's own rows: the module with where it sits and
a Move… menu (a new module above it…; to the top level; Inside: every module it could go under,
by path), and a second row, Inside it, naming what it holds with a Move a module in… menu (every
module that could come in: never itself, what is already here, or anything above it). "A new
module above it…" asks for a name in the row, makes the module where this one sits (the window's
own `POST /api/modules`, journaled as "You made the module Avilo."; nothing is built, so it
needs no plan) and moves this one into it; the others move in from its page or from theirs. So
Avilo over Advisory and Deal Tracker is: Advisory › Settings › Move… › a new module above it
"Avilo", then Deal Tracker › Settings › Move… › Avilo. Looked at in the browser pane on the
nested copy: the rows and the menu match the rest of the window. 205 core tests.
