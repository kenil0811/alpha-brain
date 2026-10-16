# The conversation, a fixed set of visuals done well (proposal, 16 October 2026)

Kenil, 16 Oct, after the OpenUI research (`research/openui.md`): "lets do it same as claude
for now, fixed set of visuals, but they should look very neat and clean and premium like
claude code", and before that: "very seamless and clean ui, not laggy, not jittering, giving
proper cards/options/selectors/etc like claude, thinking properly".

This is the proposal: what changes and how, in main's own design and kit (Q42), nothing drawn
by the model, built one slice at a time on his yes, each seen in the Mac app before it is
shown, committed after his review. Nothing here is built yet.

## 1. The vocabulary

Claude Code's interface is a few fixed surfaces, each drawn the same way every time. Alpha's
conversation gets the same discipline: eleven visuals, all from the kit and the tokens, the
same in the panel, on the Assistant page and in the companion's bubble.

| # | Visual | What it is |
|---|---|---|
| 1 | The person's sentence | A quiet block on the right, tinted `--primary-soft`, no tail, pre-wrapped. Hover: Edit (the words return to the composer; sending is a new turn). |
| 2 | Alpha's reply | Full width of the reading column, no bubble, Markdown rendered for real: paragraphs, lists, **bold**, `code`, headings as small semibold sans (serif stays for its four places), links, tables in the module table's look, fenced code in mono with Copy, quotes. The one renderer everywhere (`ui/Rich.tsx` replaced, the companion included). |
| 3 | The step row | One line per tool call, in order, inside the reply block above the text: a 14 px icon (done, failed, or a quiet spinner for the current one), the step in Alpha's words ("Reading rows in Deal Tracker"), a dim duration when known. Collapsed to "4 steps" with the current step visible while the turn runs; a chevron opens them; after the turn, folded to the count. Rows only ever append. |
| 4 | The thinking line | One dim line with a slow shimmer: "Thinking" until the first thought, then the thought's first sentence; it stays in place while the next step starts and disappears when the first words of the reply arrive. Never a headline that flips between Thinking, Working and Writing. |
| 5 | The question card | The card Alpha asks with (`ask_person`, or the mechanism of Q35). A small eyebrow "Alpha asks", the question in reading size, the options as rows with a radio dot (or ticks when several may be chosen), "Say it your way" as the last row, Answer and Skip. Keys 1 to 9 pick, Enter answers. Several questions in one turn are one card with numbered sections (as today). Once answered the card folds to the question and the chosen words, dimmed; the answer shows as the person's sentence. |
| 6 | The action card | As today (the exact text, the dry-run screenshot, what it reaches, Undo, Do it / Always allow / Change / Not now), in the same card frame as 5: eyebrow, title, body, a row of buttons; the badge in the frame's corner. No change in behaviour. |
| 7 | The workflow page card | As today, in the same frame. No change in behaviour. |
| 8 | The thread row | A build or an agent's thread as one compact row where it started in the conversation: title, state badge, the live step in words while it works, "open". Not a block pinned above the conversation. |
| 9 | The didn't-work row | A `failed` entry as a quiet row, not a red bubble: an x icon, the sentence, Try again when the turn can be redone. Consecutive identical failures fold into one row with a count ("×6"). |
| 10 | The reply's meta line | Under a reply, dim and only on hover: "12 s · 4 steps · Copy · Retry". Retry only where it is offered today (a turn that ended without a reply). |
| 11 | The composer | One rounded box: the text area grows from one to six lines; below it one row with a plus for files, the mic, "@" offering agents as today, and a round send button with an arrow; under the box "Uses your Claude subscription" (§8) and the key hint. Enter sends, Shift+Enter a new line. |

Everything is placed in one timeline, in the order it happened: sentences, replies, steps
inside their reply, question cards where they were asked, action and workflow cards where
they were proposed, thread rows where a thread began, failures where they failed. Today the
panel draws threads on top, then turns, then every workflow, action and ask at the bottom,
whatever the order.

Not in the vocabulary, on purpose: anything the model draws (the research says why), long
replies folded (a premium reply is read, not unfolded; this departs from Q35's list and is
Kenil's call), bubbles with tails, decorative motion. Motion is a state change only:
the shimmer of the thinking line, the spinner of the current step, a 150 ms ease-out when a
card or row appears; the reduced-motion setting turns them off, as the stylesheet already
does for everything.

## 2. Why it is laggy and jittery today, and what fixes it

Measured and read in the code, not guessed:

- The window asks `/api/turns/{id}` every 500 ms while a turn runs and re-renders the whole
  partial reply from a fresh object each time; the headline is recomputed on every poll
  ("Thinking" for the first two seconds, then the latest step, then "Writing"), so it
  flickers between states; a tool call clears the partial text (`LIVE.note(partial="")`), so
  text the person was reading vanishes; when the turn ends, `load()` refetches the
  conversation and the working bubble is replaced by a new element for the reply, so the page
  jumps; the scroll-stick then jumps to the bottom; cards arrive at the end of the list and
  push things.

The fix is a pushed stream, append-only rendering and stable elements:

- **Core:** `GET /api/turns/{id}/events`, a `text/event-stream` response (FastAPI's
  `StreamingResponse`, an async generator). It looks at `LIVE.progress_for(said)` and the
  turn's journal entries every 100 ms in-process (no new threads, no pub/sub; a dict read
  under the existing lock) and emits only what changed: `text` (the new characters; `Live`
  keeps a running count of characters written so the suffix is exact even past the 20,000
  kept), `thought`, `doing` (the current tool in words), `step` (a journal entry of this turn:
  kind, text, at), `state` (routing, running, asked with its options), and `done` (the final
  state, the reply's journal id, duration). `GET /api/turns/{id}` stays as it is for the
  companion, Home and the fallback.
- **Window:** `client.followTurn(id, onEvent, signal)` reads the stream with `fetch` and a
  `ReadableStream` (the token travels in the header as every call does; WebKit reads streams
  fine). `askAndWait` and `waitTurn` keep their polling as the fallback when the stream drops
  or the core restarts (the lesson of 3 Oct stays: one missed answer never ends a turn). One
  stream per running turn; the one change poll is untouched.
- **Rendering:** a reply is one element from the first event to the journal, keyed by the
  turn id: the thinking line, the step rows and the text live inside it; text is appended to
  a string, and the Markdown renderer is fed the stable part (everything up to the last blank
  line) plus the tail as plain text, so a half-written table or list never re-flows the page.
  When `done` arrives the text is swapped for the journal's (the same words, nothing moves)
  and the meta line fades in; the `load()` after a turn only brings cards and asks, which
  land in the timeline below the reply. A tool call no longer clears text: what was written
  before a step stays as the thought line's source and the reply text starts when the final
  text block starts, which the stream already distinguishes (`content_block_start`).
- **Scrolling:** follow the newest words only while the person is within 80 px of the bottom
  (as today), and never jump on the replacement, because there is no replacement.

## 3. The core's part, small

- `ask_person(question, options, kind="one" | "several", hint=None)`: `kind` for the card's
  rows (radio or ticks, the answer joined with ", " for several), `hint` for the free-text row
  when the question wants a number, a date or a name ("a number of days"). The journal's
  `asked` entry carries them; `/api/asks/{id}/answer` is unchanged. The mechanism of Q35 keeps
  making cards for questions left in prose, with `kind="one"`.
- `GET /api/turns/{id}/events` as above; `Live.add_text` keeps the running count.
- One automatic retry (pending from Q35): when a turn fails before any tool wrote anything
  and the failure is the route's (the CLI did not answer, the stream broke), `turns.ask`
  runs it once more and the window shows "Trying again" in the thinking line; a turn that
  wrote something is never rerun (the "log two eggs" rule in `retryOf`).
- Consecutive identical `failed` lines: folded in the API's conversation view with a count,
  the journal untouched.
- `turn.md`: one sentence added, that tables and links render, so a comparison may be a
  table. Nothing else in the rules moves.

## 4. The window's part

- `assistant/AssistantPanel.tsx` (878 lines) split by visual: `Timeline.tsx` (the ordered
  list), `Reply.tsx` (visual 2 to 4 and 10), `AskCard.tsx` (5), `ThreadRow.tsx` (8),
  `FailedRow.tsx` (9), `Composer.tsx` (11); `Conversation` keeps the state and the stream;
  `ActionCard` and `WorkflowCard` take the shared card frame (`ui/Card.tsx`, a new kit
  primitive with its test: eyebrow, title, badge slot, body, button row). Home's Needs-you
  lane and the companion's bubble use the same pieces, so they change with them.
- The Markdown renderer: `react-markdown` with `remark-gfm` (MIT, no raw HTML rendered, so
  nothing a page or a document says can inject markup), with Alpha's own components mapped for
  table, code, link, heading and list, in the tokens. Two packages, about 150 KB. The
  alternative is to grow the hand-written `Rich` with tables, links and fences, which will
  keep missing cases; the proposal is the library, and it is Kenil's call (§6).
- Styles: in `app.css`, `block__element` classes, sizes from the seven-step scale (reading
  text `--text-base`, meta `--text-xs`, steps `--text-sm`), colours from the tokens, light and
  dark both. The panel keeps its 380 px, the Assistant page its 860 px reading column.

## 5. In what order, and how each is judged

| Slice | What | Judged by |
|---|---|---|
| 1. The feel | The event stream in the core and the window; one reply element with the thinking line, step rows and appended text; the real Markdown renderer; the person's sentence and the meta line (visuals 1 to 4 and 10). | Core tests with the fake runner (events in order, the suffix past the cap, the fallback); desktop tests (text appends, nothing re-mounts, the stable prefix); `just check-desktop`; the `question_card` and conversation journeys; the first words' time (`first_text_ms`) unchanged or better; the requests during a turn from two a second to one stream; seen in the Mac app on a copy of Kenil's world, light and dark, at 1100×560 and his size; then Kenil's own turns. |
| 2. The timeline and the cards | One ordered list; the card frame; the question card with kinds and keys; thread rows; didn't-work rows folded; action and workflow cards in the frame; Home's lane and the companion follow (visuals 5 to 9). | Desktop tests for the order and the folding; core tests for `kind`, `hint` and the folded failures; the check; seen in the app; a real question from a real turn answered by key. |
| 3. The composer and the mechanics | The composer; the plus for files (through `addFiles`, as a drop does today); Copy; Edit on the person's sentence; the automatic retry; Stop as today. | Tests; the check; seen in the app; a file sent through the plus arrives as a turn. |

Each slice is about a day; each goes in its own commit after Kenil has seen it in the app; the
log, STATE, the design's §8 box and a Qn row record the decision.

## 6. Kenil's calls before slice 1

1. The person's sentence: the tinted block on the right as proposed, or Claude Code's quiet
   grey block on the left margin? (Proposed: the tinted block, so the two voices read apart.)
2. The Markdown renderer: `react-markdown` + `remark-gfm` as proposed, or `Rich` grown by hand?
3. Long replies: not folded, as proposed (a departure from Q35's list)?
4. Thread rows in the timeline instead of blocks on top, as proposed?
