# Backend requests for the UI

The UI-only PR (`feat/ui-only`) ships what runs on main's core as it is. Each item below is a UI
change that still waits for the core or the desktop host. Every item gives the route or host
command the UI expects and its shape.

Most of these already exist on `feat/bridge-parity`
([kenil0811/alpha-brain#1](https://github.com/kenil0811/alpha-brain/pull/1)). The source column
says where. Port from there instead of starting over. The client methods the UI used are in that
branch's `desktop/src/core/client.ts`, and the UI for each item is in its `desktop/src/`.

Conventions match the existing API:

- Bearer token on every call.
- JSON in and out.
- Errors are `{"error": "..."}` with a 4xx, in plain words the window can show.
- Every write is journaled with its actor.

---

## 1. Models: more than Claude Code

| UI change | Backend request |
|---|---|
| Settings → Models lists every way to reach a model (Claude sign-in, ChatGPT/Codex, API keys for Anthropic, OpenAI, Groq, …, Ollama on this Mac). Each row has a status dot, a star for the default, a model picker, Test, Reconnect and Remove key. | `GET /api/models` → `{providers: ModelProvider[]}` (`id, label, kind: sign_in\|key\|local, state, dot{color,tooltip}, error, key_last4, installing, who, default, needs_code, install_failed, transcribe_only, last_ok, why`). `POST /api/models/{id}/star`, `PUT /api/models/{id}/key {key}`, `DELETE /api/models/{id}/key`, `POST /api/models/{id}/test`, `POST /api/models/{id}/reconnect`, `POST /api/models/{id}/install`. Keys live in separate Keychain items `alpha-brain.<provider>`. |
| One Claude sign-in: the browser opens, then the person pastes the code. | `POST /api/models/{id}/sign-in` → `{provider}` with `needs_code`; `POST /api/models/{id}/sign-in/finish {code}`. |
| A model picker per provider. | `GET /api/models/{id}/models` → `{models: [{id,label}], selected}`; `PUT /api/models/{id}/model {model}`. |
| First-run card "Connect a model to start" for any provider, not only Claude. | Same `GET /api/models`. The window checks `state == "connected"`. |
| The composer offers "Connect" when a turn's model isn't connected, then resends the message. | `Turn.state = "needs_connect"` with `provider` and `connect_kind: sign_in\|key`. |
| Settings → Models → Thinking (how long the model thinks). | `GET /api/settings`, `PATCH /api/settings {values}` → `SettingField[]` (`id, group, title, description, kind: choice\|integer\|text, default, value, options, minimum, maximum, unit`). |

Source: `core/alpha/models/` (accounts, claude_oauth, keychain, providers, settings), `runtime/route.py`, `runtime/api_runner.py`, `runtime/codex_cli.py`, and the `/api/models*` and `/api/settings` routes in `api/server.py`.

## 2. Composer: attachments, model and access per chat

| UI change | Backend request |
|---|---|
| The composer's **+** menu adds files, images, folders and audio, by picker, drop or paste. Sent items show as chips on the message. | `POST /api/ask` accepts `attachments: [{kind: file\|image\|folder\|audio, name, size, mime, path, content_b64}]` (capped count and size). Echo them in the said entry's `data.attachments`. Source: `runtime/attachments.py`. |
| **+ → Advanced → Model** chooses the model for this chat. | `GET /api/route?thread=` → `{provider, model, chosen}`; `PUT /api/route {thread, provider, model}`. |
| **+ → Advanced → Access** (Ask for approval / Approve for me / Full access) for this chat. | `GET /api/access?thread=` → `{thread, mode, default}`; `PUT /api/access {thread, mode}`. The global default is a `SettingField` in group "Access". Source: `world/access.py`. |
| Voice: Whisper transcription when a Groq or OpenAI key is saved, otherwise the Mac's own speech. | `GET /api/transcribe` → `{available}`; `POST /api/transcribe {audio_b64, mime, provider?}` → `{text}`. Source: `runtime/transcription.py`. |

## 3. Chats and stopping a turn

| UI change | Backend request |
|---|---|
| Zazoo keeps a chat per place (global or a project). **+ New chat** starts one, the empty state lists earlier ones, and a project's Activity lists its chats with Archive. | `GET /api/threads?module=&include_done=` → `Session[]` (a Thread plus `turns`), `POST /api/threads {title, module}`, `PATCH /api/threads/{id} {state?, title?}`. `GET /api/modules/{ref}` adds `sessions`. |
| Stop a running turn in a clean way (the UI uses main's `/api/turns/{key}/stop` today). | `POST /api/turns/{key}/cancel`, with the turn ending in `state: "cancelled"`. |

## 4. Projects: make, edit, file, export

| UI change | Backend request |
|---|---|
| **New project** makes a blank "Untitled project" at once and opens its page. The questions, options, plan and build all happen on that page (`CreationOnPage`). Today the UI starts "I want to " in Zazoo instead. | `POST /api/modules {name?}` → card with `creation: {stage, thread, questions, proposal, assumptions, turn, error, timed_out}`. `POST /api/modules/{ref}/creation/answer {text?, answers?, choice?, use_defaults?, build?, carry_on?, retry?, start_over?}` → `{turn?, module?}`. `GET /api/modules/{ref}` adds `creation`, `plan`, `running`. |
| Rename a project, change its icon, edit its goal inline, delete it (rail ⋮, right-click, project page). | `PATCH /api/modules/{ref} {name?, icon?, goal?, project?}`; `DELETE /api/modules/{ref}` → `{module, tables, rows}`. `ModuleCard.icon` from a fixed icon list. |
| Sub projects: nested in the rail, with "Add sub project" and "Take out" on the project page. | `ModuleCard.project` (parent id), set through the same PATCH. `ModuleDetail.sub_projects`. |
| Export a project to a file (structure, or with data) and add one from a file (rail drop, project page). | `GET /api/modules/{ref}/export?rows=` → bundle; `POST /api/modules/import` (bundle or `{path}`). Source: `world/bundle.py`. |
| Project facts on the project page (accept, or forget). | `ModuleDetail.facts`; `DELETE /api/facts/{id}`. |

## 5. Tables

| UI change | Backend request |
|---|---|
| Saved lists (views) that follow the person to another Mac and that Alpha can make when asked. Today they live in the window's storage (`dataviews/useSavedViews.ts`), including which list is starred. | `GET /api/tables/{name}/views`, `POST /api/tables/{name}/views {title, config, is_default}`, `PATCH /api/views/{id}`, `DELETE /api/views/{id}`. Also `GET /api/tables/{name}` adds `views`. Source: `world/views.py`. |
| Undo the last edit (pager link, ⋮ menu, ⌘Z), with a "Last change" line. | `POST /api/tables/{name}/undo` → `{undone, text}`; `GET /api/tables/{name}` adds `last_edit {text, at, actor}`. Source: `world/edits.py`. |
| Change a column's type or name in place; add a column. | `PATCH /api/tables/{name}/fields/{field} {kind?, label?, choices?, relation?}` → `{before, after, rewritten, table}`; `POST /api/tables/{name}/fields {fields}`. |
| Set or delete many rows at once as one journaled change. Today it is one request per row. | `POST /api/tables/{name}/records/bulk {action: set\|delete, items: [{id, revision}], values?}` → `{done, skipped}`. |
| A record's History (who changed what, and what the person said in that turn). | `GET /api/tables/{name}/records/{id}/history` → `[{id, at, kind, actor, text, turn, said}]`. |
| Row actions: skills Alpha attached to a table, run from a row's menu. | `GET /api/tables/{name}/row-actions` → `[{skill, title}]`; `POST /api/tables/{name}/rows/{rid}/run/{skill}` → SkillRun. Source: `api/brain.py`. |

## 6. Home and Activity

| UI change | Backend request |
|---|---|
| "Needs you" cards for outward writes waiting for a yes (Approve / Not now, with exactly what will run). | `GET /api/pending` → `PendingAction[]`; `POST /api/pending/{id}/approve`; `POST /api/pending/{id}/reject`. Source: `world/pending.py` plus the governance pipeline. |
| The bell also counts automations whose last run failed, with "Run it again". | `GET /api/attention` → `{count, needs_you, failed: [{id, title, module, at, error}]}`. Today the bell counts `home.needs_you` only. |
| First steps: five questions, then where to begin. | `GET /api/onboarding`, `POST /api/onboarding {answers}`, `POST /api/onboarding/skip`. Source: `context/onboarding.py`. |

## 7. Intelligence

| UI change | Backend request |
|---|---|
| About you: add a fact, correct a value (a new value supersedes), forget one. | `POST /api/facts {predicate, value}`; `DELETE /api/facts/{id}`. Source: `api/brain.py`. |
| Skills you make and run (title, instructions, inputs, sources), with their runs. | `GET/POST /api/skills`, `GET/DELETE /api/skills/{id}`, `POST /api/skills/{id}/run {inputs}`. Source: `world/skills.py`. |
| Project links: a project reads another only when switched on. These also draw project-to-project edges in the Second brain. | `GET /api/links` → `[{module, name, reads, reads_name, tables, why, enabled}]`; `PUT /api/modules/{ref}/reads {reads, enabled}`. Source: `world/links.py`. |

## 8. Settings

| UI change | Backend request |
|---|---|
| Project look and Builds sections (the rules for tables and views, making projects, access default). | `GET/PATCH /api/settings`, groups "Look", "Making projects" and "Access". |
| Go back to a backup (today a backup is made, never restored). | `POST /api/data/backups/{name}/restore` → DataInfo. Today's world is kept as a backup first; a damaged or newer copy is refused. |
| Runtime line: core and Python version. | `GET /api/health` adds `core_version`, `python_version`. |

## 9. Desktop host (`desktop/src-tauri`)

These need Rust/Swift changes and new capabilities, not core routes. All of them are on `feat/bridge-parity`.

| UI change | Host request |
|---|---|
| Push-to-talk: hold Fn, or a recorded shortcut, anywhere. | `ptt_permission`, `ptt_request_permission`, `ptt_set_shortcut` (CGEventTap in `src/ptt.rs`, Input Monitoring). |
| Native speech to text, and spoken replies with barge-in in the companion. | `stt_start`, `stt_stop`, `tts_speak`, `tts_stop` (`src/speech.rs`, `native/stt_helper.swift`). |
| Settings → Permissions: screen, system audio, mic, speech, accessibility, input, system logs. | `permissions_status`, `permission_request`, `permission_settings` (`src/permissions.rs`). |
| The composer's file and folder pickers. | `tauri-plugin-dialog` and the `dialog:allow-open` capability. |
| Export a project straight to Downloads. | `save_to_downloads {filename, text}`. |
| Drag the companion by the character itself. Today it uses the window's own drag. | `core:window:allow-set-position` capability. |
| "This window was built from X, the core runs Y: rebuild". | Pass `appCommit` and `coreCommit` in the core session (`build.rs`). |
| Panda app and tray icons. | New icon assets in `src-tauri/icons`. |

## 10. Naming

| UI change | Backend request |
|---|---|
| The assistant is called **Zazoo** everywhere in the window. | Nothing in main's core names it "Chief of Staff". If the turn rules ever name the assistant, they should say Zazoo. |

## 11. Intelligence item pages: direct edits

Each Intelligence item opens its own page (`#/intelligence/<tab>/<id>`), and every field can be edited
there. Where the core has no route yet, saving puts the exact change in Zazoo's message box as a
draft, and nothing is sent until the person sends it. Each row below replaces that draft with a
direct save.

| UI change | Backend request |
|---|---|
| Correct an accepted fact's value; forget an accepted fact. | `PATCH /api/facts/{id} {value}` records a stated, accepted value that supersedes the old one. `POST /api/facts/{id}/forget`. Today `decide` refuses anything that isn't a suggestion. |
| Edit a goal's text, or mark it done or dropped. | `PATCH /api/goals/{id} {text?, state?}`. `knowledge.update_goal` exists (state only) but has no route. |
| Edit an automation's title, schedule and instructions. | Widen `PATCH /api/automations/{id}` to `{enabled?, title?, schedule?, procedure?}`. The `automation_update` tool already supports these fields. |
| Rename a skill or edit its description. | Decision needed: allow per-person overrides (`PATCH /api/skills/{name} {title?, description?}`) or make these fields read-only. Today they come from the built-in connector manifests. |
| Edit a site reader's description or page. | `PATCH /api/readers/{name} {description?, url?}`. Changing the URL re-runs and re-checks the reader, as `reader_save` does. |
| Change a connection's folder or site. | `PATCH /api/connections/{id} {target}`. Today the only way is to remove the connection and add it again, which drops the readers and automations tied to it. |
| Reword a standing permission. | `PATCH /api/permissions/{id} {sentence}`. |
| Rename a note. | `PATCH /api/notes/{id} {title}`. `POST /api/notes` matches notes by scope and title, so it can't rename one. |
| Rename a person or company. | `PATCH /api/entities/{id} {name}`, with the old name kept as an alias. |
| Edit a project's name and goal from the Second brain card. | `PATCH /api/modules/{id} {name?, goal?}` (the same route as section 4). |
| A per-automation run log on its page. Today the page shows only the last run, its result and the live steps. | `GET /api/automations/{id}/runs` → `[{at, state, result, error}]`. |
| A fact's "About" line names the entity. Today it shows the entity's id. | Add `subject_name` to `Fact`. |

## 12. Companion and appearance

| UI change | Backend request |
|---|---|
| The companion's eyes follow the cursor anywhere on screen. Today they follow it only while it is over the companion's own small window. | A host command `avatar_cursor() -> {x, y}` in screen points, or a cursor event streamed to the companion window. |
| The avatar (animal, outfit) and the appearance (accent, companion colours, font, corners, contrast, motion) follow the person to another Mac. Today they are kept on this Mac (`alpha.avatar`, `alpha.appearance` in localStorage). | Optional: a core preference such as `profile.avatar = {species, body, suit, tie, shirt, accessory, glasses}` and `profile.appearance`, read and written on a settings route. |

---

*Added from the UI-only branch's own work, below: anything its new screens edit through Zazoo, or
keep on the device, until a direct route exists.*
