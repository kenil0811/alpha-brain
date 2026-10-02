# Kanu (getkanu.com) against Alpha — 2 October 2026

Read from the public site (home, platform/enterprise-os, agents, apps, deployment, industries,
about, blog), the seed announcement (22 Sept 2026), GeekWire and TNW coverage, the a16z
speedrun profile. No docs, pricing or product screenshots are public; `/docs` and `/pricing`
are 404. Every quoted phrase is theirs. Where the site is marketing and the mechanism is not
stated, this note says so.

## What Kanu is

- Seattle, founded January 2026 by Karan Grover (YC W22, ex-Amazon "AGI enterprise
  fine-tuning", ex-DoorDash). v1 shipped June 2026, first enterprise workflows live August
  2026, $11.7M seed announced 22 Sept 2026 (Trilogy, a16z speedrun, BMW i Ventures, Accel).
  7–10 people, hiring to ~15. Revenue "doubled every quarter since launch". Sold through the
  AWS and Google Cloud marketplaces.
- Tagline: "AI that works the way you do." Thesis in their words: "Kanu learns how your team
  actually works, then builds the agents and apps that do it — reading the documents, following
  your rules, and handing back finished work inside your own cloud." The seed post's version:
  valuable judgement is "trapped" in employees' heads and spreadsheets; Kanu "compiles" it into
  software the company owns rather than rents.
- Customers: enterprise, vertical pages for commercial real estate, private equity, financial
  services, insurance. One named case: an analysis across "PDFs, email, spreadsheets, CRM data
  and mapping systems" cut "from up to eight weeks to under 10 minutes", projected >$1M/yr
  software savings.

## What it does (the three products)

1. **Enterprise OS** — the substrate. "Data Grids: organize records into structured, searchable
   tables"; "Context and Integrations: a knowledge layer and integration hub", "enterprise
   documents indexed for agents"; "Learn and remember how your team works"; connectors shown:
   Teams, Salesforce, Outlook, Google Drive, Snowflake ("41.2M records indexed");
   Observability ("runs + costs", "evaluates and monitors every agent in development and in
   production", traces, alerts); Governance ("control who can access data, run workflows, and
   approve actions", PII redaction, access revocation, SOC 2 monitoring); model-agnostic
   ("frontier, open-weight, and on-premise models", routed "by performance, security, and
   cost").
2. **Agents** — "Agents that execute the work, not chat about it": "run repeatable workflows
   end to end", "read the documents, follow your firm's process, and produce finished work,
   with people reviewing what matters"; "Finished work, not first drafts" ("a client
   presentation", "a completed analysis", a drafted client email); "Each step along the way,
   the next one is already suggested"; "Self-improving: capture expert feedback and workflow
   changes, then reuse that guidance"; "Versioning: every change tracked. Roll back to any
   version, anytime"; "Reusable skills: package procedures for multi-agent use"; permissions
   "down to resource level".
3. **Apps** — "Describe the tool you need and Kanu builds it: live, connected to your systems,
   and changeable by asking"; "a purpose-built view for every role"; "one interface for the
   entire process" (inputs, approvals, analysis, exceptions, outputs); "update logic,
   interfaces, and outputs as business requirements change".

Deployment: multi-tenant, single-tenant, bring-your-own-cloud (AWS, GCP, Azure named), on-prem
air-gapped. "Your cloud. Your data. Your models." Customer-managed model accounts and spend.

**How work actually enters Kanu.** The press says staff "demonstrate how they complete work".
The site's own FAQ and deployment page say what that means: "We begin with one high-value
workflow, connect the required data, and define a measurable first outcome"; "forward-deployed
engineers" who "build the agents, integrations, and workflows into your stack" and "work on
site"; a "deployment strategist" who "defines the use cases, metrics, and business case";
"from Kanu-led to full client ownership, by design". Validation: "tests outputs against real
data, expected behavior, and agreed success criteria before expansion". Nothing public shows
passive observation of work, screen capture, or self-serve creation by an employee. The
honest reading: discovery → FDE builds the first workflow on the platform → the customer's
own people extend it by describing and giving feedback.

## Where Kanu and Alpha are the same idea

The pitch is the same pitch. Kenil's external framing (30 Sept): an AI companion that
"observes how work actually gets done and converts repeated work into Skills, patterns across
apps into Workflows, ownerless work into Agents, and missing tools into Modules"; "software
never fits the work, so people became the integration layer". Kanu's: "For decades, you
adapted operations to fit software vendors. Not anymore. Kanu is built around how your firm
works"; the firm's "judgment, remembered and reused"; agents, apps, reusable skills. Anyone
who has seen Kanu's site will hear Kenil's pitch as the same thesis. The differences are in
who it is for, how work enters, and where it runs.

| | Kanu (public) | Alpha (as built 2 Oct) | Alpha (design) |
|---|---|---|---|
| Who | Enterprises in four verticals; sold top-down via marketplaces and FDEs | One person (Kenil) on a Mac | Small businesses and knowledge workers, bottom-up; ETA buyers as the beachhead |
| Where it runs | Customer's cloud (AWS/GCP/Azure/on-prem) | Local, one SQLite file, Python core inside a Tauri app | Local-first; nothing leaves but the model call |
| Model route | Model-agnostic, customer's own accounts, routed per workflow | Claude Code CLI on the owner's subscription, Sonnet | API later; System One seam for small judgements |
| How work enters | Discovery with Kanu's people; "demonstrate"; connectors; feedback | The person asks; plan proposed; built after a yes | Same, plus sensors and triage; passive observation later, screen capture not in v1 |
| Unit of value | Agents (end-to-end workflows producing deliverables) and Apps (per-role interfaces) | Modules (tables with derived pages), automations (pipelines of readers), readers | Modules, skills, automations, connectors; standing-things ladder |
| Memory / knowledge | "Learn and remember how your team works"; knowledge layer; documents indexed; mechanism unstated | Verbatim journal + FTS5, entities with hard keys, bi-temporal facts, notes, goals, briefs per thread, kept context per turn | Plus sleep-time consolidation, cross-source linking, digest |
| Structured data | Data Grids (tables) | Collections with derived pages, row history, provenance per value, seen/gone from readers | Same |
| Connectors | Teams, Salesforce, Outlook, Drive, Snowflake, "the systems involved in your workflow" | Browser (signed-in sites, read-only), files, calendar (EventKit) | Email, contacts, app scripting, desktop control, plug-ins (MCP) |
| Outputs | "Finished work": memos, presentations, analyses, emails, in the firm's formats | Tables, notes, journal lines, a reply; nothing leaves the machine | Pending outward actions the person approves; drafts first |
| Trust | "Open each output to see what Kanu read and why"; audit trail; review points; permissions; PII redaction | What the model saw per turn; provenance (stated / looked up / estimated / assumed); a second opinion against an independent answer; a trial on every build; Activity journal never deleted | Checklist view (asked / done / assumed), undo windows, standing permissions as sentences |
| Change over time | "Self-improving" from expert feedback; versioning with rollback | Readers versioned and health-checked; record history; no rollback; corrections by hand in the conversation | Promotion from verified runs; junk rules; cooldowns |
| Proactivity | "Knows what to do next"; "Detect anomalies before they become problems" (apps) | None beyond an automation's "worth telling" | Triage, digest, cards at task boundaries, expected-utility gate |
| Observability / cost | Runs, costs, traces, alerts, per-provider usage | None by design (no knobs); cost is the subscription | Hidden budget rejected (Q18) |
| Multi-user | Roles, resource-level permissions, approvals | One person | Sharing later by syncing explicit records |
| Services | FDEs on site, deployment strategists, "hand you the keys" | None; the companion asks | None; Alpha builds the know-how itself |
| Stage | Live revenue, named case, $11.7M | Pre-user, two judging journeys run by hand | — |

## What Alpha is missing that Kanu has

1. **Finished deliverables.** Kanu's whole promise is output in the firm's formats. Alpha
   produces tables and answers; it cannot write a memo, a deck or an email into the world
   outside its own store, and nothing leaves the machine. Design §6 and §7 plan pending
   actions; none exists.
2. **Enterprise data in.** Salesforce, Snowflake, Teams, Outlook, Drive. Alpha reaches a
   browser session, folders and the calendar. The design's answer (plug-ins via MCP, app
   scripting) is not built.
3. **A feedback loop that changes behaviour.** "Capture expert feedback … then reuse that
   guidance" and rollback. Alpha has instructions in the person's words and reader versions,
   but a correction today does not become a rule the next run follows, and nothing rolls back.
4. **Multi-user and governance.** Roles, approvals, resource-level permissions, PII redaction.
   Alpha is one person; by design for now.
5. **Observability.** Runs, costs, traces. Alpha journals everything but shows no cost and
   no run metrics; Q18 chose no budget at all. For a firm this becomes a question.
6. **Model choice.** Kanu routes across models; Alpha is tied to one subscription and one
   CLI, and cannot be offered to anyone else on that login without Anthropic's approval.
7. **Proof.** A named case with numbers. Alpha's proofs are the LinkedIn sync, Gmail
   through the browser, Nutrition and the ETA tracker, all on the owner's own world.

## What Alpha has that Kanu does not show

1. **A person-sized product.** Kanu's entry is discovery, FDEs and a cloud deployment; there
   is no self-serve path and no individual user. Alpha installs on a Mac, asks, and builds.
   This is the whole of Kenil's wedge ("thousands of $50 frictions" vs the "$50k
   automation"), and Kanu is explicitly the consultant-led side of that contrast.
2. **A world model with provenance at the value level.** Kanu says "see what Kanu read and
   why". Alpha knows, for every number, whether it was stated, looked up (and from where),
   estimated or assumed, and checks its own answers against an independent one. Nothing
   public from Kanu describes anything that fine.
3. **Local-first, no cloud at all.** Kanu's "your cloud" still means a cloud, a deployment
   and an ops relationship. Alpha's data never leaves the laptop except the model call.
4. **The companion.** An always-on surface the person talks to; Kanu is a web platform.
5. **Plan first by mechanism.** Kanu gets this from people (discovery, success criteria).
   Alpha enforces it in code: nothing lasting is made without a proposed and approved plan.
6. **Honest statuses for what can't be reached.** Sources with needs-sign-in / blocked /
   broken / not built. Kanu's equivalent is an FDE on site.
7. **No knobs.** Kanu is a platform with grids, governance panels, observability dashboards.
   Alpha's bet is that a person never meets a setting.

## What is different in kind, not degree

- **Who builds the know-how.** Kanu: their engineers, then the customer's. Alpha: the agent
  itself, tested on a real run, repaired by itself (design §4.0). Kanu's model scales with
  headcount and revenue per customer; Alpha's only scales if the agent really can build and
  repair readers and procedures without a person, which is the unproven part.
- **Observation.** Both say "learns how your team works". Kanu's public mechanism is
  demonstration to a human plus connectors. Alpha's built mechanism is the conversation plus
  connectors; passive observation is a later vision in both pitches and built in neither.
- **Where judgement lives.** Kanu stores "your firm's judgment" as process and feedback;
  Alpha stores the person's world (facts, instructions, goals) and lets the model judge each
  turn, with the second opinion as the check. Kanu's framing is closer to RPA with an LLM;
  Alpha's is closer to an assistant with a memory.
- **Price of a mistake.** Kanu's review points are organisational (a person approves a
  deliverable). Alpha's are per value (source, assumption) and per build (trial).

## What this means for Alpha

1. **The pitch needs its own words.** "Observes how work gets done and turns it into skills,
   workflows, agents and modules" now reads as Kanu's line. What Kanu cannot say: on your own
   machine, for one person, self-serve, no engineers, every number with its source. Say that.
2. **Outputs are the biggest functional gap.** A second brain that cannot produce a document
   or send a draft is a reader. Pending outward actions (design §6/§7, order-of-work step 6)
   move up: a draft in the person's format, approved once, is what Kanu sells as "finished
   work".
3. **The feedback-to-behaviour loop is the second.** When Kenil corrects a value or a reader,
   that correction should become something the next run follows (an instruction, a reader
   version, a rule in a pipeline) and should be visible as such. Kanu calls it
   self-improving; Alpha has the pieces (instructions, reader versions, record history) and
   not the loop.
4. **Proof in Kanu's shape.** One journey, measured: hours before, minutes after, on a real
   person's work, repeatable. The judging journeys exist; the measured suite (build-plan §4.9
   item 1) does not.
5. **Not to copy.** Dashboards, cost panels, governance matrices, role interfaces, cloud
   deployment. These are Kanu's product because their customer is a firm's IT; they are
   Alpha's anti-pattern (no knobs). Multi-user is a later decision, not a feature to add now.

Sources: getkanu.com (home, /platform/enterprise-os, /platform/agents, /platform/apps,
/platform/deployment, /industries/commercial-real-estate, /industries/private-equity,
/about-us, /blog/seed-announcement), GeekWire 2026 "Kanu AI emerges from stealth with
$11.7M", TNW "Kanu AI raises $11.7m", speedrun.a16z.com/companies/kanu-ai, finsmes.com,
citybiz.co.
