# Shipping Alpha to clients, and keeping it running without touching their data

A design proposal, 16 October 2026, from a planning session with Kenil. Nothing here is
built; the decisions it asks for become Qn rows in `alpha-second-brain-design.md` §11 once
taken, the way `knowledge-graph-proposal.md` became Q29.

## 1. The ask, in the project's words

Kenil, 16 Oct: a few clients will get Alpha. They cannot get a raw app; it must come set up
for them (connectors, modules such as "read emails from Outlook, categorise them, store
them") so there is something to work on from the start, with no data in it. Once they use
it, it holds their real data, and we must still fix and improve the app, the modules and the
connectors without reaching into that data or breaking it. So the platform, the connectors,
the skills and the modules must come apart, each updatable alone.

## 2. What is true today (read on 16 Oct, nothing assumed)

Where each kind of thing lives, who makes it, and whether another person could get it:

| Thing | Lives in | Made by | Could ship to a client today? |
|---|---|---|---|
| The window and the host | `Alpha.app` | us | yes (`just ship`, Q34) |
| The core, Python, Node, the connectors (the hands: browser, files, calendar) | `Alpha.app/Contents/Resources/runtime` | us | yes, inside the app |
| Operator configuration (prompts, built-in briefs, models, limits) | `core/alpha/config/` inside the core (moved out of the code files on 16 Oct, uncommitted) | us | yes, inside the app |
| A connection (a sign-in to a site, a folder, the calendar) | the world's `connections` rows and `browser/<site>/` profile folders | the person, in a window Alpha opens | **never**: a sign-in is theirs |
| Know-how: readers, procedures, pipelines (`skills`, 29 in Kenil's world: 23 readers, 3 procedures, 4 pipelines) and site notes | the world | Alpha, kept only after a real run, with health per run | no: it exists only in the world it was made in |
| A module: its row, its tables' shapes (`collections.schema`) **and their rows** (`records`), its settings table, its workflow page and versions, its sources, its note, its goals | the world, one file | Alpha with the person, from the workflow page (§12) | no: the shape and the data are one thing in one file |
| A module's workspace: `WORKFLOW.md`, `workflow.json`, `parts.yaml`, `parts/*.py`, `documents/*.md`, `requirements`, `.venv`, `inputs/`, under git with Alpha as the committer | `modules/<id>/` on disk | Alpha's build session | the files could; the venv is machine-built; nothing reads them into another world |
| An agent: its row (name, schedule, what it may touch), its brief and notes pages, its runs and decisions | the world | Alpha or the person; built-in kinds' frames in code, default briefs in config | no |
| The person's world: journal, entities, facts, documents, events, notes, decisions, commitments, preferences | `world.sqlite` | the person and their Alpha | **never** |

Already true, and worth keeping: the platform and the person's data are apart on disk
(`/Applications/Alpha.app` against `~/Library/Application Support/com.alpha.brain`), so
replacing the app never touches a world; the store's migrations are idempotent and run on
open; a schema "may only grow (new optional fields, wider choices) so saved records never lose
meaning" (`collections.py`); the workspace is already a git repository; built-in briefs are
copied once into a world and the person's copy is theirs from then on (`config/README.md`);
removing a module deletes everything of it and journals itself (`purge.py`); sources carry a
`needs_signin` status the page shows.

Not true yet, and in the way:

1. There is no way to take a module out of a world without its data, nor to put one into a
   world without building it there with the model. §4.0 left open "whether vetted, shared
   know-how (readers for common sites) ships with Alpha"; Q39 said "a library shared across
   modules now and across people later". Both are this.
2. The core has no schema version in `meta` (pending since the 3 Oct review), makes no backup
   before a migration, and will open a world written by a newer core.
3. The app has no updater. A new zip means right-click › Open again. There is no Apple
   Developer ID; Q1 said one is "taken up only when the app is distributed".
4. The model route for anyone but Kenil: "Unless previously approved, Anthropic does not allow
   third party developers to offer claude.ai login or rate limits for their products"
   (build-plan, verified 1 Oct). The friend used his own subscription; for clients that is a
   policy risk, not a technical one. The CLI also runs on an API key (`claude auth login
   --console`; `claude_account.status()` already reports `via: console`).
5. Nothing reads Outlook. Gmail is read in Alpha's browser by a reader Alpha wrote, and
   Outlook would be the same mechanism (a sign-in to `outlook.office.com` and a reader). But
   "reading only what is new on a list read daily" is not built, and an inbox read daily is
   otherwise read whole every time.

### 2.1 A word on words

What Kenil calls "the LinkedIn connector" is three things in Alpha: the **browser hand**
(platform, ships inside the app, never changed by Alpha), a **sign-in** to linkedin.com
(the person's own, made in a window Alpha opens, cannot be pre-set by anyone), and the
**know-how** for linkedin.com (the readers and procedures Alpha wrote, with their site
notes). The first ships with the app already. The second can only ever be asked for. The
third is what we can pre-set, and is the heart of this proposal.

## 3. The idea: a kit

One unit for "a thing we set up for a client": a **kit**. A kit is a module's whole
definition with everything it needs and nothing of anyone's data: the workflow page, the
things it keeps (their fields and relations), the settings with their defaults and origins,
the parts with their contracts and pinned requirements, the document templates, the readers
and procedures it uses with their site notes, its agents with their briefs and schedules, and
a list of what it needs from the person (which sites to sign in to, which keys to supply).
A kit is exported from a world where Alpha built it and proved it, installed into any world
by code, and updated in place while the world holds data.

The word: "pack" is taken (the context pre-pack), "bundle" is the app, "template" is a
document's, "package" is Python's. "Kit" is short, plain and free: the Outlook kit, your
kits, what's in the kit.

```
outlook-inbox/
  kit.yaml            name, title, version, what it is for (in the person's words),
                      what changed since the last version (plain words, shown before an update),
                      needs: sign-ins [outlook.office.com], keys [a settings key with why],
                      the core version it needs, inside: (an optional parent module)
  WORKFLOW.md         the page, as the person reads it
  workflow.json       the page, structured: things, fields, relations, settings, steps, documents
  parts.yaml  parts/  requirements.txt   the parts, their contracts, pinned packages
  documents/          the templates
  skills/<name>.yaml  a reader or procedure: script or steps, site, description, when to use,
                      its site notes; no health, no last run
  agents/<name>.yaml  name, description, schedule, what it may touch, what done means; brief.md
  views/              saved lists, optional
  SIGNATURE           ed25519 over the tree (our key travels in the app)
```

What never goes into a kit: rows, settings values the person set, sign-ins, runs, health,
notes and decisions, the journal, `inputs/`, the venv, the trial's outputs. The export runs
one model pass over the page to take our tester's examples and answers out of its words and
shows us the result before it is saved; a kit that still names a person or a row is refused
by the export's own check (the page's examples field must be empty).

### 3.1 Who makes a kit: Alpha, in a staging world of ours

Never by hand: the rule stands that Alpha's know-how is not patched by us (Q17). We run Alpha
on a staging home (`ALPHA_HOME=~/alpha-staging/<kit>`), signed into our own test accounts (a
test Outlook mailbox, a LinkedIn account that is not Kenil's), and build the module the
normal way: the interview, the page, the yes, the build, every part proven on a real item.
Then **Export as a kit** (the module page's menu, and `alpha kit export <module> --to
<dir>`). Fixes and enhancements go the same road: a change by chat in staging, a run, export
as version n+1. The kits live in a repository of ours, `alpha-kits/`,
next to `alpha-brain`, one directory per kit, a tag per version, so every version has a
history and a review before it ships. A hand edit to a part is the exception it is today and
asks Kenil first.

### 3.2 Installing a kit into a world (fresh or not)

By code, no model, in one transaction for the world's part:

- the module (inside the parent the kit names, if any; nothing if the name is taken: a
  plain refusal naming the clash);
- one table per thing, empty, with its fields and relations; the settings table with every
  key, its default and its origin ("the workflow's"), and a key the person must supply left
  empty with its why;
- the workflow page in state `built`, version 1, the kit's words;
- the workspace: the kit's files as the base commit of the module's git, the venv built from
  `requirements.txt` with the app's own Python (nothing machine-built travels; the build
  already does this with `$ALPHA_PYTHON -m venv`), the parts and templates registered as a
  build's are;
- the readers and procedures, health `untried`, provenance "from the Outlook Inbox kit,
  version 1"; the real-run rule holds per world: a shipped reader is proven in the client's
  world by its first run on their own sign-in, and health is theirs from then on;
- the agents, state `on`; a run before its sign-in exists ends with the verdict "needs your
  sign-in", which its page shows, and nothing is retried on a clock;
- the sources at `needs_signin`;
- a `kits` table row: name, version, when, from where (the app's own folder or a file), the
  module it made, the tree hash it installed (the base for every later update); every thing
  the kit made carries the kit's name in its provenance so an update finds it by id after the
  person renames it;
- the journal: "Installed Outlook Inbox (version 1)". The module's page says "From the
  Outlook Inbox kit, version 1".

**What the person is asked, and where.** The first-run page ("Set Alpha up to start") grows
one row per need the installed kits declare, after the account and the browser: "Sign in to
Outlook so Alpha can read your inbox" (opens the sign-in window, as Settings › Reads with
does today) and "Your Census key" (a settings row). Nothing else is asked, and nothing is
pre-filled.

**Kenil's own modules.** The export can also *adopt*: exporting his Network module records in
his world that it is "from the LinkedIn Network kit, version 1" at that base, so his world
takes later versions like a client's. This is also the cheapest acceptance (see §8).

### 3.3 Updating a kit in place, while the world holds data

Q39's rule for a change by chat, applied to a change from outside: data is re-derived where
that is safe and never where it is the person's own. An update is **offered, never applied
silently**: a card on the module's page and on Home, "Outlook Inbox has an update (version 3):
<the kit's own words for what changed>", with Update and Not now. Then, by code:

| What | Rule |
|---|---|
| A thing or field added | added, empty; `parts.retry` fills what it now can |
| A field renamed | renamed, data kept (the rename route exists since 13 Oct) |
| A thing or field no longer in the workflow | **never deleted by an update**: it stays, marked "no longer in the workflow" on the page; only the person deletes it (the clean-removal rule: the person triggers) |
| A setting added | added with the kit's default and origin |
| A setting's default changed | applies only where the person never set a value; theirs keep origin "you" |
| Parts, templates, requirements | a three-way merge in the workspace's git: base = the installed version's tree, theirs = the workspace now, ours = the new kit. Unchanged locally: taken. Changed locally only (Doc repaired it, Q49): kept. Changed on both sides: theirs is kept, the part is marked "differs from the kit" on the module page, and Doc is asked to bring the kit's change in as a run judged by code, undoable. The venv is rebuilt when requirements changed |
| A reader or procedure | the same three-way rule by version: replaced when its local version is the one the kit installed; kept and marked when it was repaired since, with the kit's copy beside it as the one to fall back to |
| An agent | schedule, what it may touch and the brief are the kit's until the person changed them, then theirs (the built-in briefs' rule) |
| The workflow page | a new version, the previous kept, as every change by chat does. Structure merges by id (things, fields, settings, steps); the person's own additions stay; Alpha redrafts the words once for the person's yes when both sides changed the same step |
| The journal | "Updated Outlook Inbox from version 2 to 3: <what changed>" |

A failed update rolls back: the world's transaction, and the workspace's git reset to where
it was. **Going back** is a feature, not a recovery: "Back to version 2" checks the workspace
out at the previous base and the page at its previous version; data is untouched because the
schema only grew.

### 3.4 Where kits come from, and how they reach a client

- **The first install:** `just ship --kits outlook-inbox linkedin-network` puts the named
  kits' current versions into the app under `Contents/Resources/kits/`; the first run on a
  fresh world installs them. One zip per client set, minutes each (the runtime is cached).
  The same app with no kits is Alpha as today.
- **Later, two roads, one install path:** (a) a new app zip carrying newer kits: on every
  launch the core compares the carried kits with the installed ones and offers what is newer;
  (b) a kit file, `outlook-inbox-3.alphakit` (a signed zip), sent to the client and dropped
  on Settings › Kits or opened with Alpha. No server, no account, no network call of ours.
  A static index over HTTPS comes when there are more clients than we can email.
- **Signing:** ed25519 (minisign) with our public key compiled into the app; a kit that is
  unsigned or does not verify is refused with one sentence. A kit's parts run under the same
  walls as a built part (the Seatbelt profile, Alpha's proxy to the hosts `reaches` names).

### 3.5 Several kits in one world

One kit is one module (with its subtree if it names children later; one level at first). A
reader is global by name in a world, so a reader belongs to the kit that shipped it; a second
kit that needs the same site's reader declares `uses:` it and needs that kit, or ships its own
under its own name. The library across modules (§12, not built) can ride on kits later; not
designed here.

## 4. The platform's own updates, safely

- **A schema version** in `meta`, written by the core on open. A world last written by a
  newer core is refused with a sentence ("This world was last used by a newer Alpha; update
  Alpha to open it"), never migrated backwards.
- **A backup before the first open by a new version** (SQLite's backup into `backups/`,
  named `world-before-<version>.sqlite`), then the migration in one transaction, then
  `PRAGMA integrity_check` and the journal's count unchanged; on any failure the backup is
  put back and the window says what happened. Workspaces are untouched by a core update.
- **The app:** now, a new zip by link, as today; later, Tauri's updater (a signed manifest at
  a URL of ours, the person's yes, relaunch). The updater needs a stable signing identity.
- **The hands (connectors) stay inside the app.** They are platform: few, universal, never
  site-specific (Q17, Q23). A change to one is a core update. Nothing of theirs is a kit.
- **Apple Developer ID and notarization (Q1 revisited).** Q1's trigger, "when the app is
  distributed", is here. Without it: right-click › Open on every zip, macOS warnings, and
  every client's Calendar and folder grants hang on our *local* certificate, which must then
  sign every build forever and never be regenerated. With it: $99 a year, `notarytool` in
  `ship.sh`, the hardened runtime, which means signing every Mach-O inside the runtime
  (Python's extensions, Node) with the entitlements Node's JIT and Python's loading need; a
  day's work to get right, with the clean room as the proof. Recommendation: now.

## 5. The model route for clients

Facts: a claude.ai login inside a third-party product needs Anthropic's approval; an API key
is the sanctioned road and the CLI already takes one. Options:

- (a) each client's own subscription, as the friend did: against the policy as written; the
  risk is their account, not ours, but it is ours to have told them;
- (b) ask Anthropic for approval, with the pilot framing;
- (c) an API key per client from a Console account: ours (we pay, one key per client, a spend
  limit per key in the Console, revocable) or theirs. Settings gains "Use a key" beside Sign
  in; the key goes into Claude Code's own store, never the world, never a kit.

Recommendation: (c) with our keys for the pilots, and (b) in parallel. Cost is measured in
staging before any number is quoted; none here.

## 6. Keeping things running without their data

- **The report** (Settings › "Save a report"): the app's, the core's and each kit's version;
  the schema version; the health of every reader, procedure and part with the problem's
  sentence; each agent's last verdict; the count of rows per table (counts, never rows); the
  host and core logs. Checked today: `host.log` holds launches and ports; `core.log` holds
  tracebacks that quote an action's title. So the report is a folder the person can open
  and read before they send it, with a line at the top naming what is inside; nothing is
  sent by Alpha. We read it, reproduce in staging, ship a kit or a core update.
- **The first line is Doc** (Q49), on their Mac: a site that changed its page is repaired
  there, and the next kit update merges or keeps the repair (§3.3).
- **When only their world shows it:** the person drives and we watch over a screen share.
  Never a copy of a world leaving their Mac, never remote access, never a sign-in of theirs.
  Written down as the support policy, in the README's "Sharing Alpha" section.
- **Going back:** a kit, by version (§3.3); the core, by the backup before the migration.

## 7. The decoupling, in one table

| Layer | Unit | Lives in | Made by | Updated by | Touches their data? |
|---|---|---|---|---|---|
| The window and the host | `Alpha.app` | `/Applications` | us | a new app (a zip now, the updater later), their yes | never |
| The core, the runtime, the hands, the operator configuration | inside the app | `/Applications` | us | with the app; migrations on open, backed up first, forward only | the schema only, and it only grows |
| Kits: a module's definition, its know-how, its agents | `kits/` in the app and `.alphakit` files | installed into the world and the workspace | Alpha in our staging world, exported | offered per kit with their yes; three-way merge; back by version | adds and renames; never deletes |
| Connections: sign-ins, folders, the calendar | the world and `browser/` | their Mac | them | never by us | theirs |
| Their world: rows, facts, journal, notes, runs, decisions | `world.sqlite` | their Mac | them and their Alpha | never by us | theirs |

Nothing per client goes into the platform; a client's set-up is a list of kit names.

## 8. Order of work, each slice proposed in writing before it is built

| | Slice | What proves it |
|---|---|---|
| A | Core safety: the schema version, the backup before a migration, the refusal of a newer world, the integrity check | tests on a copy of Kenil's world opened by a core one version ahead and one behind |
| B | Kits: export (a module with its skills and agents), install into a fresh world, the needs on the first-run page, the `kits` table in `purge.py` | **Kenil's Network module** exported from his world, installed into a fresh world, LinkedIn signed into there with his account, the reader untried then ok, the agent's first run with a verdict. Then the car wash (parts, settings, templates, a key the person supplies) |
| C | Update in place: the three-way merge, schema add and rename, settings merge, the offer card, back by version | a change by chat in staging to the Network kit, version 2, offered and taken in the fresh world with its rows kept; then a part repaired locally before an update that changes it |
| D | Ship per client: `just ship --kits`, the app's kits folder, a kit file dropped on Settings, signing | the clean room, with a kit inside and one dropped |
| E | The report | opened and read on Kenil's world: no row in it |
| F | "Use a key" in Settings; the Developer ID and notarization in `ship.sh`; later the updater | the clean room with a quarantined zip opening without right-click |
| G | The first kit for a client, in staging, with its prerequisites (an inbox needs "read only what is new") | the client's own first run, with their own sign-in |

## 9. Questions

1. Kits are made by Alpha in a staging world and exported, never written by hand. It costs a
   staging world and test accounts per kit. Yes?
2. The Apple Developer ID now (Q1 revisited)? Recommendation: yes.
3. The model route for clients: our API keys for the pilots and Anthropic asked in parallel
   (c + b)? Or their subscriptions, knowing the policy?
4. Updates are offered and taken with a yes, for kits and for the app, never applied silently.
   Yes?
5. A thing or field dropped from a workflow stays in the client's world until they delete it.
   Yes?
6. When a part was repaired locally and the kit changed it too: keep theirs and have Doc
   merge, flagged (recommendation), or take the kit's and keep theirs as "before"?
7. Kits in their own repository (`alpha-kits/`, own cadence, no platform code near client
   know-how), or `kits/` inside `alpha-brain`? Recommendation: their own.
8. The first client and workflow. Dell Disability Lawyers is Outlook, which needs "read only
   what is new" first; LinkedIn Network could ship from Kenil's own world now.
9. The support policy: no remote access, no world copies, screen share with them driving, the
   report is what we get. Yes?
10. The word "kit".
