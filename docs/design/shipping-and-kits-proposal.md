# Shipping Alpha to clients, and keeping it running without touching their data

A design proposal, 16 October 2026, from a planning session with Kenil; second version, after
his refinement the same day. Nothing here is built; the decisions it asks for become Qn rows in
`alpha-second-brain-design.md` §11 once taken, the way `knowledge-graph-proposal.md` became Q29.

## 1. The ask, in the project's words

Kenil, 16 Oct. A few clients will get Alpha. It cannot be a raw app: it must come with
pre-built, **generic connectors** that every install can use ("a LinkedIn connector which knows
how to read data from LinkedIn and write messages and posts, similarly a Gmail connector, an
Outlook connector … no IP, no specific info … maybe something like how Claude skills are") and
**standard agents**, with no data in it. A client may be **20 people, each on their own Alpha**.
We also build **ad hoc pipelines for one client** (15 users), and when one does not work we
must fix it for all 15 "without messing up their customizations / personal things they've
built". So: "very clear boundaries on what we change/manage, vs what they can do".

## 2. What is true today (read on 16 Oct, nothing assumed)

| Thing | Lives in | Made by | Could reach another install today? |
|---|---|---|---|
| The window and the host | `Alpha.app` | us | yes (`just ship`, Q34) |
| The core, Python, Node, the hands (`connectors/browser`, `files`, `calendar`: each a directory with `connector.yaml`, `SKILL.md`, `scripts/`) | `Alpha.app/Contents/Resources/runtime` | us | yes, inside the app |
| Operator configuration (prompts, built-in briefs, models, limits) | `core/alpha/config/` (moved out of the code on 16 Oct) | us | yes, inside the app |
| A connection: a sign-in to a site, a folder, the calendar | the world's `connections` rows and `browser/<site>/` profile folders | the person, in a window Alpha opens | **never**: a sign-in is theirs |
| Know-how about a site: readers and procedures (`skills`; Kenil's world: 4 for linkedin.com, 4 for google.com, 17 for broker and job sites) with their site notes | the world, with health per run | Alpha, kept only after a real run | no: it exists only in the world it was made in |
| A module: its row, its tables' shapes **and their rows**, its settings table, its workflow page and versions, its sources, note, goals | the world, one file | Alpha with the person (§12) | no: shape and data are one thing in one file |
| A module's workspace: the page, `parts.yaml`, `parts/*.py`, templates, the venv, `inputs/`, under git with Alpha as the committer | `modules/<id>/` | Alpha's build session | the files could; nothing reads them into another world |
| An agent: its row (schedule, what it may touch), its brief and notes, its runs and decisions | the world | Alpha or the person; built-in kinds' frames in code, default briefs in config | no |
| The person's world: journal, entities, facts, documents, events, notes, decisions, commitments, preferences | `world.sqlite` | the person and their Alpha | **never** |

Already true and worth keeping: the app and the world are apart on disk, so replacing the app
never touches a world; migrations are idempotent and run on open; a schema "may only grow (new
optional fields, wider choices) so saved records never lose meaning" (`collections.py`); a
workspace is already a git repository; a built-in brief is copied once into a world and the
person's copy is theirs from then on (`config/README.md`); removing a module deletes everything
of it and journals itself; sources carry `needs_signin`; **the design's own definition of a
connector is already the Agent Skills shape** (§4: a directory with `connector.yaml`,
`SKILL.md`, `scripts/`, tools with an effect, `resources[]` "with cursor and freshness",
and "an Alpha-built site connector is `transport: browser` with recorded steps"); and
`claude auth status` already tells a key from a subscription (`via: console`).

In the way:

1. Nothing takes know-how out of one world or puts it into another. §4.0 left open "whether
   vetted, shared know-how (readers for common sites) ships with Alpha"; Q39 promised "a library
   shared across modules now and across people later". Both are this proposal.
2. Nothing records who owns a thing: a reader Alpha wrote for the person and one we would ship
   look the same, so nothing could know what an update may replace.
3. The core has no schema version (pending since 3 Oct), makes no backup before a migration,
   and opens a world written by a newer core.
4. The app has no updater and no Developer ID (Q1: "taken up only when the app is distributed").
5. Anyone but Kenil on the model route: "Unless previously approved, Anthropic does not allow
   third party developers to offer claude.ai login or rate limits for their products" (verified
   1 Oct). The CLI also runs on an API key.
6. A list is read whole every time; "only what is new" (the connector shape's cursor) is not
   built. An inbox needs it.

### 2.1 A word on words

In the design, the **hands** are the browser, files and the calendar: universal, platform,
never site-specific (Q17, Q23). What Kenil calls "the LinkedIn connector" is know-how about one
site on top of the browser hand: readers (connections, messages, posts), procedures (message,
post) and the notes on how the site behaves. The design's §4 calls that a connector too, with
`transport: browser`. So from here: **connector** = a site's know-how, in the Agent Skills
shape; **hand** = browser, files, calendar; **kit** = a module's definition (see §5). The
`connectors/` directory keeps its name; the hands are the entries with `origin: builtin`.

## 3. Four layers: three we manage, one that is theirs

| Layer | Unit | Format | Made by | Reaches an install by | An update may |
|---|---|---|---|---|---|
| **Platform** | the app, the core, the hands, the built-in agent kinds and their frames, operator configuration | the app bundle | us | a new app (a zip now, the updater later) | change code; migrate the schema forward, backed up first |
| **Connectors** (shared, generic) | one site's know-how: readers, procedures, how the site behaves | `connectors/<site>/` in the Agent Skills shape, versioned | Alpha in our staging world, reviewed by us (§4.1) | inside the app, and on the `alpha` channel (§7) | replace a reader or procedure the person has not changed |
| **Kits**: standard (ours, generic: "LinkedIn Network", "Inbox triage") and client (one client's workflow, its 15 users) | a module's definition: things and fields, settings' keys and defaults, parts, templates, agents' defaults, which connectors it uses | `kits/<name>/`, versioned (§5) | Alpha in a staging world, exported | inside the app, and on the `alpha` or the client's channel | add things, fields and settings; replace parts, templates and agents' defaults the person has not changed; never delete |
| **Theirs** | their data, sign-ins, settings' values, everything they built or changed by chat (modules, agents, readers, saved lists, a brief once edited), and any managed thing once they changed it | the world and the workspace | them and their Alpha | — | nothing. Never read, never changed, never deleted by us |

Nothing per client goes into the platform. A client's set-up is a channel name and a list of
kits; a person's set-up is that plus whatever they make.

## 4. Connectors: a site's know-how, shared, in the Agent Skills shape

```
connectors/linkedin/
  connector.yaml      name, title, version, origin: shared, transport: browser,
                      auth: {kind: browser-session, site: linkedin.com},
                      tools: readers (effect read) and procedures (effect write ⇒ an action with the yes),
                      resources: lists Alpha keeps current, each with a cursor ("new since"),
                      needs: [sign-in to linkedin.com], health: {repair: re-observe-page}
  SKILL.md            how the site behaves, in Alpha's words from its site notes: pace, paging,
                      walls, what asks for a sign-in; the model reads it as it reads a hand's today
  readers/<name>.js   connections, messages, posts, a people search: the page scripts, each with
                      its contract (the fields it returns, to_end, whole)
  procedures/<name>.yaml   message, post, connect: the steps, the effect, the verify, the fields
```

Gmail and Outlook the same: readers for the inbox (new since the cursor), a search, attachments;
procedures for draft, reply, send. The LinkedIn posture stays Q3's: Alpha reads at human pace,
prepares a message or a post, and the person approves every send (Q24: send asks every time).

**Installed into a world** as rows in `skills`, owner `connector:linkedin@3`, health `untried`:
the real-run rule holds per world, a shipped reader is proven in the person's world by its
first run on their own sign-in, and its health is theirs from then on. The site notes land as
the `skill:<name>` page. The app's own copy and a channel's newer copy both load; the newer
wins. A person's Alpha may still write its own readers for the same site; those are theirs.

### 4.1 Who builds a connector

Two roads, and this is a question (§13, 2). (a) **Alpha, in a staging world of ours**, signed
into our own test accounts: Alpha writes the readers and procedures the normal way, each kept
after a real run; we export the site's skills as the connector directory and Alpha writes
`SKILL.md` from its site notes. This keeps Q17 whole. (b) **Us, as code**, the way an SDK
team writes integrations: faster, reviewable, and site logic in a directory we own is not
site logic in a hand, so Q17's reason (a reader patched under the person's Alpha where it could
not see or repair it) does not apply. Recommendation: (a) for the first version of each
connector, then (b) as the way we maintain them: a connector is a library we own, under git,
reviewed, proven in the clean room by its real runs. "Never by hand" stays the rule for a
person's own know-how. The seed of the first two connectors exists in Kenil's world today:
`linkedin_connections` (version 5), two LinkedIn job readers and `linkedin_message`; two Gmail
readers, `gmail_draft` and `gmail_send_draft`. Outlook starts from nothing and needs a test
mailbox.

**Generic by construction:** the export refuses a connector whose files name a person, an
email address or a profile URL that is not the site's own; `SKILL.md` is checked the same way.

## 5. Kits: a module's definition, standard or a client's

```
kits/intake-pipeline/
  kit.yaml            name, title, version, what it is for (the person's words), what changed since
                      the last version (plain words, shown before an update), uses: [connector:
                      outlook >= 2], needs: [sign-in to outlook.office.com, a key with its why],
                      the core version it needs, inside: (an optional parent module)
  WORKFLOW.md  workflow.json      the page, as read and as structured
  parts.yaml  parts/  requirements.txt   the parts, their contracts, pinned packages
  documents/          the templates
  agents/<name>.yaml  name, description, schedule, what it may touch, what done means; brief.md
  views/              saved lists, optional
  SIGNATURE           ed25519 over the tree; our key travels in the app
```

Never in a kit: rows, settings values anyone set, sign-ins, runs, health, notes, decisions, the
journal, `inputs/`, the venv, the trial's outputs. The export takes our tester's examples and
answers out of the page's words (one model pass, shown to us before it is saved) and refuses a
kit that still names a person or a row. A kit uses connectors; it carries no site know-how of
its own, so a LinkedIn fix is one connector update for every kit that uses it.

**Made by Alpha in a staging world** (`ALPHA_HOME=~/alpha-staging/<kit>`): the interview, the
page, the yes, the build, every part proven on a real item of ours; then **Export as a kit**
(the module page's menu; `alpha kit export <module> --to <dir>`). A fix or an enhancement is a
change by chat in staging, a run, and version n+1. A client kit is that client's IP: it lives in
a private place of ours and travels only on their channel (§7). Kenil's own modules can be
*adopted*: exporting Network records in his world that it is from the LinkedIn Network kit at
that base, so his world takes later versions like a client's.

**Installed into a world** by code, no model, in one transaction for the world's part: the
module (inside the parent the kit names; a name clash is a plain refusal); one table per thing,
empty; the settings table with every key, default and origin ("the workflow's"), a key the
person must supply left empty with its why; the page in state `built`, version 1; the workspace
with the kit's tree as the base commit and the venv built from `requirements.txt` with the app's
own Python (nothing machine-built travels); the agents, state `on` (a run before its sign-in
exists ends with the verdict "needs your sign-in"); the sources at `needs_signin`; a `kits` row
(name, version, channel, when, the module, the base tree hash); the journal: "Installed Intake
Pipeline (version 1)". The first-run page grows one row per need the installed kits and
connectors declare ("Sign in to Outlook so Alpha can read your inbox"; "Your Census key").
Nothing is pre-filled.

## 6. The boundary, by mechanism: ownership on every thing

The clear line Kenil asked for is one column, not a policy page. Every reader, procedure,
part, template, table, field, settings key and agent carries an **owner**: `platform`,
`connector:<name>@<version>`, `kit:<name>@<version>`, or none (the person's). And every managed
thing knows whether it was **changed since it was installed** (its version against the
installed one; a part's file against the base tree). That gives three states the window shows:

| State | Mark on the page | What an update does |
|---|---|---|
| Managed and untouched | "From the LinkedIn connector, version 3" | replaces it |
| Changed since install (by the person, or by their Alpha: a chat change, a repair by Doc) | "Changed from the kit" / "Changed from the connector" | keeps theirs, says what the update would have changed, and offers: keep mine, take the update, or (for a part) have Doc merge, as a run judged by code, undoable |
| Theirs | nothing | never touched |

Values are never managed: rows, settings values, a brief once edited, runs, health, notes,
decisions. A schema only grows: a thing or field dropped from a kit's workflow **stays**, marked
"no longer in the workflow", until the person deletes it. A setting's new default applies only
where the person never set a value. The page's structure merges by id (things, fields, settings,
steps); the person's own additions stay; where both sides changed the same step Alpha redrafts
the words once for the person's yes. Every update journals what it did under the kit's name; a
failed one rolls back (the world's transaction, the workspace's git); **back by version** is a
checkout of the previous base and the page's previous version, data untouched.

In words, for the README and Settings: *We manage the app, the connectors and your kits: what
we installed and you have not changed. Everything else is yours: your data, your sign-ins, what
you built or changed. An update replaces what we manage, never deletes, and tells you when it
would have changed something you changed.*

## 7. Updates: channels, fixes and changes, and the fix for fifteen people

**Channels.** An install follows two: `alpha` (the platform, the shared connectors, the
standard kits) and, for a client's people, `client:<name>` (that client's kits), set at install
from a file in the app zip, never typed. Each channel is a static, signed `index.json` over
HTTPS on a bucket of ours (kits and connectors with versions, URLs, hashes) and signed zips
beside it; no server, no account, no request carrying anything of the person's. A client's
channel sits at an unguessable path, and its zips are encrypted to a key the client's installs
carry (their kits are their IP). On launch, Alpha reads its channels once and compares. The app's own updater reads its JSON from the same place. A kit
file dropped on Settings › Kits takes the same install path, for when there is no network.
This is day one, not later: one client's fifteen people cannot be emailed a file each.

**Two levels of update, and this is a question (§13, 3).** A **fix** changes only managed
things that are untouched in that world and nothing a person decided (no new thing, field or
setting; no change to an agent's schedule or what it may touch; no new outward effect): it
applies at the next launch, with a line on Home and in Activity ("Updated the LinkedIn
connector to version 4: the connections page's new layout"). A **change** (anything else) is
offered on the module's page and on Home with the kit's own words, and taken on the person's
yes. The platform's own update is always a yes (the updater asks, then relaunches).

**The loop for one client's fifteen people**, in the order things actually happen:

1. Something breaks for Jane. **Doc** (Q49) repairs it on her Mac first, if it is Alpha's own
   know-how; the part or reader is now "Changed from the kit" in her world.
2. Jane presses **Save a report** (§10): versions, health, the problem's sentence, counts, logs,
   and, for a managed thing Doc changed, **the diff of that thing** (code, never data). She reads
   the folder and sends it.
3. We reproduce in the kit's staging world, take Doc's fix or make a better one by chat, run it,
   export version n+1, put it on the client's channel.
4. The other fourteen take it at their next launch as a fix, with a line saying what and why.
   Jane's install sees that the kit's new version of the part passes its run (judged by code)
   and offers to drop her local change for it; or keeps hers and says so.

Nothing in that loop reads anyone's world, and the fix is made once.

## 8. Many people at one client

One world per person stays (§3.5, rule 4). A client with twenty people is twenty installs on
one channel, each with its own data, sign-ins and changes; what they share is the kits. A client
admin is not needed for this: fixes flow by channel, changes ask each person on their own page.

**What this does not solve, and must be its own design session:** people at one client who work
the same rows (one intake list, one case file). That is sharing, not shipping. §3.5 says it is
done by syncing explicit records with their provenance, never a shared database or scope
columns on everything. Dell's case platform is that shape. Nothing here blocks it: a kit would
declare which of its things are shared, and the sync is the mechanism to design.

## 9. The platform's own updates, safely

- A **schema version** in `meta`, written on open; a world last written by a newer core is
  refused with a sentence, never migrated backwards.
- A **backup before the first open by a new version** (SQLite's backup into `backups/`,
  `world-before-<version>.sqlite`), the migration in one transaction, `PRAGMA integrity_check`
  and the journal's count unchanged; on failure the backup is put back and the window says so.
  Workspaces are untouched by a core update.
- **The app:** a new zip by link now; Tauri's updater once the signing identity is stable.
  Verified 16 Oct against Tauri's docs and source: the updater checks an ed25519 signature of
  ours on every update and that "cannot be disabled"; `createUpdaterArtifacts` makes
  `Alpha.app.tar.gz` and its `.sig`; it reads a static JSON (`version`, `notes`, `pub_date`,
  `platforms."darwin-aarch64".{url, signature}`), which is one more file on the `alpha`
  channel; it has no dialog of its own, so the yes and the relaunch are ours to ask.
- **Apple Developer ID and notarization (Q1 revisited).** Q1's own trigger is here. Without
  it: right-click › Open on every zip, warnings, and every client's Calendar and folder grants
  hang on our local certificate, which must then sign every build forever and never be
  regenerated. With it: $99 a year, and the work is known (16 Oct, from `tauri-bundler`'s
  source): `tauri build` signs the main binary, the frameworks and the sidecars and then the
  bundle, each with `codesign --force -s <identity>` and `--options runtime` when
  `hardenedRuntime` is on, never with `--deep` and never anything under `Contents/Resources`.
  So `ship.sh` signs every Mach-O in the runtime itself first (517 files on the 11 Oct build: Python, its
  extensions, Node), with the hardened runtime and the entitlements the public record says
  these need (`allow-jit` for Node's V8, `allow-unsigned-executable-memory` for Python's
  `ctypes`; nothing else until a failure asks for it), and the outer signing leaves them alone.
  Notarization then runs inside `tauri build` when `APPLE_ID`, `APPLE_PASSWORD` and
  `APPLE_TEAM_ID` are set: a `ditto` zip, `notarytool submit --wait`, then `stapler staple`,
  whose exit code Tauri does not check, so `ship.sh` ends with `spctl --assess` on the app. The
  clean room with a quarantined zip is the proof. Recommendation: now.
- *Sources for the two points above:* v2.tauri.app/plugin/updater and /distribute/sign/macos;
  `crates/tauri-bundler/src/bundle/macos/app.rs` and `crates/tauri-macos-sign/src/keychain.rs`,
  `lib.rs` on the `dev` branch; for the entitlements, Apple's developer forum threads 765679
  and 129546 and haim.dev's 2020 note on signing a Python app.

## 10. Keeping things running without their data

- **The report** (Settings › Save a report): the app's, the core's, each connector's and kit's
  version and channel; the schema version; the health of every reader, procedure and part with
  the problem's sentence; each agent's last verdict; the count of rows per table (counts, never
  rows); the host and core logs; the diff of any managed thing changed locally. Checked today:
  `host.log` holds launches and ports; `core.log` holds tracebacks that quote an action's title.
  So the report is a folder the person opens and reads before they send it, with a line at the
  top naming what is inside; Alpha sends nothing.
- **Doc is the first line**, on their Mac; the channel carries the fix to everyone.
- **When only their world shows it:** the person drives and we watch over a screen share.
  Never a copy of a world leaving their Mac, never remote access, never a sign-in of theirs.
  Written down in the README's "Sharing Alpha" section as the support policy.
- **Going back:** a kit or a connector by version; the core by the backup before migration.

## 11. The model route for clients

A claude.ai login inside a third-party product needs Anthropic's approval; an API key is the
sanctioned road and the CLI already takes one (`claude auth login --console`; the status
reports `via: console`). Options: (a) each person's own subscription, as the friend did,
against the policy as written; (b) ask Anthropic, with the pilot framing; (c) an API key per
install from a Console account, ours (one key per client, a spend limit per key, revocable) or
theirs. Settings gains "Use a key" beside Sign in; the key goes into Claude Code's own store,
never the world, never a kit. Recommendation: (c) with our keys for the pilots, (b) in
parallel. Cost is measured in staging before any number is quoted.

## 12. Order of work, each slice proposed in writing before it is built

| | Slice | What proves it |
|---|---|---|
| A | Core safety: schema version, backup before a migration, refusal of a newer world, integrity check | a copy of Kenil's world opened by a core one version ahead and one behind |
| B | Ownership: the owner and changed-since-install on skills, parts, templates, tables, fields, settings, agents; the three marks in the window; `purge.py` | tests; the marks on Kenil's world (everything "theirs" today) |
| C | Connectors: the directory shape beside the hands, export from a world, install into a world as owned skills, the needs on the first-run page | **the LinkedIn connector** exported from Kenil's world, installed into a fresh world, LinkedIn signed into there with his account, the connections reader untried then ok; then Gmail the same |
| D | Kits: export (a module with its agents, using connectors), install into a fresh world | **the LinkedIn Network kit** (his Network module: the table, the agent) in the fresh world, the agent's first run with a verdict; then the car wash (parts, settings, templates, a key the person supplies) |
| E | Update in place: fix and change, the three-way merge, schema add and rename, settings merge, back by version | a change by chat in staging to the Network kit, version 2, taken in the fresh world with rows kept; a part repaired locally before a kit update that changes it |
| F | Channels: the signed index on a bucket, the `alpha` and a client channel, the install's channel file, a kit file dropped on Settings, encryption of a client channel's zips | the clean room following a test channel; one fix taken at launch, one change asked |
| G | The report, with the diff of a changed managed thing | opened on Kenil's world: no row in it |
| H | "Use a key"; the Developer ID and notarization in `ship.sh` (the runtime's Mach-Os signed with their entitlements before `tauri build`); the updater reading the `alpha` channel | the clean room with a quarantined zip opening without right-click, and one update taken through the updater |
| I | Outlook: "only what is new" by the resource cursor, then the connector in staging with a test mailbox; the first client kit in staging | the client's own first run, with their own sign-in |

## 13. Questions

1. Four layers, and the boundary as ownership on every thing: an update replaces what we
   installed and they have not changed; what they changed is theirs, kept and flagged; nothing
   is ever deleted by an update. Yes?
2. Who builds a connector: Alpha in staging first, then maintained by us as code we own and
   review (a relaxation of "never by hand" for shared connectors only; it stays the rule for a
   person's own know-how)? Or Alpha only?
3. Two levels of update: a fix applies at the next launch with a line saying what and why; a
   change asks each person. Or does every update ask?
4. Channels from day one: a static signed index over HTTPS on a bucket of ours, an `alpha`
   channel and one per client, client zips encrypted to their installs, no server. Yes?
5. People at one client sharing the same rows is its own design session (one world per person
   stays; explicit synced records per §3.5). Park it?
6. The Apple Developer ID now (Q1 revisited)? Recommendation: yes.
7. The model route for clients: our API keys for the pilots and Anthropic asked in parallel? Or
   their subscriptions, knowing the policy?
8. Where they live: one library repository of ours (`alpha-library/`: `connectors/` and the
   standard `kits/`), and a private place per client for client kits; nothing in `alpha-brain`
   but the hands. Yes?
9. The first connector is LinkedIn from Kenil's own skills, then Gmail; Outlook needs "only what
   is new" and a test mailbox first. The first client and workflow?
10. The support policy: no remote access, no world copies, screen share with them driving, the
    report is what we get. Yes?
11. The words: **connector** for a site's know-how (Kenil's word, and the design's §4), **hand**
    for browser, files and calendar, **kit** for a module's definition.
