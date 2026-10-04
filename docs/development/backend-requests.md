# Backend requests for the UI

The UI branch `feat/zazoo-ui` puts Vikas's UI on top of main's kit and runs on main's core as it is.
Each control below is already in the window. Where the core or the desktop host can't do it yet, the
control sits where it will live and says "… is coming soon." when used. Each row gives the route or
host command it waits for.

Most of these exist on `feat/bridge-parity`
([kenil0811/alpha-brain#1](https://github.com/kenil0811/alpha-brain/pull/1)): port from there
rather than starting over.

Conventions match the existing API: bearer token, JSON in and out, `{"error": "..."}` with a 4xx in
plain words, every write journaled with its actor.

## Already real on main's core

These were "coming soon" on PR #3. The UI now calls main's routes for them.

- **Composer:** the **+** menu adds files, images, a folder or audio, and so do files dropped or pasted on the composer (`POST /api/files`).
- **Chats:** New chat (`/api/conversations`).
- **Workspace name:** saved in the core (`/api/preferences/workspace_name`).
- **Models:**
  - Claude and ChatGPT/Codex install, sign in and sign out.
  - The star for the default way Zazoo thinks (`PUT /api/thinking`).
- **Saved lists:** the star for the default list (`PATCH /api/lists/{id} {default}`).
- **Projects:** Add sub project (`POST /api/modules` with `parent`) and Take out (`POST /api/modules/{ref}/move`).
- **Activity:** failed automations, each with **Run it again** (`GET /api/automations` `last_error`, then `POST …/run`).
- **Intelligence:**
  - A note's text saves directly (`POST /api/notes`).
  - Suggested facts take yes or no.
  - Standing permissions can be revoked.
  - Connections can be checked or removed (with the removal preview).
  - Automations can be switched on or off and run.
- **Companion:** its colours follow the chosen animal (`companion_look`).

---

## 1. Models

| Control (where) | Backend request |
|---|---|
| Key field and Save, star, and a ⋯ menu with Test / Reconnect / Remove key, for Claude API, ChatGPT API, OpenRouter, Grok (xAI), DeepSeek and Groq (transcription only) (Settings → Models) | `GET /api/models` → providers `{id, label, kind: sign_in\|key\|local, state, key_last4, default, …}`; `PUT/DELETE /api/models/{id}/key`, `POST /api/models/{id}/test`, `…/reconnect`, `…/star`. Keys in Keychain items `alpha-brain.<provider>`. |
| Ollama "Find models" (Models) | `POST /api/models/ollama/install`, `GET /api/models/ollama/models`. |
| A model picker on the connected Claude and ChatGPT rows; "How long it thinks" (Models) | `GET /api/models/{id}/models` → `{models, selected}`, `PUT /api/models/{id}/model {model}`; an effort setting (`GET/PATCH /api/settings`). |

## 2. Composer

| Control (where) | Backend request |
|---|---|
| + → Advanced → **Model** for this chat | `PUT /api/route {conversation, provider, model}`, or a `model` field on `/api/ask`. |
| + → Advanced → **Access** for this chat (ask / approve for me / full) | `GET/PUT /api/access {conversation, mode}`; a global default in settings. |
| Desktop → Transcription (Whisper when a Groq or OpenAI key is saved) | `POST /api/transcribe {audio_b64, mime}` → `{text}`. |

## 3. Projects

| Control (where) | Backend request |
|---|---|
| Rename, Change icon, Edit goal (rail ⋯, right-click, project page ⋯) | `PATCH /api/modules/{ref} {name?, icon?, goal?}`. |
| Delete (same menu) | `DELETE /api/modules/{ref}` → `{module, tables, rows}`. |
| Export…, Export with data… (same menu) | `GET /api/modules/{ref}/export?rows=` → bundle. |
| Add from a file…, and a file dropped on New (rail) | `POST /api/modules/import` (bundle or `{path}`). |

## 4. Tables

| Control (where) | Backend request |
|---|---|
| Undo (table ⋯ menu, ⌘Z outside a field) | `POST /api/tables/{name}/undo` → `{undone, text}`. |
| Rename column, Change type, Add column (column header ⌄ or right-click) | `PATCH /api/tables/{name}/fields/{field} {label?, kind?, choices?}`, `POST /api/tables/{name}/fields`. |
| History (record panel header) | `GET /api/tables/{name}/records/{id}/history` → `[{at, kind, actor, text, turn}]`. |
| Default view, group-by and date field (stars in their pickers): kept on this Mac today | Optional: keep them on the table (`PATCH /api/tables/{name} {defaults}`) so they follow the person. |
| **fx** for formula fields: not shown, the core has no computed fields | A `formula` field kind `{expression, result_kind}`, computed by the core on read and write, set through the field PATCH above. |

## 5. Intelligence

Every Intelligence item opens its own page (`#/intelligence/<tab>/<item>`), and the map's card offers the same edits. Where the core has no write route, saving drafts the exact change in Zazoo's message box. Nothing is sent until the person sends it. Each row below would replace a draft or a coming-soon with a direct save.

| Control (where) | Backend request |
|---|---|
| Add a fact (About you) | `POST /api/facts {predicate, value}`. |
| Forget a fact (About you, the fact's page) | `POST /api/facts/{id}/forget`. `decide` only works on suggested facts. |
| Correct a fact's value (drafted) | `PATCH /api/facts/{id} {value}`: a stated value that supersedes the old one. |
| New skill (Intelligence → Skills) | `POST /api/skills {title, instructions, inputs}`. |
| Run a skill on its own (skill card, skill page) | `POST /api/skills/{name}/run {inputs}`. |
| A skill's description, when to use it and page (drafted) | `PATCH /api/skills/{name}` (or decide these stay read-only). |
| An automation's title, schedule and instructions (drafted) | Widen `PATCH /api/automations/{id}` to `{title?, schedule?, procedure?}`. |
| A goal's text and state (drafted) | `PATCH /api/goals/{id} {text?, state?}`. |
| A permission's wording (drafted) | `PATCH /api/permissions/{id} {sentence}`. |
| A note's title (drafted) | `PATCH /api/notes/{id} {title}`. |
| A connection's folder or site (drafted) | `PATCH /api/connections/{id} {target}`. |

## 6. Home

| Control (where) | Backend request |
|---|---|
| First steps / Set up Alpha (Home) | `GET /api/onboarding`, `POST /api/onboarding {answers}`, `POST /api/onboarding/skip`. |

## 7. Settings

| Control (where) | Backend request |
|---|---|
| Look rules (Settings → Project look) | `GET/PATCH /api/settings`, group "Look". |
| Model for making a project; When Zazoo needs your OK (Settings → Builds) | Same settings route, groups "Making projects" and "Access". |
| Go back (each backup, Settings → Data) | `POST /api/data/backups/{name}/restore`; keep today's world as a backup first. |

## 8. Desktop host (`desktop/src-tauri`)

These need Rust/Swift work, not core routes. All are on `feat/bridge-parity`.

| Control (where) | Host request |
|---|---|
| All 7 rows in Settings → Permissions (screen recording, system audio, microphone, speech, accessibility, input monitoring, system logs) | `permissions_status`, `permission_request`, `permission_settings`. |
| Talk: hold Fn; Push to talk (Settings → Shortcuts, Desktop) | `ptt_permission`, `ptt_request_permission`, `ptt_set_shortcut` (CGEventTap, Input Monitoring). |
| Speak replies (Desktop) | `tts_speak`, `tts_stop`; `stt_start`, `stt_stop` for native speech. |
| Editing ⌘W and ⌘Q (Shortcuts) | `menu_set_shortcut {item, accelerator}`. |
| The companion comes back where it was last dragged (today it always starts at the bottom-right) | Save the window position per display when a drag ends; restore it on launch, falling back to the corner. |
| The companion's eyes follow the cursor anywhere on screen (today only over its own window) | `avatar_cursor() -> {x, y}`, or a cursor event to the companion window. |
| Window title "Alpha companion" | Rename it in `build_avatar` (`lib.rs`). |
