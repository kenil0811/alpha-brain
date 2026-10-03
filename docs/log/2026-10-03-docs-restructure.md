# The docs take their shape (3 October 2026, late afternoon)

Kenil's yes to the checkpoint's first recommendation ("yes do it"). What changed, so a later
session knows where the old material went:

- **`docs/STATE.md`** exists: one page, rewritten every session, the state table against the
  design's order of work, what runs for real, what is wrong (measured), the pending list in
  order, the numbers from the new `just stats` recipe.
- **`docs/log/`** holds the dated history. The build plan's §4.1–§4.25 moved here verbatim,
  one file each, named `<date>-4-<n>-<slug>.md`; the build plan keeps a map from §4.N to the
  file, so every "build-plan §4.N" reference elsewhere still resolves. The checkpoint moved
  here as `2026-10-03-checkpoint.md`. The design's eighteen *As built* paragraphs moved here
  as `2026-10-03-design-as-built.md`, under their section headings.
- **The design is intent only.** Each section ends with a status box (built / differs / not
  built, as of 3 Oct); §3.4 sits before §3.5 again; §11's rows are in order; the header says
  how to read it now.
- **`build-plan.md`** keeps §2 (toolchain facts), §3 (the first slice), §5 (what to port) and
  §6 (open questions); §1 points at `STATE.md` and the log. 1,485 lines became 363.
- **`CLAUDE.md`** carries the rule in its new form: STATE rewritten, the log appended, a box
  changed when a section's state changes, numbers from `just stats`; the reading order for a
  new session is STATE → the boxes of the sections to touch → the newest log entries → git log.
- **`README.md`** maps the new places; the memory note `feedback-docs-code-sync` records why.

Measured at the end (`just stats`): 166 core tests, 3 desktop, 70 tools, 18 journeys, 77
commits (66 since 1 Oct), lint and types clean. No code changed in this entry.
