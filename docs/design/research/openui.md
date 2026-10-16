# OpenUI 1.0 and Alpha's conversation (research, 16 October 2026)

Kenil, 16 Oct: "openui just released v1.0. It looks very promising. I want to inspect and
research and consider how/if we can use it in alpha. Our current UI, especially the chat part,
is really not optimal." This note is the research; nothing was built. V = verified from the
source, the docs, the repository or a measurement here; S = secondary; I = inference.

**Ran for real:** 23 Alpha-like prompts through the same `claude -p --append-system-prompt`
route Alpha uses, with OpenUI's generated prompt, on Sonnet and Haiku, parsed with OpenUI's own
parser (`@openuidev/lang-core` 1.0.1). Section 3 has the numbers. Not done: nothing rendered in
the WebKit app; the prompts did not include `turn.md`; one run per cell, so every number is a
sample, not a distribution.

## 1. What OpenUI is (V)

- `thesysdev/openui`, MIT, "the open standard for Generative UI". 11,230 stars, 755 forks,
  163 open issues, first commit December 2024, releases nearly daily. Behind it is Thesys Inc.
  (San Francisco, about 20 people, a $4M seed in November 2024 led by Together Fund with 8VC,
  S) whose paid products sit on top: **Gateway** (an OpenAI-compatible proxy that validates and
  fixes OpenUI Lang while it streams), **Autofix** (repair a finished generation), **Reliability
  Monitoring** (a cloud dashboard of failures) and the older **C1** API. The docs recommend the
  Gateway on nearly every page; the open-source parts work without it.
- **The idea.** The model's reply is a program in a small line-oriented language, OpenUI Lang:
  `identifier = Component(arg, arg, ...)`, positional arguments mapped by Zod key order, forward
  references allowed, `root` as the entry. The application defines the component library
  (`defineComponent` with a Zod schema and a React renderer per component); a prompt is
  generated from that library; the model writes programs restricted to it; a streaming parser
  re-parses the text as tokens arrive and the `Renderer` maps the tree onto the application's
  own components. Unknown components and bad props are dropped and reported through `onError`;
  the rest renders.
- **Version 1.0 (lang-core 1.0.1 and react-lang 1.0.1, published 15 Oct 2026).** Custom `@`
  functions and actions, `library.extend`, one action without the `Action([...])` wrapper, a
  `]]>openui:` message format for storing a reply with its form state, the `root` entry rule,
  new error codes. The chat packages are not at 1.0: react-ui and react-headless are 0.18.1;
  Vue, Svelte and Angular are 0.4 and lack the 1.0 features. The language spec is "1.0 extends
  0.5".
- **Modes that matter for Alpha.** *Inline mode*: the model answers in prose and puts a program
  in a ```` ```openui-lang ```` fence only when it wants UI; text outside fences is chat. *Edit
  mode*: the model writes only the changed statements and `mergeStatements` patches the
  previous program. *Queries and mutations*: a program may declare `Query("tool", args,
  default)` and `Mutation(...)` that the renderer runs in the browser against a function map or
  an MCP client, so a generated dashboard refreshes and filters without a model turn.
  *Reactive `$variables`* bind inputs to expressions.
- **Agent Interface** (`@openuidev/react-ui`): a complete chat shell (sidebar, thread list,
  composer, tool timeline, artifacts panel, router) fed by two adapters: `ChatLLM` (a POST to
  your route whose streamed body a *stream adapter* turns into AG-UI events; adapters exist for
  OpenAI, Vercel AI SDK, LangGraph, Eve and raw AG-UI; **none for Anthropic**, the docs show a
  route translating Anthropic's stream into AG-UI by hand) and `ChatStorage` (five REST
  endpoints for threads, three for artifacts). Without storage it keeps threads in memory.
- **Packages and weight.** `lang-core` 1.4 MB unpacked (parser, prompt generator, runtime,
  install telemetry), `react-lang` 370 KB (the Renderer; peers: react, zod, the MCP SDK),
  `react-headless` 857 KB (chat state; peers zustand and the Vercel `ai` package),
  `react-ui` 16 MB with fifteen Radix packages, TanStack Table, d3, date-fns, lodash-es,
  lucide, react-markdown with remark and rehype (KaTeX), a syntax highlighter and a date
  picker. Weekly npm downloads: lang-core 248k, react-lang 197k, react-ui 61k.
- **Telemetry.** `lang-core` sends an install ping by default (random id, versions, CI flag);
  `OPENUI_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1` turns it off. Runtime telemetry is off
  unless enabled.
- **Claims and their basis.** "Up to 67% fewer tokens than JSON" is measured against two
  JSON UI formats (Vercel json-render, Thesys C1) and YAML on seven generated pages, with the
  code in `benchmarks/` (V). It is not a claim against Markdown or prose. Their reliability
  benchmark says OpenUI completed 92.9% of tasks and "even its strongest model pairing reached
  99.5%, not 100%", which is the argument for Gateway and Autofix (S, their blog).
- **Telling open issues.** #582 (May): invalid lines are skipped silently and the parser
  reports no error, so "Here is the response:" before a program vanishes without trace. #355
  (March): the chart component crashed during streaming on partial data. #990 (August): a
  render loop in the assistant-ui integration on chart-heavy replies. #1385 (12 Oct): the
  built-in chat library and its prompt are being reworked, renaming `TextContent` to `Text`,
  `MarkDownRenderer` to `Markdown`, removing and archiving a dozen blocks. The language is
  1.0; the built-in library is not settled.
- **Neighbours.** Google's A2UI (Apache-2.0, JSON messages, v0.9.1 stable and v1.0 a release
  candidate, renderers for React, Lit, Angular, Flutter) and Vercel Labs' json-render
  (Apache-2.0, January 2026, JSON patches against a Zod catalog, React, Vue, Svelte, Solid,
  React Native). Both are JSON; OpenUI's token advantage over them is plausible for that reason.
  OpenUI is the only one of the three with an inline prose-plus-UI mode, and the only one
  tested here with Claude.

## 2. Alpha's conversation today, as the code has it (V)

- One component, `desktop/src/assistant/AssistantPanel.tsx` (878 lines), is both the side
  panel and the Assistant page. A reply is rendered by `ui/Rich.tsx`, which knows paragraphs,
  `-` and `1.` lists, `**bold**`, inline `code` and headings as bold lines. **A Markdown table,
  a link, a fenced code block or a heading level shows as raw text.** Nothing in `turn.md`
  tells the model not to write tables; in the control run below Sonnet reached for a Markdown
  table the moment it was asked to compare five listings (I: Alpha would show that as pipes).
- The stream is a poll: the window asks `/api/turns/{id}` every 500 ms while a turn runs and
  shows `live.partial`, the last 20,000 characters of the reply as written, through `Rich`;
  the whole reply replaces it when the turn ends. First words come in 2.7 to 8.7 s when the
  reply comes first; a turn takes 25 s at the median, 23 s of it the model (STATE, 16 Oct).
- Cards are not in the timeline. `/api/conversation` returns turns, threads, workflow pages,
  actions and asks as five lists; the panel draws thread cards at the top, then the turns,
  then every workflow page, then every open action, then the ask cards, whatever the order in
  which they happened. The check screenshot of 16 Oct shows six identical red "failed on a
  row" bubbles in a row (the "identical replies collapsed" item of Q35 is still pending).
- Questions as choices exist twice over: `ask_person` (the model's tool, an `asked` entry, an
  AskCard or AskGroup in the panel and on Home, answered through `/api/asks`) and the
  mechanism of 9 Oct (`runtime/asking.py`: a trailing question in prose becomes a card with
  options from the reply's own list or from the Haiku parser). The mechanism was built because
  the rule alone produced 2 cards against 23 prose questions in a week (Q35).
- Still pending from Q35: one automatic retry, identical replies collapsed, long replies
  folded, copy and edit-and-resend, a plus for files, one stream or one per page. Design §8
  also wants "answers cite the records they used", not built.
- The route is the Claude Code CLI with `--append-system-prompt` (`turn.md`, 8.9k characters,
  about 2.2k tokens), 73 MCP tools, the pre-pack, `--include-partial-messages`; Sonnet for
  turns, Haiku for the small judgements (`models.toml`).

So "not optimal" has three parts that different things fix: the model's latency (not a UI
matter), the window's own gaps (a Markdown-lite renderer, cards out of order, no
copy/edit/fold/dedupe, polling), and how a question becomes a choice (a mechanism on top of a
rule the model mostly ignored).

## 3. The test: Claude, through Alpha's route, writing OpenUI Lang (V, measured)

**Setup.** `claude -p "<prompt>" --model sonnet|haiku --tools "" --append-system-prompt
"<OpenUI prompt>" --output-format json`, from this Mac on Kenil's subscription, the nested
session allowed by unsetting `CLAUDECODE`. Two OpenUI prompts: the legacy one from
`benchmarks/system-prompt.txt` (the default `Stack` library, 13.2k characters, about 3.3k
tokens, "your ENTIRE response must be openui-lang") and the 1.0 chat library prompt generated
locally with `generateSystemPrompt` from `docs/generated/chat-library.spec.json` (84
components, root `Card`; 26.7k characters, about 6.7k tokens; 27.6k with inline mode). A
control arm ran the same prompts with no OpenUI prompt (Markdown). Four prompts with inline
data: five deal listings as a table with a button per listing (p1), a week of calories against
a target as a chart (p2), a two-way choice to ask the person (p3), two paragraphs of prose with
"no tables or charts" (p4); for inline mode also "note my breakfast, one line back" (p5) and
"when did I last email Vikas?" (p6, nothing to answer from). Each program was parsed with
`createParser(schema, root)` from lang-core 1.0.1.

**Validity.** 23 programs, 23 parsed with zero errors, zero unresolved references, zero
orphans. Two blemishes: Haiku once wrapped a whole non-inline program in ``` fences, which the
parser skipped silently (issue #582 exactly); and with the legacy prompt, whose `Button` takes
`action: string`, both models wrote `Button("View", "https://example.com/d3")` and
`"action:file_attachments"`, valid for that schema and dead on click. With the 1.0 prompt both
wrote `@OpenUrl("…")` for the listings and `@ToAssistant("File Vikas's attachments")` for the
choice, which is what the renderer acts on.

**Inline mode, the mode that fits Alpha.** Sonnet: plain prose and no code for p5 ("Noted:
breakfast was two boiled eggs and black coffee.") and p6 (2 of 2); a fenced program for the
table, the chart and the choice (3 of 3); the chart came with a sentence of prose after the
block. For p4 Sonnet still wrapped the two paragraphs in a `Card([TextContent(...)])` program
(harmless, but "no tables or charts" did not mean "no UI" to it). Haiku: prose for p4, p5, p6;
programs for p1 to p3. The choice came back as two `Button`s with `@ToAssistant`, which is
Alpha's ask card written by the model.

**Tokens and time, Sonnet, tools off, one run each.** Output tokens as the CLI reports them
(they include thinking), wall time of the model call.

| Prompt | OpenUI legacy prompt | OpenUI 1.0 inline | Markdown control |
|---|---|---|---|
| p1 five listings as a table | 1,174 tok, 13.7 s | 1,420 tok, 14.8 s | 1,018 tok, 12.8 s |
| p2 calories chart | 641 tok, 9.1 s | 927 tok, 12.1 s | 1,055 tok, 12.0 s |
| p3 a two-way choice | 254 tok, 4.6 s | 406 tok, 7.4 s | 186 tok, 7.7 s |
| p4 two paragraphs | 509 tok, 8.9 s | 453 tok, 9.7 s | 371 tok, 8.5 s |
| p5 note breakfast | | 314 tok, 6.6 s (54 characters of text) | |
| p6 nothing to answer from | | 74 tok, 4.9 s | |

**Haiku** pays for the format: p1 6,075 tokens and 45 s (legacy) and 9,069 tokens and 57 s
(inline) against 1,012 tokens and 8.6 s in Markdown; p3 1,834 tokens and 15.8 s against 207 and
3.8 s. The visible text is short, so the rest is thinking (I). Haiku must not write OpenUI
Lang; it only judges in Alpha, so that is fine.

**Reading.** For Sonnet the language costs about the same as Markdown: a chart is cheaper, a
table about the same, prose a third dearer, and the prompt adds 3 to 7 thousand tokens of
(cached) context to every turn on top of `turn.md` and the tools. The "67% fewer tokens" does
not apply to Alpha, whose replies are prose today, not JSON. The gain is not cost; it is that a
table, a chart, a row of choices and a button that opens a listing arrive as such, drawn by
Alpha's own components while the reply streams.

## 4. Fit with Alpha's rules (V for the rules, I for the fit)

- **Mechanisms, not prompts; cards by mechanism (Q35).** OpenUI is a grammar taught by a
  prompt and checked by a parser whose failures are visible (`onError`), which is a wall in the
  code where the effect happens. The 23-of-23 compliance differs in kind from the 2-of-23 of
  the ask rule: when the format is the only way to answer, the model keeps it; inline mode
  makes it optional again, and there the test shows 5 of 6 as asked. The mechanism of 9 Oct
  would stay underneath either way.
- **Nothing per use case.** A component library (table, chart, choice, record card, steps) is
  by mechanism; nothing in it names a site or a module. Fine.
- **The journal verbatim.** A reply would be stored as the text the model wrote, prose plus a
  fenced program; the `]]>openui:` wrapper is optional and Alpha need not use it. Everything
  that reads a reply's text (Activity's entry page, Watson's passes, the companion's bubble,
  the export, the pre-pack that sends earlier replies back as context) would see programs. The
  docs want earlier replies sent back verbatim so the model can edit them; Watson and the
  export would want the prose and a one-line stand-in for the program.
- **Python core, TypeScript parser.** There is no Python parser; the one community port
  (Sage) runs a Node worker. Anything the core wanted to do with a reply's program (turn a
  model-drawn choice into an `asked` entry, strip it for Watson, validate before journaling)
  means shelling out to the Node that Alpha already bundles, or treating the program as opaque
  text. The window can parse; the core cannot, cheaply.
- **Two ways to ask.** A model-authored `Button(@ToAssistant("…"))` would, in the window,
  send the click as the person's words. The core would not know a question was asked: no
  `asked` entry, no "Needs you" on Home, no waiting state, no answering later. So either
  `ask_person` stays the only way to ask and the library's buttons are for follow-ups and
  navigation (open the listing, open the record, run it again), or the core turns a reply's
  buttons into asks by mechanism, which needs the Node parser above.
- **No knobs.** A library is not a setting the person meets. The depth of UI the model draws
  is its judgement, as the prompt's "choose components that best represent the content".
- **Trust.** Install telemetry on by default (off by one environment variable in the dev
  setup; the shipped app never installs packages). The runtime phones nowhere unless told.
- **WebKit is the app.** Untested. react-ui's components are Radix and d3; nothing suggests a
  Chromium dependency, and nothing proves WebKit either.

## 5. Options

**A. Agent Interface as the chat shell.** No. It owns the sidebar, thread list, composer,
routing and artifacts panel in its own visual system (Q42: main keeps its own); Alpha's
conversation is scoped by page, keeps threads, asks, actions and workflow pages as cards from
the core, has @Name, the held mic, the companion on the same stream and the journal as its
store; forcing that through `ChatLLM` and five REST endpoints would be a translation layer on
both sides for a 0.18 package whose library is being renamed. Its transport wants a pushed
stream parsed in the browser; Alpha polls. 16 MB and thirty dependencies for a window that
has nine.

**B. OpenUI Lang for the reply body, in Alpha's own conversation.** The candidate. Keep
`Conversation`; teach the turn's model a small Alpha library in inline mode; render a reply's
fenced program with `@openuidev/react-lang` (370 KB, no react-ui) through components defined
on Alpha's own kit and styles (a table like the module's, a chart like Intelligence's, a
record card, a step list, a row of choices, a button that opens a record or a listing); a
click becomes the person's words or an address in the window. What it buys: tables, charts,
choices and openable rows drawn while the reply streams, authored by the model, in Alpha's
look. What it costs: a prompt of a few thousand tokens per turn (a ten-component library,
not 84, so nearer 1.5 to 2k; measure); programs inside the journal and everything that reads
it (Section 4); the ask question settled; `partial` already holds 20k characters so streaming
works but the renderer re-parses on every 500 ms poll; the library kept in Alpha's hands so
upstream renames (#1385) cannot break stored replies; the WebKit check; `turn.md` and the
OpenUI prompt reconciled (untested together).

**C. assistant-ui primitives for the shell.** The other library in this space answers the
other half of "seamless like Claude": `@assistant-ui/react` (MIT, 0.15.29, 12,575 stars,
2.0M weekly downloads, a YC company with a paid cloud) is headless primitives (Thread, Message,
Composer, ThreadList, ActionBar) with streaming, auto-scroll, edit and regenerate, branching,
attachments, Markdown, keyboard shortcuts and dictation as behaviours, styled by the
application; its ExternalStoreRuntime takes `messages`, `isRunning` and `onNew`, `onEdit`,
`onReload`, `onCancel`, which maps onto Alpha's journal and poll. OpenUI has an official
integration with it (the Renderer replaces the text part). It would mean rebuilding
`Conversation` on primitives and carrying Alpha's cards as custom message parts. A bigger
change than B, for the mechanics rather than the drawings. Noted as the alternative, not
proposed.

**D. Queries and mutations for drawn dashboards.** A model-written page whose `Query`s call
the core's API from the window and refresh without a turn is the deferred "dashboard tiles"
(D7) and the derived pages in one mechanism. Real, later, and not the chat problem.

**E. Ideas to take whatever is decided.** Render real Markdown (tables, links, code, headings)
in the reply, since the model already writes them; put cards into the timeline where they
happened; collapse identical consecutive failures; fold long replies; copy and edit-and-resend;
push the reply from the core as it is written instead of polling every half second. These are
Q35's leftovers plus the renderer, and they are the part of "not seamless" that no library
changes.

## 6. Risks and unknowns

- One run per cell; a real decision wants Kenil's own last two weeks of sentences replayed on
  a copy of the world, with the ask rule and `turn.md` in the prompt.
- The parser hides what it cannot read (#582). A reply that the model began with a sentence
  before the fence is fine in inline mode; a program with a typo in a line loses that line
  without saying so unless `onError` is shown. Alpha would show it ("Alpha drew this
  wrongly: …"), as it shows every error.
- Upstream churn: the library rework of 12 Oct, chat packages at 0.18, three framework
  runtimes a version behind. Owning the library and depending on `react-lang` only contains
  it.
- Haiku cannot write the language economically; any future "haiku for lookups" lever (STATE's
  fast-turns note) would have to answer in prose only.
- The docs steer to the paid Gateway for reliability; Alpha would run without it, on Claude,
  where 23 of 23 parsed, and show failures rather than buy a fixer.

## 7. Recommendation and the questions to settle with Kenil

Not the shell; the language and renderer are worth a bounded trial, after the cheap fixes.
Proposed order: (1) E first, one slice, since it is where the window itself is wrong today;
(2) a one-day spike of B on a copy of the world in the WebKit app, with a ten-component Alpha
library, Kenil's real sentences, and the numbers measured (prompt tokens, time to first
drawing, errors shown); (3) decide B, and C only if the mechanics still feel short of Claude
after (1).

Questions:
1. What does "like Claude" mean most to you now: the drawings (tables, charts, choices in the
   reply), the mechanics (edit, regenerate, copy, attachments, a pushed stream), or the
   latency? The answer orders E, B and C.
2. If the model may draw choices, is `ask_person` still the one way to ask, with drawn buttons
   kept for follow-ups and navigation? (Section 4.)
3. Is a few thousand tokens of library prompt per turn acceptable, given the context a turn
   already carries?
4. May the window carry an OpenUI dependency at all (MIT, a startup's project, install
   telemetry off by hand), or should the spike be done to learn the shape and then written
   in Alpha's own code, as Q28 did with pull request #3?

## Sources

- github.com/thesysdev/openui (README, LICENSE, package manifests, `benchmarks/`, issues #355,
  #582, #990, #1385, releases of 12 to 15 Oct 2026); openui.com docs read from the repository's
  `docs/content/docs/` (openui-lang: index, overview, syntax, specification, what's-new,
  architecture, system-prompts, defining-components, renderer, message-protocol, reliability,
  actions, interactivity, functions, queries-mutations, reactive-state, comparison,
  incremental-editing, telemetry, troubleshooting; agent: introduction, conversations,
  artifacts, generative-ui, message-rendering, agentinterface-props, self-hosting,
  adapters-and-formats; build-agents: how-it-works, custom-chat-ui, conversation-history,
  tools, ui-generation, frameworks/pi; mcp, production, deploy; ADOPTERS.md).
- npm registry (versions, sizes, weekly downloads, 16 Oct 2026); github.com/assistant-ui/assistant-ui
  (README, ExternalStoreRuntime docs); google/A2UI and vercel-labs/json-render (secondary
  search results, 16 Oct 2026); Thesys funding: CMOtech and CBInsights listings (S).
- Alpha: `desktop/src/assistant/*`, `desktop/src/ui/Rich.tsx`, `desktop/src/core/client.ts`,
  `core/alpha/runtime/claude_cli.py`, `core/alpha/config/{prompts/turn.md,models.toml,limits.toml}`,
  `docs/STATE.md`, `docs/log/2026-10-09-chat.md`, `docs/log/2026-10-02-4-18-*.md`, design §8
  and Q35, the 16 Oct desktop check's screenshots.
- The test's files: the scratchpad of this session (`lab/out2`, `lab/out3`, the generated
  prompts `sp-chat-full.txt` and `sp-chat-inline.txt`), reproducible from the commands in §3.
