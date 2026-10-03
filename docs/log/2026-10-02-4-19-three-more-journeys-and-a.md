# §4.19 Three more journeys, and a hole in the hand (2 Oct 2026, 22:02–22:30)

*Moved verbatim from `build-plan.md` §4.19 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.19" mean this file.*


`docs/journeys/2026-10-02-2202.md`, a copy of Kenil's world, his profiles:

- **gmail_send** (a send with a fresh yes): Alpha wrote a compose-and-send procedure against
  Gmail (196 s, the earlier `gmail_send_draft` sends an existing draft, so a new one was
  needed), the dry run filled the compose window, the suite's yes sent it in 11 s and the
  verify passed ("Sent … Checked afterwards"). The email went to Kenil's own address.
  **Passed.**
- **plan_declined** (a no builds nothing): "keep track of every book i read this year with my
  rating" → a Books plan with three numbered questions in 29 s; the decline through the app's
  route closed it in 2 s; no table, no module. **Passed.** (The questions were prose, not
  `ask_person` options: the run started before rule 10 changed.)
- **linkedin_message** (the second site, no new platform code): Alpha found Mitansh's profile,
  wrote `linkedin_message` four times over 381 s, and every dry run timed out waiting for the
  message box; it concluded LinkedIn blocks automated messaging. The error screenshot said
  otherwise: "This page doesn't exist". Alpha had written the procedure's address as
  `https://www.linkedin.com/in/{profile_slug}/` and a selector with `{profile_urn}`, expecting
  the hand to fill them from the payload as it fills typed text, and the hand opened the
  literal address. **Failed, platform's fault.** Fixed: a `{field}` placeholder anywhere in the
  address, a selector, a click text or a goto is filled from the approved payload (the payload
  is on the card, so nothing hidden reaches the site); every placeholder must be a declared
  field; proven on example.com (address and selector filled, step done).
- **linkedin_message, rerun** (22:16, `docs/journeys/2026-10-02-2216.md`): **passed** in 550 s.
  Alpha wrote `linkedin_message` seven times and landed on four steps: `goto` LinkedIn's
  compose overlay with `{recipient_urn}` in the address, wait for the message box, type
  `{message}`, click Send; the dry run composed the message and the card waits with its
  preview; nothing was sent. The second site cost no platform code beyond the placeholder fix;
  nine minutes is the price of learning a site once.
- **Kenil's own run (22:28):** "Send LinkedIn message to Sania Hussain: hello from alpha",
  70 s to the card in the real app. "worked pretty well! but the card didnt look good": the
  LinkedIn urn showed as a field, the "because" line was record ids and addresses, the
  screenshot filled the width. The card now hides identifier-like fields (names ending in
  urn, id, slug, key, token; `urn:` values; opaque tokens), shows the first 150 characters of
  the evidence with "more", lays the text beside a thumbnail that opens full size, and the
  panel drops a failed attempt once the same thing was proposed again; `action_propose` asks
  for evidence in one plain sentence, never ids.
- **Kenil's run, the dangerous part (21:29):** his yes sent the message to Sania; Alpha's
  verify step then failed (text LinkedIn never shows), the platform called the action failed,
  and the repair loop had Alpha fix the check and **propose the same message again**: a card
  that, pressed, would have messaged her twice. Withdrawn by hand at 22:35 (journaled). Fixed:
  when every step ran, the commit included, and only the check afterwards failed, the action
  is `done` as "Sent, not confirmed … look in linkedin.com to be sure", the procedure is marked
  broken for its check, and the repair turn is told to fix only the verify steps and never
  propose again (test added). The same shape had hit the first Gmail draft (§4.13); it is now
  "Made, not confirmed" rather than a second draft.
- A lesson for the repair loop: Alpha's diagnosis ("anti-automation") was wrong because it
  never saw the error screenshot. `action_propose`'s failure answer now carries the step log;
  giving Alpha the screenshot itself (a `page_read` of the final page, or the image) is open.
