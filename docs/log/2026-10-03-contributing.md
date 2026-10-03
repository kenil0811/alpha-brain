# The contributor's guide (3 October 2026, evening)

Kenil: "update the claude.md and other docs on good code structure and practices and
philosophy, because other people are going to be contributing to this project as well, and we
want it to be aligned."

`CONTRIBUTING.md` at the root is the long form: the philosophy as engineering rules (nothing
per use case; mechanisms, not prompts; no knobs or caps; known, assumed or asked; verbatim
first; Alpha repairs its own know-how; plain words; "it ran" is not "it works"), the layout
and where a change goes, the conventions for Python, the store, journaling, tools, prompts,
concurrency, errors, the desktop and the host, how testing works at the three levels, the
documentation rule, the workflow and definition of done, and how agent sessions are kept
honest. `CLAUDE.md` gained a "How we write code" section as its short form; `README.md`
points at both. Every convention in the guide describes what the code does today; the two
that are not yet true everywhere (error states with retry, polls paused when hidden) say so.
No code changed.
