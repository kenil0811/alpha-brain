# §4.4 What the recon flagged

*Moved verbatim from `build-plan.md` §4.4 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.4" mean this file.*


1. **Decided 2 Oct: Gmail through the browser is fine** (Kenil; Q4 revised in the design). It
   was flagged because it went against decision Q4 ("keep Gmail out of scope until a Google app is justified;
   use Anthropic's Gmail connector meanwhile"). It is now read by driving a signed-in browser:
   it works, it is the access path Google likes least, and it is the most sensitive source
   Alpha reads. Needs a deliberate decision.
2. **LinkedIn reads the whole list daily.** Q3 said "at human pace". A full scroll of 1,548
   connections every morning is closer to what LinkedIn acts against; reading only what is new
   would be gentler.
3. **The make-or-break hasn't moved since slice 1.** Memory and context: beliefs going stale in
   resumed threads (Alpha "concluded" LinkedIn caps the list and carried it), no sense of time
   ("yesterday"), no sleep-time pass, people not linked across sources. The Gmail × LinkedIn
   answer came from the model's cleverness in the moment, not from Alpha knowing the person.
4. **Proactivity is close to zero**: apart from automations' notes Alpha never brings anything
   to the person; no digest, no notifications.
5. **The last stretch was reactive polish** (about 10 of 25 commits fixed what Kenil found
   while using the app). Valuable, but away from the thesis.
6. **Not shippable to anyone else**: the app runs Python from this repository's `.venv`;
   self-signed; the subscription login needs Anthropic's approval for other users; first run on
   a fresh Mac untested; a repository on the Desktop makes the first launch wait on macOS.
7. **Loose ends**: desktop-control and app-scripting hands not built; how hand gaps are
   collected across many users (Adobe) is open; `page_to_table` still carries site knowledge in
   the platform (reduce it to a first look); the photo-vs-name half of the LinkedIn driver fix
   sits in `git stash` as know-how Alpha should learn; whether the Python Agent SDK (which
   bundles Claude Code) supports every flag in §3.4 is unverified, so the runtime stays on the
   CLI.
