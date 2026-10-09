# The owner's third review of the window (9 October 2026)

Vikas asked to fix what was left in the window (section F of `design/core-changes-for-the-window.md`),
to make Task manager and Network pre-built projects (shipped on install, otherwise ordinary:
renamable, deletable), Governance as Allowed / Denied tabs (a screenshot), type and spacing 30%
larger, a page for every item including Activity, Add goal / agent / automation, Alpha as one of
the agents, an explanation of Intelligence's "Inside", and Task manager specified as a core
change in this app's structure. Same branch and limits (window only).

## What was built

- **Sizes:** type 14/16/17/18/21/26/34 px (body 18) and spacing 5/10/16/21/26/31/42/52/62 px, i.e.
  1.3 × the 9 Oct values; `--header-h` 68, icons 18/21 (and `ICON_SM`/`ICON` to match); every
  hard-coded padding, margin, gap and small size in `app.css` ×1.3; row-height fallbacks too.
- **Governance:** a shield-check title, then **✓ Allowed n** / **⊘ Denied n** tabs (accent
  underline), "Nothing allowed." / "Nothing denied.", rules as editable sentences with ×, and a
  dashed "+ Add allowed action" / "+ Add denied action" (same `governance_rules`; Always → Allowed,
  Never → Denied); what it keeps, where it reads from and where it sits below. Network uses it.
- **Intelligence:** one tab "Agents and automations" with "Alpha — your assistant" as a row among
  the agents (also first in each project's Agents and automations); Add goal, Add agent, Add
  automation open a describe box that sends to Alpha; the project's "Inside · n" is now
  **"Sub-projects · n"** (the projects nested inside this one).
- **A page for everything:** Activity entries open `#/activity/<id>` (what, who, when, project,
  what it touched, the change in plain words "Meal: empty → jknjk", Try again for automations);
  built-in skills have pages; a person or company in a relation opens its Network page; Form has
  Open; a calendar day's "+N more"; empty space in a file cell opens the record.
- **Section F:** Calculate is the standard dropdown (its star sets the default for the column
  type); Wrap text is a switch; "Download ›" is a real side submenu; the brain view is one Tab
  stop with arrows, Enter and announcements, and pinch on touch; the leave-guard props are gone.
- **Network in the sidebar** among the projects with a project's menu (Rename, Delete and Move
  disabled with their reasons); reorderable.
- **Docs:** the rulebook (pre-built projects, Task manager, Governance tabs, "everything listed has
  a page", the sizes; the module→project rename now also at sentence ends); the core list gained
  A6 (pre-built projects), D11, D12 and section T (Task manager in full).

## What ran

- `just test-desktop`: typecheck clean; 313 tests in 48 files pass, 1 skipped.
- **In a browser** (Vite 1430, the scratch core): body at 18px; Deals with Governance's
  Allowed/Denied tabs and no "Inside"; an activity page; Intelligence's tabs and Alpha as a row in
  Agents and automations. Screenshots weren't possible (the preview pane was hidden); checked by
  reading the page. Fixed while looking: the activity page repeated "You" and showed the change as
  JSON.
- **Not run:** the Tauri app (sidebar drop), `just check-desktop`, the journeys.

## Left

The core list (`design/core-changes-for-the-window.md`): A6 and T for the pre-built projects and
Task manager; D11 and D12 for adding and paging goals, agents, automations and old activity.
In the window: the sidebar drop in WebKit untried; cards of window-built lists look clickable with
no page.
