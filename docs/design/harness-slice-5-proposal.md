# Harness, slice 5: modules as directories, and kits

*A proposal, 18 October 2026, shown to Kenil in the chat (the file is the record). The fifth
slice of `alpha-harness-design.md` §18: its §5 (a module is a directory the model owns) and
§15 (shipping to the first users, Q53's kits). The tables stay in the world; the directory is the
module's shape, and a kit is that directory with no data in it.*

## What a module's directory becomes

Today `modules/<id>/` holds the skills (since 2b) and leftovers of the old builds
(`WORKFLOW.md`, `PROGRESS.md`, `parts/`, `workflow.json`, `inputs/`). After this slice:

```
modules/<id>/
  module.yaml        the module's shape: name, goal, parent, its tables with their fields,
                     identity and title field, its saved lists; written by the core from the
                     world whenever any of it changes (the world stays the truth)
  NOTES.md           the module's page: what it is for, what was decided, what is open
                     (today the note "module:<name>"; the same text, as a file both ways)
  skills/<name>/     as since 2b
  agents/<name>.md   each agent: its schedule, steps or brief, what it may write, as a file
                     the person and the model can read and edit; the row in the world follows
                     the file (as skills do), and the file the row
  documents/         the files Alpha fetched or the person added (data: never in a kit)
```

and at the root `ALPHA.md`: the standing instructions and the person's preferences in their
words (today the note "Standing instructions"), read at the start of every turn, shown and
edited as text on the Intelligence page. The old build files are left where they are and
never exported; a later clean-up removes them.

## Kits

- **Export**: `alpha kit export <module> [--to folder]`, and a button on the module's page
  ("Export as kit…"): a folder `<Name>.alphakit/` holding `kit.yaml` (name, version, made in
  which world, when), `module.yaml`, `NOTES.md`, `skills/`, `agents/`, and a `files.sha` listing
  every file's hash. Never the tables' rows, never documents, never sign-ins.
- **Install**: `alpha kit install <folder>`, and Settings › Modules › "Install a kit…": the
  module is made (its tables empty from `module.yaml`, rows identified as people where the
  yaml says), the skills and agents copied, the agents **paused** until the person turns them
  on (a reader of a site needs their sign-in first; the module's page says which). A journal
  line and a card: "Installed the kit Job search (v1): 2 tables, 1 reader, 1 agent. Its agent
  is paused until you sign in to linkedin.com and turn it on."
- **Update**: installing a newer version of the same kit replaces the files nobody changed
  since the install (the hashes say which) and keeps the ones the person or Alpha changed,
  naming them: "Kept your version of skills/linkedin_connections (changed 20 Oct)". Q53's
  ownership rule, as written.
- **Shipped inside the app**: `just ship --kit <folder>…` puts kits into the bundle; on the
  first open of a fresh world they are installed and the card above shows. This is how your
  first users get their modules.

## What stays the same

The world's schema, the tables, the journal, the hands (a module's files are reached through
`world_file` and the skills' and agents' own hands; no new hand), the module page's tables.

## Journeys

`kit_roundtrip`, two fresh worlds: in the first, "watch We Work Remotely for back-end roles"
(a module, a table, a reader, an agent) then export; in the second, install; checks: the
module and its empty table exist, the reader and the agent are there and paused, the card
says so, a run of the agent after "turn it on" reads rows. And `kit_update`: the same kit
installed twice with a changed skill in between, the person's change kept.

## Size

Four days: the directory (`module.yaml`, `NOTES.md`, agents as files, `ALPHA.md`) two; export,
install and update one; the window's two buttons, the module page's notes and agents as text,
and the ship flag one. Two commits as before.

## Questions

1. Agents as files now (editable like skills), or only inside `module.yaml` for shipping?
   I would do files: one shape for everything the model makes.
2. A kit as a folder (`Name.alphakit/`) or a zip? A folder is readable and diffable; a zip
   travels by mail. I would export the folder and zip it on request (`--zip`).
3. Installed agents start paused until you turn them on: yes?
