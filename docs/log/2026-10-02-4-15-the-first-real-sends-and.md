# §4.15 The first real sends, and what they broke (2 Oct 2026, 18:43–18:54)

*Moved verbatim from `build-plan.md` §4.15 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.15" mean this file.*


Kenil, in the rebuilt app: asked for the draft again (Alpha wrote `gmail_draft` afresh, 95 s,
dry run, card; Do it made it, 17:44), then "ok, send it as well now". Alpha wrote
`gmail_send_draft` (open Drafts, open the newest row, Send; verify "Message sent") and the
email **was sent to Sania at 17:50:11 with the verify passing**: the route works end to end,
draft and send, both procedures Alpha's own. Then "send an email for the trip to Mitansh as
well": Alpha declined on its own judgement (a LinkedIn connection with no trip context) and
Kenil asked why it had assumed a romantic poem, which it answered honestly (no fact on file).

**What the trace showed, and what was fixed the same evening:**

1. **A false "Sent".** The first send card (17:47:38) was marked *Sent* one second after Do
   it, with no step log and no screenshots: the hand had thrown, `perform` caught it as
   `failed_step: 0`, and `0` is false. Nothing was sent then. Now any exception is a failure
   (`_failed`: raised, wall, failed step, failed check, or no `done`), journaled as `failed`
   with the error, the procedure marked broken.
2. **A card before its preview.** The action is created, then dry-run; between the two the
   card was visible with Do it enabled, while the model turn was still rewriting the
   procedure. Now a proposed action carries "The preview is being made." until the dry run
   finishes, the card's Do it and Always allow are disabled until then, and `approve`
   (tool and route) refuses without a preview. A dry run that fails now fails the action
   (the card shows why and can't be approved); an edit of the text redoes the dry run.
3. **Two Chromes on one profile.** The three procedure versions in a row were almost
   certainly the model's dry run and the person's approval (or a read) opening the same
   Gmail profile at once, which Chrome refuses; the error was lost. `Browser.runner` now takes
   a file lock per profile (`alpha-busy.lock`, `flock`) around every job, across the MCP
   process and the core, so reads and acts on one sign-in take turns.
4. **The screenshot didn't show** in the app: the page's own CSP (`index.html`) lacked `blob:`
   in `img-src` while `tauri.conf.json` had it; both apply. Fixed. The card is leaner: short
   fields on one line, the long one as the body in a scrolling block, the screenshot only
   once it has loaded.
5. **Slow**: the first draft turn took 95 s because the procedure had to be written against
   the real page (Gmail read, five scripts); a second draft is one dry run (about 20 s). The
   send took four minutes because of (3). Not changed: a procedure is written once per task
   per site and reused.

126 core tests (two added for 1 and 2); lint and types clean. The app rebuilt (`just app`).
