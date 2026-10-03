# §4.13 The write route (built 2 Oct 2026, evening; Q24)

*Moved verbatim from `build-plan.md` §4.13 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.13" mean this file.*


Why: "preprae a draft email to saniahussain417@gmail.com … make it as a poem" was answered
with a note and "Alpha can't send emails yet". Kenil wanted acting opened generically, with
guardrails and approvals, not a Gmail-only send. The design is §6.1 of the design document.

- **Store**: `procedures` (name, site, url, description, effect prepare | send, steps JSON,
  verify JSON, fields, version, health untried | ok | broken), `actions` (procedure, title,
  payload, evidence, undo, effect, site, state proposed → approved → running → done | failed,
  or declined; proposal, approval, preview, shots, result, error), `permissions` (sentence,
  procedure, effect, granted_at, revoked_at). `world/actions.py` validates steps: one of
  goto, click, click_text, fill, type, press, wait, wait_ms, expect, expect_text per step; a
  fill or type value is exactly one `{field}` of the payload; the last step is a click,
  click_text or press (the commit).
- **The hand**: the driver's `act` op (`browser_session.mjs`): the person's profile, the
  steps, the payload values, `stop_before_last` for a dry run, screenshots `before`,
  `preview` / `after`, `error`, `verify`; it refuses to type into a field whose type,
  autocomplete, name, id, label or placeholder says password, passcode, one-time code, card,
  CVV, IBAN, SSN or passport, whatever the step says; bot checks and sign-in walls stop it
  before any step. `Browser.act` requires a connected sign-in for the site and journals every
  run with its step log and screenshots.
- **The runtime** (`runtime/acting.py`): `dry_run` (every step but the commit; the preview on
  the card), `perform` (all steps, then the procedure's `verify` checks; on a failed step or
  check the action fails, the procedure is marked broken and, in the app, a repair turn with
  `REPAIR_RULES` has Alpha look at the page, fix the procedure and propose afresh), `approve`
  (the person's yes; `always` grants the standing sentence for a prepare-level procedure),
  `decline`. The scheduler's tick performs approved actions the app missed.
- **Tools**: `procedure_save`, `procedures_list`, `action_propose` (dry-runs at once; runs
  at once under a standing permission), `action_approve` (the person's words after the card;
  refused in the proposing turn), `action_decline`, `actions_list`. Rule 9 of the turn now
  says how; the browser skill has an Acting section.
- **API and app**: Needs you shows a proposed action as a card (its own `proposed` entry is
  not shown twice); `/api/actions`, `/api/actions/{id}`, `/shots/{name}`, `PATCH` to change
  the text before the yes (the preview goes stale), `/approve {always}` (runs in the
  background), `/decline`; `/api/intelligence` lists procedures and standing permissions;
  `/api/permissions/{id}/revoke`. `ActionCard` (Home and the conversation): payload, the
  dry-run screenshot, the undo statement, Do it / Always allow (prepare) / Change / Not now;
  Knowledge has "Standing permissions" with Revoke. Removing a connection deletes its
  procedures, declines their pending actions and revokes their permissions.
- **Tests**: `core/tests/test_actions.py` (the step walls, the dry run, the yes, always and
  revoke, a send never gets a sentence, a failed run marks the procedure broken and calls the
  repair, the API, removal). 124 core tests, lint and types clean.
- **The real run** (journey `gmail_draft`, 18:20–18:32, a copy of Kenil's world, his real
  Gmail profile): Alpha read the inbox, ran five scripts to see Gmail's compose controls, and
  in about two minutes kept `gmail_draft` (open `#inbox?compose=new`; fill "To recipients";
  fill the subject box; type into "Message Body"; click "Save & close"; verify
  `expect_text: "Draft saved"`), proposed the action with the poem as payload, and the dry run
  filled a real compose window and stopped before the last step: the preview screenshot shows
  the draft with "Draft saved" in its header. The suite's yes performed every step in 28 s.
  The draft exists in Kenil's Gmail (Drafts went from 1 to 2 in the after-screenshot). Alpha's
  own verify check then failed, because after Save & close the "Draft saved" text is no
  longer on screen, so the action is `failed` and the procedure `broken`: the right answer
  for a check that is wrong, and Alpha's to repair in the app (the suite runs with no
  repair). **Found:** (1) Gmail autosaves while the body is typed, so a dry run already leaves
  a draft; a prepare-level dry run is not side-effect-free on sites that autosave, which is
  fine for a draft and must be said on the card for anything else. (2) The suite continued a
  build copied from the live world (Kenil's Founding Engineer tracker, state `building`) and
  spent the subscription twice until I killed it; the suite now settles only plans it
  proposed, and the profile copy tolerates Chrome's transient files. (3) A stray core on port
  53911 from an earlier session was pointed at by `desktop/.env.development.local` (untracked);
  stopped, and the file now names the scratch core used for checking the app.
