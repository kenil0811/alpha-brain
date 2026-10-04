# Quick entry on a table (3 October 2026, late afternoon; idea 10 of the port)

**What was built.** A line at the top of every table ("Add to food log in a sentence…"): the
sentence goes to Alpha as a turn in the module's conversation, prefixed with the table's name
("Add to Food Log: one banana as a snack just now"), and the row is made the one way everything
is made: by the model, through the tools, with each value known, estimated and said so, or
asked for, and the sentence kept as the row's source. The form itself writes nothing
(`modules/views/QuickEntry.tsx`). Pull request #3 had the same idea with a route of its own
that parsed the sentence into a row; on main the conversation is the route, so the panel opens,
shows the turn and the reply, and a question comes back as a question.

The plumbing: the window hands the panel a draft that says whether to send it
(`{ text, send }`); an "Ask Alpha to change this" button still puts its sentence in the
composer to finish, quick entry sends at once, and when a turn is already running the sentence
waits in the composer where the person can see it rather than being dropped. The module page
passes `onSay` down to the table page; a table page without it (a test, another host) shows no
quick entry.

**What ran.** A real trial in the browser pane against a check core (`alpha serve
--no-background`) on a fresh backup copy of Kenil's world and the dev server on 1430: typing
"one banana as a snack just now" into the food log's line opened the panel with a new
conversation on Nutrition, and 17 s later the row was there (Banana · Snack · 1 medium · 105
kcal …) with its provenance: source "USDA FoodData Central (medium banana, via web search)",
`estimated: false`, assumed "a standard medium-sized banana (~118g) since size wasn't
specified"; the table's footer went to "6 rows · 4 estimated, 2 on an assumption". Tests:
`DataPage.test.tsx` has two more (the sentence names the table and the field clears; no line
without a way to speak); 37 desktop tests, typecheck clean.

**Not done.** The sentence is sent as "Add to <table>: …" in English; the model reads it like
anything else, so a person's own language works in the sentence but the prefix is ours. A
sentence that names several rows ("three eggs and a coffee") makes what the model makes; the
line does not promise one row.
