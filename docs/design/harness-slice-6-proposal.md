# Harness, slice 6: the window's simplification, and the model's own files

*A proposal, 18 October 2026, shown to Kenil in the chat (the file is the record). The sixth
and last slice of `alpha-harness-design.md` §18: its §10 (less, not more), with the two pieces
earlier slices left to it: the window's part of slice 5 (kits, notes and agents as text) and
the SDK's own files in a turn, with the folders the person grants (slice 1's "not built",
§3).*

## The window

1. **Agents as text, like skills.** An agent's page shows its file (`agents/<name>.md`: the
   schedule, state, steps or run skill, what it may write; the brief as the body) as one
   editable text with Save, Versions and Undo (the file is committed in the module's repo, as a
   skill's is). The rename box, the schedule field and the brief box go; Pause, Run now and
   Rename stay as buttons. Its runs and their verdicts stay below, as now.
2. **The module page = tables · notes · skills and agents · files · Activity.** Notes is
   `NOTES.md` as editable text. Skills and agents are two lists that open their text pages.
   "Export as kit…" at the top (the kit's path shown, Reveal in Finder, and what crosses out
   of the module if anything). Counts are of the person's rows, as since 16 Oct.
3. **Needs you holds only what needs you**: questions (a yes/no offer is a question) and
   permission cards. Agents' findings, Watson's notes and Sherlock's suggestions live on their
   pages and the module's notes, never in the timeline. (4b did Watson's facts; this finishes
   it: Scout's costly pick becomes a question card with Take and Not now.)
4. **Settings** gains **Folders**: the folders Alpha may reach, each with Remove, an "Add a
   folder…" picker, and one switch, "The whole Mac: Alpha may read any folder (never write
   outside its own)". And **Modules** gains "Install a kit…" (a folder picker; the install's
   words shown). Nothing else technical.
5. **The forms that go** are the ones that describe Alpha's own things (an agent's fields; a
   skill's went in 2b). Forms for your data (a row, a table's fields) stay: they are yours.

## The model's own files in a turn

Today a turn reaches files only through `world_file` and the browser. With this slice a turn
also has the SDK's own `Read`, `Glob` and `Grep` over the folders in Settings › Folders (or
the whole Mac when that switch is on), and `Write` and `Edit` inside the module's own
directory only (`modules/<id>/`: its notes, its skills' scripts, its agents' files), through
the SDK's `add_dirs` and the permission callback (a write anywhere else is refused in words).
No shell yet: `Bash` needs the sandbox and is its own slice. The pre-pack says which folders
are granted; nothing is reached that was not.

## What stays the same

The rail and the look (Kenil, 1 Oct); the conversation as built; the tables' views; the kit's
mechanics (slice 5); the hands.

## Journeys and checks

The desktop check (`just check-desktop`) on every changed page, light and dark, both sizes;
the full sweep's hang of 17 Oct looked at and fixed on the way. A journey `files_in_a_turn`
on a fresh world: a folder granted, "what's in my notes folder about the car wash" answered
from a file read with the SDK's Read, and a write outside the module's directory refused.

## Size

Five days: agents as text and the module page two; Needs you and Settings one; the model's
files with their tests and journey two. Two commits as before (core, then window).

## Questions

1. The model's files: read any granted folder, write only inside the module's directory, no
   shell yet. Yes?
2. "The whole Mac" as one switch in Settings (reading only), or folders one by one only?
   I would offer both: folders by default, the switch for you.
3. Scout's costly pick as a question card (Take · Not now) rather than a proposal: yes?
