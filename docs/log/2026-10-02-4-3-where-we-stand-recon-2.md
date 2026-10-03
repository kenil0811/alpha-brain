# §4.3 Where we stand (recon, 2 Oct 2026; row 4 and the trust row brought to 3 Oct)

*Moved verbatim from `build-plan.md` §4.3 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.3" mean this file.*


Against the design's order of work:

| Step | State (end of 2 Oct) |
|---|---|
| 1. World store, MCP server, stream, companion | Done. Plus: row history, what the model saw per turn, threads as records (§4.6) |
| 2. Browser, files, calendar; derived pages | Done, plus §4.2. Readers mark rows seen and gone; paged lists are read whole or say so. Calendar's real first read still not run |
| 3. Sensors, triage, sleep-time pass, digest, Inbox | Not started |
| 4. Entities and bi-temporal facts across sources | Partial: rows that are people link by hard key by mechanism (§4.6), but no table in Kenil's world declares it, so his 1,551 connections are rows, not people, and People & Companies lists the 13 entities Alpha resolved itself (found 3 Oct, §4.23); a page per person and company, noticing after every turn, entity cards in context (§4.23, 3 Oct); same-name maybes shown on the person's page with "Same person" (merge from the app); no cross-source linking by itself yet, no sleep-time pass; unmerge unreachable (§4.10) |
| 5. Standing-things ladder, promotion from verified runs | Partial: automations and pipelines exist; every standing thing goes through a plan and a yes (§4.7); no ladder, no promotion from repetition |
| 6. Pending actions and Access | Built as actions (§4.13, Q24): a dry-run card, the person's yes, prepare-level standing sentences; the first real draft was made in Kenil's Gmail. No Access page; sends have no sentences yet |
| — Trust (design §7, added 2 Oct) | Built: plan-first by mechanism; sources with a status; known, assumed or asked; the second opinion; build trials (§4.8). The two holes of §4.10 were closed in §4.12 (`records_add` requires a source; synced rows are skipped). Since the 3 Oct checkpoint: an automation cannot act outward by code, and an action moves state atomically |
| — Hands free of site vocabulary (Q17) | Done 2 Oct evening (Q23): generic wall and paging detection, one `url` key with a migration, no Sites section (§4.10) |
| — No limits (Q18) | Holds for turns and builds; one floor by decision, 30 minutes between an automation's runs (Q22); the hands' own timeouts (§4.10) |

Proven on real runs (the person's own world, the subscription): LinkedIn connections read in
the person's session (1,548 rows, daily at 07:00, Alpha's own reader); Gmail read through the
browser (tracking and shipment details from the last 100 emails; then emails from LinkedIn
connections in the last 24 hours and what one of them said, the first answer joining two
sources); Nutrition (tables plus a weekly review automation); the ETA deal tracker built after
a plan and a yes (Deal Tracker, 365 rows from the readable broker sites, daily; its first build
hit the old 80-step cap, which is why there are no limits now); the second opinion on the shake
(160 → 215 kcal from the Morrisons page in 58 s, flavour asked). Proven only by tests: the
calendar connect, Install and Sign in from Settings on a fresh Mac, the
try-the-sign-ins-you-hold path, a build's trial being sent back.
