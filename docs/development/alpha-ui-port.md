# Alpha UI changes, and where they stand in AB

Every person-visible change Vikas pushed to Alpha — kenil0811/alpha PR #2 (`feat/ui-bridge-baseline`,
52 commits) and PR #1 (`feat/avatar-model-monitor`, 6 commits) — and what AB does about it.

Owner: **A** shell and global styles (this pass), **B** Settings, models and providers, the
composer's + menu, connection dots and the not-connected card, **C** tables (DataPage, views,
toolbar, record drawer), **D** core governance. Status: **done** (AB already had it), **ported**
(brought over in this pass), **n.a.** (AB has no such surface, with the reason), **B/C** (that
stream's work).

AB keeps its own rail (design §8: Today/Home, projects, Intelligence, Activity) and has no builder,
so Alpha's creation surfaces are not carried over.

| # | Change (Alpha commit) | Owner | AB |
|---|---|---|---|
| 1 | Bridge palette as tokens, light and dark (8db29ea6) | A | ported: `styles/tokens.css` holds the `--bridge-*` palette; `app.css` maps onto it |
| 2 | Geist and Source Serif 4 bundled, offline (8db29ea6) | A | ported: `@fontsource-variable/*` |
| 3 | lucide icons instead of glyphs in the shell (8db29ea6, 4197b3ce) | A | ported: rail, assistant, companion, voice, project header, Activity, Intelligence. Table glyphs: C |
| 4 | UI primitives in `ui/` (8db29ea6, later fixes) | A | done (79c20c2); now used by the shell |
| 5 | Side panels collapse, expand and resize; never cover the page; Escape steps them down (8db29ea6, 453858c0) | A | ported: `usePanelControl` on the rail (snaps 76/220/360) and the assistant (260-520, 48px strip) |
| 6 | Rail and assistant headers and every page header on one 56px line (8db29ea6, 7c0f5179) | A | ported: `.brand`, `.assist__head`, `PageHeader`/`.modhead` all 56px; pages have no top padding |
| 7 | Hash routes, back and forward work (8db29ea6) | A | ported: the page lives in `location.hash` (no router dependency) |
| 8 | Rail: drag to reorder projects, hide one, "N hidden · Show all" (8db29ea6) | A | ported |
| 9 | Tables: Lists, view switcher, filters, column menus, record peek, keyboard editing (8db29ea6, 0bae4031, ede9e8e0, 70c32438) | C | C |
| 10 | Assistant panel with the Zazoo icon, always-visible composer, Enter sends (8db29ea6) | A | ported (Enter already sent) |
| 11 | Chat history / session picker, later dropped for "+ new chat" (8db29ea6, 453858c0) | A | n.a.: AB has one stream with threads as cards (design §8) |
| 12 | Activity becomes a bell in the assistant header (8db29ea6) | A | n.a.: design §8 keeps Activity in the rail; the rail item carries the count instead |
| 13 | Settings with a second nav, Connections inside it (8db29ea6) | B | B (connections already live in Intelligence, row 24) |
| 14 | ⌘K command menu (8db29ea6) | A | ported: pages, projects and Ask Alpha |
| 15 | Editable workspace name in the rail (8db29ea6) | A | ported |
| 16 | Runtime status as a dot beside the name, no status row (8db29ea6, 453858c0) | A | ported |
| 17 | Collapsed assistant is a 48px strip with the panda; no floating button (8db29ea6) | A | ported (replaces "Ask Alpha" side tab) |
| 18 | Below 640px a bottom tab bar replaces the rail (8db29ea6) | A | n.a.: AB's window is at least 860px wide (`tauri.conf.json`) |
| 19 | Light theme default; theme picker leaves the rail (8db29ea6) | B | B (Appearance) |
| 20 | Bridge's painted panda rig (Zazoo) is the companion (f18cfa9e, a45f223b) | A | ported: `avatar/zazoo/` + `Character` |
| 21 | One Zazoo everywhere: the same panda in the assistant header and strip (7c0f5179) | A | ported: `ui/ZazooIcon` |
| 22 | The assistant is "Chief of Staff" (7c0f5179) | A | ported: assistant header, strip and companion |
| 23 | Panda app icon and monochrome menu-bar tray icon (7c0f5179, 4ff40e76) | A | ported: `src-tauri/icons`, tray uses `tray.png` |
| 24 | Connections live in Intelligence (e348ac3e) | A | done: AB's Intelligence › Connections |
| 25 | Egg-shaped Second brain graph in Intelligence (e348ac3e) | A | ported: projects, people and companies, and facts, with real fact-to-subject links |
| 26 | Drag the avatar itself; it stays under the pointer (91fe6154) | A | ported |
| 27 | Avatar rests beside the Dock (17pt right, 8pt bottom) (59874228) | A | ported |
| 28 | About you in the workspace-name menu (4197b3ce) | A | ported: opens Intelligence › Knowledge (AB's About you) |
| 29 | Avatar as the logo (089d8012), superseded by the status dot (453858c0) | A | ported as the final state (row 16) |
| 30 | Hold Fn to talk to Chief of Staff (089d8012) | A | ported: `shell/ptt.ts` + host `ptt.rs`; the shortcut editor is a Settings row (B) |
| 31 | Native listening (macOS speech) and speaking (`say`) with barge-in (4b127e75) | A | ported: host `speech.rs` + Swift helper, `shell/tts.tsx`; the "Speak replies" switch is B |
| 32 | Whisper transcription (Groq / OpenAI) with on-device fallback (3e528fcb) | A | ported: voice records and sends to `POST /api/transcribe` when a Groq or OpenAI key is saved; keys and the Transcription choice are B |
| 33 | Honest model-call errors (4b127e75, 403086dc) | B | B (core runtime) |
| 34 | + adds files, folders, images, audio as context (6941d738, 5f2afb81) | B | B |
| 35 | Model providers, keys in the Keychain, sign-ins, star default, rows sorted, Reconnect, Install Codex (98ad17ac, 38d4e974, 453858c0, 1c00a45d, d614c99e, 49956173, 403086dc, 34556a5b) | B | B |
| 36 | Connection dots, Reconnect, the not-connected card that signs in and resends (cd840a54, 54b42f4d, 453858c0) | B | B |
| 37 | + → Advanced: model and access mode; the composer never shows the model (94af5f87, 3438c1df) | B | B |
| 38 | Pill composer: + · text · mic · send in one rounded control (94af5f87) | A | ported (the + slot is B's) |
| 39 | Short composer placeholders that fit (2ae8137d, bugs 4) | A | ported: "Ask…" |
| 40 | Executive copy: no sentence under titles or in cards, (i) explainers, one-line empty states (3ea2c0b5, a90f149b) | A | ported on Home, Intelligence, Activity, project page, assistant, companion; Settings B; tables C |
| 41 | Compact fields sized to their content (3ea2c0b5) | A | ported (Intelligence forms, Home answers); Settings B |
| 42 | Export a project to a file from the sidebar; add one from a file (31c93c7a) | A | ported: `GET /api/modules/{ref}/export`, `POST /api/modules/import` (tables, rows, note, goals, automations switched off) |
| 43 | Projects can be deleted from the sidebar (3438c1df) | A | ported: ⋮ → Delete, with what goes said first (`DELETE /api/modules/{ref}`) |
| 44 | Rename a project and change its icon from its menu or right-click (cecb1d12, bug 21) | A | ported: `PATCH /api/modules/{ref}` |
| 45 | "Project" everywhere a person reads; "sub project" inside one (403086dc) | A | ported in the desktop UI and Core's person-facing reply rules; Settings text B |
| 46 | Settings → Appearance: theme, accent, font, text size (453858c0) | B | B |
| 47 | Below 1024px the rail shows icons and the assistant opens over the page (453858c0) | A | ported |
| 48 | `tools/layout-check.js` and the fit and overflow rules (453858c0, cecb1d12) | A | ported: `desktop/tools/layout-check.js` |
| 49 | Five type sizes, sentence case, no uppercase (cecb1d12, bugs 14, 26) | A | ported: 12/13/15/19/26 tokens only |
| 50 | Assistant header opaque, title on one line, subtitle never under the panda (cecb1d12, bugs 1-3) | A | ported |
| 51 | A repeated toast replaces the one showing (d614c99e) | A | done (ui/toast from Alpha HEAD) |
| 52 | Search bars and empty fields give up width before labels truncate (49956173) | A | ported for shell search fields; table toolbar C |
| 53 | New project opens a blank page / picker with Import first (5bad8a01, 3438c1df, 99a8d93e) | A | n.a.: builder-only creation flow; AB's New starts a sentence in the conversation, and Import sits beside it |
| 54 | Creation agent, discovery-first questions, plan as `plan.md`, build progress (11fe743e, 1af969be, b8270422, 798dc351, cecb1d12) | A | n.a.: AB has no builder |
| 55 | Project page (sessions, sub projects, Alpha's notes) (cecb1d12) | A | n.a.: AB's project page is the module page with App · Activity · Settings (design §8) |
| 56 | `bugs.md` at the repo root (cecb1d12) | A | ported |
| 57 | Avatar in a corner of every surface, state from real state (0cc1e370) | A | done: AB's companion window shows presence from real state (working, listening, needs you); not added a second in-window avatar |
| 58 | Settings: show or hide the avatar, read replies aloud (48d24d1d) | B | B (the read-aloud engine is row 31) |
| 59 | Proposal doc: discovery-first creation, Workspace Graph, API route (d7ccb2ee) | — | n.a.: not UI |

Summary: 4 done, 38 ported, 7 n.a., 10 B or C (rows 9, 13, 19, 33-37, 46, 58). Rows with a
B or C part (3, 30-32, 40, 41, 45, 52) are counted as ported: the A part is.

Also in this pass, not from Alpha: Home shows a Needs you card for each pending outbound action
(stream D's `GET /api/pending`, approve and reject): the action in plain words, its evidence behind
an (i), Approve / Not now, and the outcome on one line after deciding.
