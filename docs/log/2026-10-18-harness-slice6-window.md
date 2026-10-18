# 18 October 2026 — harness slice 6, the window: agents as text, the module page, Folders and kits

The window's half of slice 6 (`../design/harness-slice-6-proposal.md`), after its core
(`2026-10-18-harness-slice6-core.md`). Less, not more (§10).

## What changed

- **An agent's page shows its file** (`AgentPage`, "Its file"): the schedule, state, steps
  or run skill and what it may write in the front matter, the brief as the body; one text
  with Edit, Save and Cancel (`GET/PUT /api/agents/{id}/text`; an edit is taken like an edited
  file, the row follows it). The brief box and its "Ask Alpha to write it" go; "What it does"
  stays only as the steps read out when there are some; Rename, Pause, Run now, Stop and
  Delete stay as buttons; the runs, the decisions and the look as before.
- **The module page** gains two tabs beside its tables: **Notes** (`NOTES.md` as text, Edit
  and Save; `GET/PUT /api/modules/{ref}/notes`) and **Skills & agents** (the module's skills,
  each opening its text page; its agents as the list that was already there, each opening its
  page). On the Summary, **Export as kit…**: the kit's path, version and file count, and
  whether it is standalone or what crosses out of the module.
- **Settings** gains **Folders** (the folders Alpha may read, and the one switch, "The whole
  Mac: Alpha may read any folder (it never writes outside its own)") and **Kits** (a kit's
  folder typed, Install a kit, the install's words shown). Nothing else technical.
- The forms that described Alpha's own things are gone with the brief box; the forms for the
  person's data stay.

## Proven by tests

Typecheck clean; the window's tests pass (the Settings cards' list, the agent page's file
with the brief in it, Doc's page), 219 of them.

## Looked at

The desktop page check on a copy of Kenil's world, Home, Settings, the Assistant page and every
Intelligence page, both sizes, light and dark: the first run (`../checks/2026-10-18-1438.md`)
found one thing on every page, a long item title in the panel's quiet "Sent to …" row running
past the right edge (shortened); the second (`../checks/2026-10-18-1440.md`, 16 of 19 clean)
found an agent's page failing with "There is no skill 'run_monday_linkedin_connections'": the
check's copy of the world carried no skills or module files (the suite's copy now carries
them), and the page itself now opens with a missing run skill rather than failing; the third
(`../checks/2026-10-18-1442.md`): 15 of 15 Intelligence pages clean. Kenil's own look is the
acceptance.
