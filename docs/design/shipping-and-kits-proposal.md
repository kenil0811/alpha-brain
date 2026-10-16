# Shipping Alpha to clients, and keeping it running without touching their data

A design proposal, 16 October 2026, from a planning session with Kenil. Third version: the
second was rewritten after his refinement the same day; this one folds in the prior-art
research he asked for before answering (`research/shipping-and-updates.md`, six passes, about
650 sources). Nothing here is built; the decisions it asks for become Qn rows in
`alpha-second-brain-design.md` §11 once taken, the way `knowledge-graph-proposal.md` became Q29.

## 1. The ask, in the project's words

Kenil, 16 Oct. A few clients will get Alpha. It cannot be a raw app: it must come with
pre-built, **generic connectors** that every install can use ("a LinkedIn connector which knows
how to read data from LinkedIn and write messages and posts, similarly a Gmail connector, an
Outlook connector … no IP, no specific info … maybe something like how Claude skills are") and
**standard agents**, with no data in it. A client may be **20 people, each on their own Alpha**.
We also build **ad hoc pipelines for one client** (15 users), and when one does not work we
must fix it for all 15 "without messing up their customizations / personal things they've
built". So: "very clear boundaries on what we change/manage, vs what they can do". Then:
"before this, can you do some research on best practices, and how other similar
products/services are managing such things."

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
   And the README's "right-click › Open" is wrong since macOS 15: Apple removed that escape in
   Sequoia (notice of 6 Aug 2024); a non-notarized app now needs System Settings › Privacy &
   Security › Open Anyway on every Mac.
5. Anyone but Kenil on the model route: Anthropic's Claude Code legal page (read 16 Oct) says
   "Customers may not pay for, resell, or intermediate Claude usage on their end users' behalf.
   Each end user must authenticate with their own Anthropic API key, Claude subscription plan
   credentials, or 3P inference provider credential", and, the carve-out, "Nor does it prevent an
   end user from signing in to the unmodified Claude Code binary with their own Claude
   subscription, including where a platform hosts Claude Code". Exceptions only "unless we've
   mutually agreed otherwise", through contact-sales; no criteria are published.
6. A list is read whole every time; "only what is new" (the connector shape's cursor) is not
   built. An inbox needs it. And reading a mailbox in the person's own browser has no published
   safe harbour from Microsoft (its acceptable-use policy bars "any automated process or service
   to access or use the Services") or Google (a grey area, unaddressed).

### 2.1 A word on words

In the design, the **hands** are the browser, files and the calendar: universal, platform,
never site-specific (Q17, Q23). What Kenil calls "the LinkedIn connector" is know-how about one
site on top of a hand. The design's §4 calls that a connector too. The research found the same
words across the industry: **connector** names the vendor-maintained adapter almost everywhere
(Prismatic, Workato, Cyclr, Airbyte, Fivetran, Power Platform, Claude's own Team plan) and
**connection** names a stored credential bound to a person. So from here: **connector** = a
site's know-how, in the Agent Skills shape; **connection** = the person's sign-in or key;
**hand** = browser, files, calendar; **kit** = a module's definition (§5; no settled industry
word: the nearest are Zapier's and Cyclr's "template", Workato's "package", Power Platform's
"solution", Home Assistant's "blueprint"). The `connectors/` directory keeps its name; the hands
are the entries with `origin: builtin`.

## 3. Four layers: three we manage, one that is theirs

| Layer | Unit | Format | Made by | Reaches an install by | An update may |
|---|---|---|---|---|---|
| **Platform** | the app, the core, the hands, the built-in agent kinds and their frames, operator configuration | the app bundle | us | a new app (a zip now, the updater later) | change code; migrate the schema forward, backed up first |
| **Connectors** (shared, generic) | one site's or service's know-how: readers, procedures, how it behaves | `connectors/<name>/` in the Agent Skills shape, versioned | Alpha in our staging world, then maintained by us (§4.1) | inside the app, and on the `alpha` channel (§7) | replace a reader or procedure the person has not changed |
| **Kits**: standard (ours, generic: "LinkedIn Network", "Inbox triage") and client (one client's workflow, its 15 users) | a module's definition: things and fields, settings' keys and defaults, parts, templates, agents' defaults, which connectors it uses | `kits/<name>/`, versioned (§5) | Alpha in a staging world, exported | inside the app, and on the `alpha` or the client's channel | add things, fields and settings; replace parts, templates and agents' defaults the person has not changed; never delete |
| **Theirs** | their data, sign-ins and keys, settings' values, everything they built or changed by chat (modules, agents, readers, saved lists, a brief once edited), and any managed thing once they changed it | the world and the workspace | them and their Alpha | — | nothing. Never read, never changed, never deleted by us |

Nothing per client goes into the platform. A client's set-up is a channel name and a list of
kits; a person's set-up is that plus whatever they make. This is the shape every proven
platform converged on: a recorded baseline for each shipped thing, a separate home for the
customer's changes, and credentials in a per-customer record the artifact never contains
(Salesforce's manageability rules, Power Platform's layers and connection references,
Prismatic's integration-versus-instance, dpkg's conffiles).

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

The Agent Skills specification itself has no version field (only free-form `metadata`), so the
version and the provenance live in `connector.yaml` and in the channel's index, and two installs
are compared by version and content hash. A connector ships whole and never fetches
instructions or code at run time: that is the rule Chrome's Manifest V3 enforces and the one
ClawHub's poisoned skills exploited (341 malicious skills found on 1 Feb 2026, lured through a
"prerequisites" download), and it is what makes a review mean anything.

**Installed into a world** as rows in `skills`, owner `connector:linkedin@3`, health `untried`:
the real-run rule holds per world, a shipped reader is proven in the person's world by its
first run on their own sign-in, and its health is theirs from then on. The site notes land as
the `skill:<name>` page. The app's own copy and a channel's newer copy both load; the newer
wins. A person's Alpha may still write its own readers for the same site; those are theirs.

### 4.1 Who builds and keeps a connector

Two roads, and this is a question (§14, 2). (a) **Alpha, in a staging world of ours**, signed
into our own accounts: Alpha writes the readers and procedures the normal way, each kept after
a real run; we export the site's skills as the connector directory and Alpha writes `SKILL.md`
from its site notes. This keeps Q17 whole. (b) **Us, as code**: faster, reviewable, and site
logic in a directory we own is not site logic in a hand, so Q17's reason (a reader patched
under the person's Alpha where it could not see or repair it) does not apply. Recommendation:
(a) for the first version of each connector, then (b) as the way we maintain them: a connector
is a library we own, under git, reviewed, proven by its real runs. "Never by hand" stays the
rule for a person's own know-how. The seed of the first connector exists in Kenil's world:
`linkedin_connections` (version 5), two LinkedIn job readers and `linkedin_message`.

**Canaries, from the research.** Apify tests every shared Actor daily on the vendor's side (a
run that succeeds and returns rows within five minutes; three failing days mark it "under
maintenance"; a site-caused failure is healed automatically after seven passing days), and
Phantombuster keeps a public page of known issues per site. So: every shared connector runs
daily in our staging world on our own signed-in accounts (Apify's blind spot, "authenticated
Actors always fail the tests", does not apply when the vendor holds the sessions), and the
channel's index carries a **known-issues notice** per connector ("LinkedIn changed its
connections page on 12 Oct; a fix is coming"), so an install shows that instead of blaming
itself and Doc does not spend its repairs on a breakage we already know. Readers also get
offline fixtures: a scrubbed recording of a real session (Playwright's HAR record and replay),
so a change to a reader is tested without a sign-in.

**Generic by construction:** the export refuses a connector whose files name a person, an
email address or a profile URL that is not the site's own; `SKILL.md` is checked the same way.

### 4.2 Which road for which site (changed by the research)

- **LinkedIn: the browser, at human pace, as today.** There is no API for connections,
  messages or search (only Sign In and Share are open; the rest is partner-only). The User
  Agreement of 3 Nov 2025 bans "browser plugins and add-ons or any other technology" that
  scrape or automate, and in March 2026 LinkedIn removed an automation vendor's company page
  and its executives' profiles while its customers ran on. The posture stays Q3's and is the
  lowest-risk one the research found: one person per account, every action initiated and
  approved by that person, human-paced reads in their own session, no bulk export, no cookie
  sharing, no proxies, and **no page of ours advertising LinkedIn automation**. Risk reduced,
  not removed; the failure mode is the person's account, and the kit's words say so.
- **Outlook: Microsoft Graph, not the browser.** Delegated `Mail.Read` and `Mail.Send` need
  no admin consent by default; an unverified multitenant app triggers "step-up" admin consent,
  which a client firm's admin grants once per tenant, or the firm registers a single-tenant app
  of its own (no verification, no warning). A desktop app signs in with the authorization code
  flow and a loopback redirect (`127.0.0.1`) or the device code flow, and the token lives in
  the Keychain. "Only what is new" is Graph's own delta query. So the Outlook connector is
  `transport: http-api`, `auth: oauth`, exactly a shape §4 already allows; it needs a test
  tenant (one paid seat, about $7 a month) rather than a test mailbox in a browser.
- **Gmail: the API, per firm.** All read scopes are restricted: a vendor-published app needs
  Google's verification plus an annual lab assessment (quotes of $3,000–6,000) and sits under a
  100-user cap until then. The exemption that fits a client firm on Google Workspace is an
  **Internal** OAuth project owned by the firm, or an admin-trusted app, with no verification
  and no cap. So the Gmail connector is `transport: http-api` too, set up per firm by its
  Workspace admin. Kenil's own Gmail readers (browser) stay his; they are not the shipped
  connector.

## 5. Kits: a module's definition, standard or a client's

```
kits/intake-pipeline/
  kit.yaml            name, title, version, what it is for (the person's words), what changed since
                      the last version (plain words, shown before an update), uses: [connector:
                      outlook >= 2], needs: [sign-in to Outlook, a key with its why],
                      the core version it needs, inside: (an optional parent module)
  WORKFLOW.md  workflow.json      the page, as read and as structured
  parts.yaml  parts/  requirements.txt   the parts, their contracts, pinned packages
  documents/          the templates
  agents/<name>.yaml  name, description, schedule, what it may touch, what done means; brief.md
  views/              saved lists, optional
```

Never in a kit: rows, settings values anyone set, sign-ins, runs, health, notes, decisions, the
journal, `inputs/`, the venv, the trial's outputs. The export takes our tester's examples and
answers out of the page's words (one model pass, shown to us before it is saved) and refuses a
kit that still names a person or a row. A kit uses connectors; it carries no site know-how of
its own, so a LinkedIn fix is one connector update for every kit that uses it. A kit's parts,
like a connector, ship whole and fetch nothing at run time.

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
(name, version, channel, when, the module, the base tree hash, and the hash of every managed
thing as installed); the journal: "Installed Intake Pipeline (version 1)". The first-run page
grows one row per need the installed kits and connectors declare ("Sign in to Outlook so Alpha
can read your inbox"; "Your Census key"). Nothing is pre-filled.

## 6. The boundary, by mechanism: ownership on every thing

The clear line Kenil asked for is one column, not a policy page. Every reader, procedure,
part, template, table, field, settings key and agent carries an **owner**: `platform`,
`connector:<name>@<version>`, `kit:<name>@<version>`, or none (the person's). And every managed
thing has a **recorded baseline**: the hash of its content as installed. "Changed since
install" is the content against that baseline, never a flag anyone sets (dpkg's conffile
md5sums, Copier's recorded template commit, Helm's last-applied manifest all work this way),
and a thing changed and then changed back counts as untouched (ServiceNow skips "every record
that was ever customized", even restored ones, and one admin reviewed 430 of them by hand; the
hash avoids that). That gives three states the window shows:

| State | Mark on the page | What an update does |
|---|---|---|
| Managed and untouched | "From the LinkedIn connector, version 3" | replaces it |
| Changed since install (by the person, or by their Alpha: a chat change, a repair by Doc) | "Changed from the kit" / "Changed from the connector" | keeps theirs, says what the update would have changed, and offers: keep mine, take the update (reversible, like ServiceNow's "revert to base"), or (for a part) have Doc merge, as a run judged by code, undoable |
| Theirs | nothing | never touched |

Settings › Kits & connectors lists every managed thing that differs from its kit, with those
three choices, so a person's change never silently masks a fix forever (Power Platform's
unmanaged layer does exactly that, and its only cure is an irreversible "remove active
customizations").

Values are never managed: rows, settings values, a brief once edited, runs, health, notes,
decisions. A schema only grows: a thing or field dropped from a kit's workflow **stays**, marked
"no longer in the workflow" and listed in Settings with Export and Delete, until the person
deletes it (Salesforce deprecates and never deletes; Fivetran writes NULL forward; Power
Platform's "Update" never deletes; CloudKit's production schema cannot delete a field at all).
**A removed thing's name is reserved forever**: a later kit version never reuses it, because
Salesforce documents an upgrade failing years later on exactly that. A setting's new default
applies only where the person never set a value (Anki's `meta.json` over `config.json`;
VS Code's default < user layers). The page's structure merges by id (things, fields, settings,
steps); the person's own additions stay; where both sides changed the same step Alpha redrafts
the words once for the person's yes. Every update journals what it did under the kit's name; a
failed one rolls back (the world's transaction, the workspace's git); **back by version** is a
checkout of the previous base and the page's previous version, data untouched.

In words, for the README and Settings: *We manage the app, the connectors and your kits: what
we installed and you have not changed. Everything else is yours: your data, your sign-ins, what
you built or changed. An update replaces what we manage, never deletes, and tells you when it
would have changed something you changed.*

## 7. Updates: channels, fixes and changes, and the fix for fifteen people

**Fix or change, by the industry's one criterion.** No vendor draws the line by code size;
all draw it by what the person would have to do. Tray applies a non-breaking version to every
instance within about two minutes and re-runs its wizard only when an input or a scope changes;
Microsoft Teams installs an app update automatically when it needs no new permission and asks
each user when it does, and "admins can't consent on behalf of the users"; Airbyte applies
minor and patch versions at once and gives majors a dated window. So, by code: a **fix** is a
version that asks nothing new of the person (no new thing, field, setting or key; no new
sign-in or scope; no new outward effect; no changed or renamed output) and touches only
managed things that are untouched in that world. It applies at the next launch, with a line on
Home and in Activity ("Updated the LinkedIn connector to version 4: the connections page's new
layout"), and then **proves itself**: the next run of what it changed is judged as every run
is, and a failure where the previous version passed rolls the install back to that version by
itself, says so, and puts it in the report (Home Assistant rolls a failed core update back
after its health check). A **change** (anything else) is offered on the module's page and on
Home with the kit's own words, taken on the person's yes, and never forced: Alpha runs on
their Mac, and the vendors whose customers hold the code (Stripe, n8n, Cyclr) never force
either. A change not taken stays offered; fixes for that kit then wait on it, and the page says
so (n8n's rule: a workflow keeps the node version it was built with, and gets no fixes for it).
The platform's own update is always a yes (the updater asks, then relaunches).

**Channels.** An install follows two: `alpha` (the platform, the shared connectors, the
standard kits) and, for a client's people, `client:<name>` (that client's kits), set at install
from a file in the app zip, never typed. Each channel is one **signed index** over HTTPS on a
bucket of ours, built the way the Update Framework and apt's `InRelease` say an index must be:
a strictly increasing serial, an issued date and an **expiry** a few weeks out (refreshed on a
schedule even without releases, so a frozen or replayed index is refused; Sparkle's 20-day
"show updates anyway" failsafe is the trade we do not make), every artifact's path, length and
SHA-256, the minimum app version that may install it, a **halt** flag per artifact, and the
connectors' known-issues notices (§4.1); beside it, each artifact signed with ed25519
(minisign, the version in the trusted comment so an older artifact can never be served as
newer). The keys stay offline with a rotation path written down. No server, no account, no
request carrying anything of the person's. A client's channel is private the way vendors
actually do it: a per-client token the install sends as a header to that origin only (the
pattern Keygen and signed CloudFront URLs use; hiding the URL is not security, and encrypting
artifacts to install keys is something no vendor was found doing). On launch, Alpha reads its
channels once and compares. The app's own updater reads its JSON from the same place. A kit
file dropped on Settings › Kits takes the same install path, for when there is no network.
This is day one, not later: one client's fifteen people cannot be emailed a file each.

**Rolling out.** Percentages mean nothing inside a firm of fifteen. The useful analogue is
Firefox's "25% for a day": a fix goes first to one Mac per firm (the index names the canary
install) for a day, then to all; the halt flag stops new installs of a version (Google Play's
honest model: a halt stops the spread, nobody is rolled back by the server); the install's own
roll-back after a failed run (above) covers the rest. "Rollback" of the app is a higher-numbered
build of the old code, which is safe only while the schema change it crosses is additive (§9).

**The loop for one client's fifteen people**, in the order things actually happen:

1. Something breaks for Jane. **Doc** (Q49) repairs it on her Mac first, if it is Alpha's own
   know-how; the part or reader is now "Changed from the kit" in her world. (The research found
   no product that shares repairs across customers; the nearest, Anchor Browser, writes a
   repair as a draft a human approves. This loop is that, with us as the human.)
2. Jane presses **Save a report** (§10): versions, health, the problem's sentence, counts, logs,
   and, for a managed thing Doc changed, **the diff of that thing** (code, never data). She reads
   the folder and sends it.
3. We reproduce in the kit's staging world, take Doc's fix or make a better one by chat, run it,
   export version n+1, put it on the client's channel.
4. The canary takes it first, the other thirteen a day later, as a fix with a line saying what
   and why. Jane's install sees that the kit's new version of the part passes its run (judged
   by code) and offers to drop her local change for it; or keeps hers and says so.

Nothing in that loop reads anyone's world, and the fix is made once.

## 8. Many people at one client

One world per person stays (§3.5, rule 4). A client with twenty people is twenty installs on
one channel, each with its own data, sign-ins and changes; what they share is the kits. A client
admin is not needed for this: fixes flow by channel, changes ask each person on their own page.
Where the firm has device management, its profile can pre-grant Calendar and folder access to
Alpha by its signing identity (Apple's privacy-preferences payload) so nobody is asked; where it
has none, the first-run page asks as today. The research found no current figure for how many
firms of 10–20 Macs run device management, so the design must do both.

**What this does not solve, and must be its own design session:** people at one client who work
the same rows (one intake list, one case file). That is sharing, not shipping. §3.5 says it is
done by syncing explicit records with their provenance, never a shared database or scope
columns on everything. Dell's case platform is that shape. Nothing here blocks it: a kit would
declare which of its things are shared, and the sync is the mechanism to design.

## 9. The platform's own updates, safely

- A **schema version** in `meta`, as major and minor (Home Assistant's rule since Dec 2023: a
  minor bump is additive and an older version may still open the file; a major bump is not,
  and an older core refuses the file with a sentence). Written on open; a world last written by
  a newer major is refused, never migrated backwards (Firefox 67 and Lightroom do the same).
- A **backup before the first open by a new version** (SQLite's backup into `backups/`,
  `world-before-<version>.sqlite`, kept until the version after it has proven itself), the
  migration in one transaction, `PRAGMA integrity_check` and the journal's count unchanged; on
  failure the backup is put back and the window says so. No toggle: the copy is a few
  megabytes, and Home Assistant removed its "backup before update" switch in Jan 2025 and had
  to put it back a month later. Workspaces are untouched by a core update. Every documented
  data-loss upgrade the research found (Windows 10 1809, Lightroom mobile 5.4.0, iOS 17.5,
  Catalina Mail, Audacity 3.0) rewrote data in place with no copy and no check afterwards.
- **The app:** a new zip by link now; Tauri's updater once the signing identity is stable.
  Verified 16 Oct against Tauri's docs and source: the updater checks an ed25519 signature of
  ours on every update and that "cannot be disabled"; `createUpdaterArtifacts` makes
  `Alpha.app.tar.gz` and its `.sig`; it reads a static JSON (`version`, `notes`, `pub_date`,
  `platforms."darwin-aarch64".{url, signature}`), which is one more file on the `alpha`
  channel; it has no dialog of its own, so the yes and the relaunch are ours to ask; it refuses
  a downgrade unless told otherwise.
- **Apple Developer ID and notarization (Q1 revisited), now stronger.** Q1's own trigger is
  here, and two facts from the research make it urgent. Since macOS 15 (Apple's notice of
  6 Aug 2024) right-click › Open no longer bypasses Gatekeeper: a non-notarized app shows
  "Apple cannot check … for malicious software" and the person must find Open Anyway in
  System Settings, on every Mac. And macOS keys every Calendar, folder and Full Disk grant to
  the app's code-signing designated requirement (Apple's TN3127), so the first Developer ID
  build re-prompts every grant a self-signed build was given; Claude Code's own CLI had this
  bug in May 2026 (a new identity per version, a Full Disk prompt after every update). So the
  switch happens once, early, before any client grants anything, and enrolment is made by the
  entity that will ship for good (a company enrolment needs a legal entity, a D-U-N-S number and
  a domain; moving from an individual's certificate later is another re-prompt). The private
  key stays offline or in Apple's cloud signing. The work is known (16 Oct, from
  `tauri-bundler`'s source): `tauri build` signs the main binary, the frameworks and the
  sidecars and then the bundle, each with `codesign --force -s <identity>` and `--options
  runtime` when `hardenedRuntime` is on, never with `--deep` and never anything under
  `Contents/Resources`. So `ship.sh` signs every Mach-O in the runtime itself first (517 files
  on the 11 Oct build: Python, its extensions, Node), with the hardened runtime and the
  entitlements the public record says these need (`allow-jit` for Node's V8,
  `allow-unsigned-executable-memory` for Python's `ctypes`; nothing else until a failure asks
  for it), and the outer signing leaves them alone. Notarization then runs inside `tauri build`
  when `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID` are set: a `ditto` zip, `notarytool
  submit --wait`, then `stapler staple`, whose exit code Tauri does not check, so `ship.sh`
  ends with `spctl --assess` on the app. The clean room with a quarantined zip is the proof.
  Recommendation: now, and the README's right-click sentence is corrected in the same change.
- *Sources for the updater and signing facts:* v2.tauri.app/plugin/updater and
  /distribute/sign/macos; `crates/tauri-bundler/src/bundle/macos/app.rs` and
  `crates/tauri-macos-sign/src/keychain.rs`, `lib.rs` on the `dev` branch; Apple's developer
  news of 6 Aug 2024 and TN3127; for the entitlements, Apple's developer forum threads 765679
  and 129546 and haim.dev's 2020 note on signing a Python app.

## 10. Keeping things running without their data

- **The report** (Settings › Save a report), built the way 1Password, Firefox, Signal and
  VS Code build theirs: an allow-list, never a filtered dump. The app's, the core's, each
  connector's and kit's version and channel; the schema version; the health of every reader,
  procedure and part with the problem's sentence; each agent's last verdict; the count of rows
  per table (1Password sends "the number of items", never an item); the host and core logs with
  quoted titles redacted; the diff of any managed thing changed locally. Each part of the
  report is a checkbox with a preview (VS Code's issue reporter), the folder opens before
  anything is saved, and Alpha sends nothing: the person does. Checked today: `host.log`
  holds launches and ports; `core.log` holds tracebacks that quote an action's title, hence
  the redaction.
- **Doc is the first line**, on their Mac; the channel carries the fix to everyone.
- **When only their world shows it:** access the person switches on, time-boxed and logged, as
  Atlassian (until the ticket closes) and Notion (28 days, and "they'll ask you to approve that
  specific action first") do it: a screen share with the person driving and keeping control.
  Never a copy of a world leaving their Mac, never remote access, never a sign-in of theirs.
  Written down in the README's "Sharing Alpha" section as the support policy. The zero-access
  vendors (Obsidian, Standard Notes, Anytype, Things) support through export and restore, so the
  world's export and its backups are support features and stay one click.
- **Going back:** a kit or a connector by version (§6); the core by the backup before
  migration; a fix by the install's own roll-back after a failed run (§7).

## 11. The model route for clients (changed by the research)

Anthropic's terms, read on 16 Oct, settle this more than I had assumed. The person's **own
subscription**, signing in to the unmodified `claude` binary through Anthropic's own flow, is
the one subscription route the page explicitly permits, and it is what Alpha does today: the
binary is unmodified, no auth method is disabled, and Alpha never sees the token. The firm's
**own Console organisation** is the other sanctioned shape: the firm pays Anthropic, its
"Claude Code workspace" mints a per-user key at sign-in and is the only workspace with per-user
monthly spend limits, and the usage is "billed to the key owner". **Our own keys per install
are the prohibited shape** for Claude Code ("Customers may not pay for, resell, or intermediate
Claude usage on their end users' behalf") unless "mutually agreed otherwise" through
contact-sales, where no criteria or timeline are published. Two caveats: advertised Pro and Max
limits "assume ordinary, individual usage", and whether daily agent runs are that is undefined,
so a firm with heavy automation is steered to its own Console organisation; and the policy was
enforced against third-party clients from 9 Jan 2026, so this is live. The BYOK norm elsewhere
(Cursor, Raycast, Zed, Cline) is the same harness-owned sign-in Alpha has. Recommendation: the
person's own subscription (a Team seat, $20–25 a month, includes Claude Code) or the firm's own
Console organisation; Settings gains "Use a key" beside Sign in for the latter, the key goes
into Claude Code's own store, never the world, never a kit; and the contact-sales conversation
opens now, before any bundled-model offer is made, never after. Cost is measured in staging
before any number is quoted.

## 12. Order of work, each slice proposed in writing before it is built

| | Slice | What proves it |
|---|---|---|
| A | Core safety: schema version (major and minor), backup before a migration, refusal of a newer world, integrity check | a copy of Kenil's world opened by a core one version ahead and one behind |
| B | Ownership: the owner and the recorded baseline on skills, parts, templates, tables, fields, settings, agents; the three marks and the differs-list in the window; reserved names; `purge.py` | tests; the marks on Kenil's world (everything "theirs" today) |
| C | Connectors: the directory shape beside the hands, export from a world, install into a world as owned skills, the needs on the first-run page | **the LinkedIn connector** exported from Kenil's world, installed into a fresh world, LinkedIn signed into there with his account, the connections reader untried then ok |
| D | Kits: export (a module with its agents, using connectors), install into a fresh world | **the LinkedIn Network kit** (his Network module: the table, the agent) in the fresh world, the agent's first run with a verdict; then the car wash (parts, settings, templates, a key the person supplies) |
| E | Update in place: fix and change by the criterion, the three-way merge, schema add and rename, settings merge, the offer card, the fix's self-check and roll-back, back by version | a change by chat in staging to the Network kit, version 2, taken in the fresh world with rows kept; a part repaired locally before a kit update that changes it; a fix that fails its first run and rolls back |
| F | Channels: the signed, expiring index on a bucket, the `alpha` and a client channel, the install's channel file and token, the canary and the halt flag, a kit file dropped on Settings | the clean room following a test channel; one fix taken at launch, one change asked, one halted |
| G | The report, allow-listed with previews, with the diff of a changed managed thing | opened on Kenil's world: no row in it |
| H | "Use a key"; the Developer ID and notarization in `ship.sh` (the runtime's Mach-Os signed with their entitlements before `tauri build`); the README's Open Anyway sentence; the updater reading the `alpha` channel | the clean room with a quarantined zip opening without right-click, and one update taken through the updater |
| I | Outlook through Graph (`http-api`, `oauth`, delta queries) in staging with a test tenant; the canaries in staging; the first client kit | the client's own first run, with their own sign-in |

## 13. What the prior art changed, in one place

The full account is `research/shipping-and-updates.md`. What it changed here:

1. **Confirmed the boundary** (§3, §6): every proven platform keeps a baseline per shipped thing,
   a separate home for the customer's changes, and never deletes a thing the customer touched.
   Added: the baseline is a content hash, a thing changed back counts as untouched, a review list
   of everything that differs, reversible "take the update", reserved names for removed things.
2. **Sharpened fix versus change** (§7): the line is what the person would have to do, not code
   size; a fix proves itself on its next run and rolls back by itself; a change is never forced,
   and a declined change holds that kit's fixes.
3. **Hardened the channel** (§7): serial, expiry, lengths and hashes, minimum version, halt flag,
   per-client token to one origin, keys offline, no encryption-to-install-keys (nobody does it),
   a canary Mac per firm for a day, known-issues notices for connectors.
4. **Flipped the model route** (§11): our keys for clients are the prohibited shape; the person's
   own subscription through the unmodified binary, or the firm's own Console organisation, are
   the sanctioned ones; contact-sales now, not later.
5. **Flipped Outlook and Gmail off the browser** (§4.2): Graph with delegated scopes and a
   per-firm consent for Outlook; the Gmail API through a per-firm Internal project for Gmail;
   the browser road has no safe harbour at either vendor. LinkedIn stays the browser at human
   pace, and we never advertise it.
6. **Raised the Developer ID from "now" to "first"** (§9): right-click › Open is gone since
   macOS 15, grants are keyed to the signing identity, so the switch happens before any client
   grants anything, by the entity that will ship for good. The README is wrong and gets fixed.
7. **Added canaries and fixtures for connectors** (§4.1), the two things site-automation
   vendors run centrally, and the fact that no product shares repairs across customers: Alpha's
   loop would be the first, with us as the approver.
8. **Shaped the report and the support policy** (§10) after 1Password, Firefox, Signal, VS Code,
   Atlassian and Notion: allow-list with previews, counts not rows, redacted logs, consent that
   the person switches on and that expires.

## 14. Questions, with the picks as they stand after the research

1. Four layers, and the boundary as ownership plus a recorded baseline on every thing: an
   update replaces what we installed and they have not changed (by content); what they changed
   is theirs, kept and listed with keep / take / merge; nothing is ever deleted by an update and
   a removed thing's name is never reused. Yes?
2. Who builds a connector: Alpha in staging first, then maintained by us as code we own and
   review, with daily canaries in staging and recorded fixtures (a relaxation of "never by
   hand" for shared connectors only; it stays the rule for a person's own know-how). Or Alpha
   only?
3. Fix versus change by the one criterion (what the person would have to do): a fix applies at
   the next launch with a line and rolls itself back if its first run fails; a change asks each
   person and is never forced. Yes, or does every update ask?
4. Channels from day one: a signed, expiring, serial-numbered index on a bucket of ours, an
   `alpha` channel and one per client behind a per-client token, a canary Mac per firm, a halt
   flag, no server. Yes?
5. People at one client sharing the same rows is its own design session (one world per person
   stays; explicit synced records per §3.5). Park it?
6. The Apple Developer ID first, before any client installs, enrolled by the entity that will
   ship for good: Kenil as an individual now, or the company (legal entity, D-U-N-S, domain)?
   Recommendation: whichever will still be the signer in two years, and the README fixed.
7. The model route for clients: the person's own subscription through the unmodified binary
   (as today), or the firm's own Console organisation with "Use a key"; never our keys; the
   contact-sales conversation opened now. Yes?
8. Where they live: one library repository of ours (`alpha-library/`: `connectors/` and the
   standard `kits/`), signed at release rather than trusted as a repository (Homebrew's 2021
   auto-merge incident), and a private place per client for client kits; nothing in
   `alpha-brain` but the hands. Yes?
9. The first connector is LinkedIn from Kenil's own skills (browser, human pace); then Outlook
   through Graph with a test tenant; then Gmail through the API per firm. Kenil's browser Gmail
   readers stay his. Which client and workflow first?
10. The support policy: no remote access, no world copies, the report the person reads and
    sends, screen share with them driving, any access switched on by them and expiring. Yes?
11. The words: **connector** and **connection** as the industry uses them, **hand** for
    browser, files and calendar, **kit** for a module's definition (no industry word; the
    nearest are template, package, solution, blueprint).
