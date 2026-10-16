# The conversation, slice 1: one reply element, real Markdown (16 October 2026)

After the OpenUI research (`../design/research/openui.md`), Kenil: "lets do it same as claude
for now, fixed set of visuals, but they should look very neat and clean and premium like claude
code", then "yes build slice one, but remember, i'm also going parallel work on agents in
another session, these changes are ui only?". The proposal is `../design/conversation-proposal.md`
(eleven fixed visuals, a pushed stream, one timeline, three slices). Slice 1 was built in
`desktop/` only; the core's part of it waits (below), so the agents session's files were never
touched.

**One reply element** (`assistant/Reply.tsx`). A reply is one element from the first words to
the journal, keyed by the sentence it answers (`turn-<said>`; the reply's entry carries it as
`data.turn`): the running turn is the last item of the same list as the turns, so when the
reply lands the element stays and only its words change; nothing is replaced, nothing jumps.
Inside it: the thinking line (a spinner and a shimmer: "Thinking", then the thought's first
sentence, then the current tool in Alpha's words, gone when the first words arrive), the step
rows (the turn's journal entries, appended, never cleared; the last three while it runs with
"all N steps", folded to "N steps" after), the text, and the meta line on hover ("13 s · 2
steps · Copy · Retry"). The words only grow (`grow`): appended when the poll's text continues
the shown one, joined on the overlap when the core kept only the tail (`partial_chars`), and
kept as the thought when the core cleared them at a tool call. `Said` is the person's sentence,
with Edit on hover (the words back in the composer; sending them is a new turn). The old
`Message`, the working bubble with its flipping headline (Thinking, Working, Writing), the
pulse and the dots are gone; `withoutCarded`, `provenance` and `retryOf` moved to
`assistant/turnWords.ts`.

**Markdown for real** (`ui/Rich.tsx`, `react-markdown` 10.1.0 with `remark-gfm` 4.0.1, pinned):
paragraphs, lists, bold, inline code, headings as small semibold sans lines (`rich__h`), links
that open outside (`target="_blank" rel="noreferrer"`, as the window's other links), tables in
the module table's look (`rich__table`), fenced code in mono with Copy, quotes. No raw HTML is
ever rendered. While a reply streams, the part up to its last blank line is rendered as
Markdown and the tail as plain text with bold and code only, so a half-written list or table
never re-flows the page. The companion's bubble renders through the same component.

**The panel** (`assistant/AssistantPanel.tsx`, 878 → 800 lines): one keyed list for the turns
and the running turn (the thread view too); the intro lines quiet (`intro`); the view follows
the content's height with a `ResizeObserver` on a new `assist__content` wrapper, because the
words now grow inside the element and not through the panel's state (found in the pane: the
table landed below the fold). `app.css`: the new rules under one comment; 25 dead rules of the
old bubbles and headline removed (Home's `working__pulse` and the shimmer stay). `ui/icons.ts`:
`Copy` and `Loader2 as Spinner`.

**Not in this slice, on purpose.** The core's part of the proposal: the pushed event stream
(`/api/turns/{id}/events`), the running character count, the text not cleared at a tool call,
`ask_person`'s `kind` and `hint`, the automatic retry, folded identical failures, and the
sentence in `turn.md`. The agents session had `api/turns.py` and `server.py` open, so they wait
for its commit. The 500 ms poll is still the source; the element and the Markdown are what
changed. Slices 2 (the timeline and the cards) and 3 (the composer) follow on Kenil's yes.

**Checked.** Typecheck clean; 208 desktop tests pass, 1 skipped (new: the renderer's table,
link, fenced code, no-HTML and streaming cases; the reply's words and steps while a turn runs
with the time and Stop and no headline; the same element from the first words to the journal's
reply; `grow` and `firstSentence`). `just check-desktop assistant`: `docs/checks/2026-10-16-1653.md`,
2 of 2 pages clean at every size. **Ran for real** in the browser pane on a copy of Kenil's
world (a core started with `alpha serve --no-background` on the copy): "Which of my deal
listings have the highest asking price? Show the top 5 as a table…" showed "Thinking" with the
spinner at 1 s, "Reading rows: deal_listings" at 7 s, and the reply at 13 s as a real table of
five rows with Website Closers as the source, in the same element, meta line "13 s · 2 steps ·
Copy" on hover, Edit beside the sentence; light and dark. Two faults found there and fixed: the
view not following the growth, and the Edit button wrapping letter by letter. **Not yet seen in
the Mac app (WebKit):** Alpha.app was running on Kenil's live world and a rebuild replaces the
bundle under it, so the WebKit look waits for his restart. One console line in the dev pane
(`createRoot` called twice) comes from Vite's reload of `main.tsx`, not from this change, and
is not in the built app.
