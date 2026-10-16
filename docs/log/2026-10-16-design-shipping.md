# Design session: shipping Alpha to clients (16 October 2026)

Kenil: "a design and planning session. I need to think about how I am going to ship and manage
this app." Clients get a pre-set Alpha with no data in it; connectors and modules must be
maintainable afterwards "without having to access their data / messing with it"; the platform,
the connectors, the skills and the modules must come apart so each can be updated alone. No
code changed.

## Session 1: the first proposal

Read first: where every kind of thing lives today (the app and the world are apart on disk; a
module's definition and its rows are one thing in one file; know-how exists only in the world it
was made in; nothing records who owns a thing; no schema version, no backup before a migration,
no updater, no Developer ID). Proposed one unit, a kit (a module's definition with nothing of
anyone's data, exported from a staging world, installed empty, updated in place), in
`design/shipping-and-kits-proposal.md`, with ten questions.

## Session 2: the refinement

Kenil: pre-built **generic connectors** every install uses ("a LinkedIn connector which knows how
to read data from LinkedIn and write messages and posts, similarly a Gmail connector, Outlook …
no IP, no specific info … maybe something like how Claude skills are"), **standard agents**, and
ad hoc pipelines for one client with 15–20 users, each on their own Alpha, where a fix must reach
all of them "without messing up their customizations / personal things they've built"; "very
clear boundaries on what we change/manage, vs what they can do". The proposal was rewritten
(v2): four layers (platform, connectors, kits, theirs), ownership on every thing as the boundary,
channels per client, fix versus change, the fix-for-fifteen loop. Eleven questions.

## Session 3: the research

Kenil: "before this, can you do some research on best practices, and how other similar
products/services are managing such things." Six research passes (packaged apps' upgrade
boundaries; integration platforms and connector versioning; agent skills and site know-how;
macOS distribution and update channels; local data safety and support; model and mailbox
access) → `design/research/shipping-and-updates.md` (about 20,500 words, about 650 sources).
The proposal became v3 with the findings folded in (its §13). Confirmed: every proven platform
keeps a baseline per shipped thing, a separate home for the customer's changes, and never
deletes what the customer touched (Salesforce, ServiceNow, Power Platform, dpkg, Copier, Helm);
the fix-versus-change line is what the person would have to do, never code size (Tray, Teams,
Airbyte); a signed, expiring, serial-numbered index is the channel (TUF, apt, Sparkle); no
product shares repairs across customers. Found: since macOS 15 right-click › Open no longer
bypasses Gatekeeper, so the README's sentence is wrong; macOS keys permission grants to the
signing identity (TN3127).

## Session 4: simpler

Kenil: "this is getting confusing! lets keep it simple … I dont want you to think or worry about
terms of service/fair use for now, this is still a poc … my concern is how we ship prebuilt
modules, how we maintain connectors, and how we help manage things for users." On Composio
("would that solve lot of our issues?"): it would keep API-backed connectors (Gmail, Outlook,
Calendar, Slack…) working with per-user sign-in through its cloud, not LinkedIn (its toolkit is
the official API: no connections, messaging or search) nor any site without an API, and nothing
of modules or updates; its open part is the SDK, the useful part is hosted, self-hosting is
Enterprise-only. Kenil: "ok leave it then, i dont want a hosted solution." Then: "I just want to
build the underlying infra for now, not actual connectors." Agreed, "yes looks good", recorded as
**Q53**: the infrastructure only, three mechanisms (kits; connector slots; the channel), the
ownership rule, no hosted connector service, terms of service set aside for the POC, build order
kits → channel → slots, each slice proposed in writing before it is built.

## Left

Slice 1 (kits: export without data, install empty, update in place with the ownership rule)
proposed in writing next; then the channel; then the connector slots with Kenil's LinkedIn
reader as the test fixture. The proposal's §9–§11 (Developer ID, model route, mailbox roads) are
findings on file, not decisions.
