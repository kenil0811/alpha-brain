# Engine reach, S3: skills loaded by the SDK, private hosts the person listed (20 Oct 2026)

Kenil: "ok looks good, lets move on" (S2's A3 accepted and committed as `97e607a`). S3 was agreed
with section A (Q98): A9 with its spike first, then A6. Nothing here is committed.

## A9: skills loaded from the filesystem

**The spike** (Claude Haiku, a scratch module holding one skill, four ways):
- **A**, `setting_sources=["project"]` with the Skill tool allowed:
  - the module's skill was listed and used through the SDK's Skill tool ("Over by 400,000 …
    PRICE-CHECK-SKILL-USED");
  - nothing of his `~/.claude`: no synced plugin (`cowork-plugin-management`), no claude.ai
    connector.
- **B**, the SDK's `skills` option with `setting_sources=[]`: the module's skill was not found
  ("Unknown skill"), and his claude.ai connectors were listed. Alpha's runs set
  `strict_mcp_config`, which keeps those out.
- **C**, `skills` with `setting_sources` unset: the skill was found, but with it his synced
  plugin and Anthropic's own skills from his account.
- **D**, `setting_sources=["project"]` and `skills=["price-check"]`: as A, and the Skill tool
  is limited to the named skills.
  - Claude Code's own skills (update-config, code-review, schedule…) still show in the
    session's start-up listing.
  - The SDK says unlisted skills are hidden from the model and refused by the Skill tool.
- **Taken: D**, question 3's answer as recommended: the loader that loads only the module's
  skills and nothing from `~/.claude`.

**Built:**
- **Each skill is linked into the module's `.claude/skills/<name>`** (`modfiles.link_skills`):
  every skill under its `skills/<name>/` with a SKILL.md. It is the only thing Alpha puts
  under a `.claude` folder, and a link whose skill is gone goes.
- The skills with no module are linked the same way into the directory where a turn with no
  module works, beside the sessions (Home's). The spec named modules only; this keeps them
  alike.
- **A turn** runs with `setting_sources=["project"]` and `skills` = the skills linked where it
  works (none: `[]`, every skill hidden). Never "user". Judges and other tool-less runs keep
  `[]`.
- The step words: "Using the skill <name>".
- Alpha's SKILL.md frontmatter already carried what Claude Code reads (name, description,
  when to use).
- **Kept:** `skill_keep` as the way the model writes a skill, `skill_find` to search across
  modules, and A4's deny on writes under `.claude`.
- **To look at, not changed:** with the project's settings, a `CLAUDE.md` in a module's
  directory would be loaded into every session there. The model may write one: it is not
  under `.claude`. None exists today.

## A6: the browser reaches private hosts the person listed

- **One check** replaces the four refusals (read, script, download, act) in
  `connectors/browser.py`.
  - This Mac (localhost, 127.x, `::1`, `0.0.0.0`, and with them Alpha's own core) is never
    opened, listed or not.
  - A local-network host (10.x, 192.168.x, 172.16–31.x, 169.254.x, a `.local` name) opens
    only when it is on the module's or the world's network list from A3. Before, every
    private host was refused.
  - The refusal names where to list one.
- **Nothing else changes:** `browser_read` and `browser_script` stay read-only by the driver,
  and acting on a site stays a procedure through `act_outward`.
- **The proof is a test.** A journey has no local-network host to reach.

## What ran

- **Tests:**
  - A9: the links, a gone skill unlinked, `.claude` holding only `skills`, a turn's options
    (`["project"]`, the module's skills), a judge's (`[]`), the step words.
  - A6: the web as before; a LAN host and a `.local` refused until listed on the module, then
    on the world; this Mac refused even when listed.
  - Core 441; lint and types clean.
- **Journeys:**
  - `module_skill_by_the_sdk`, new, with a `skill_file` seed, passed
    (`docs/journeys/2026-10-20-1036.md`): asked "does a deal asking 1,400,000 fit my budget
    rule?" in Deals, the answer followed the module's skill ("over budget by 400,000") and
    ended with its line. Its first run broke on the seed: a table named like its module is
    refused.
  - With the project's settings on for every turn, five broad ones passed:
    `track_then_log` (`-1038.md`), `watch_from_words` (`-1040.md`), `remove_asks`
    (`-1043.md`), `reminder_fires` (`-1044.md`) and `agent_takes_a_task` (`-1046.md`).
- **His world after the restart** (10:45 BST): his three skills with no module (the Gmail
  ones) are linked where Home's turns work. Two errors in the core's log were not S3's:
  - macOS no longer lets the app read his calendars; the connection says "needs your OK";
  - his whole `~/Desktop/dev` folder is granted (since 07:51 UTC: 3,815 documents read).
    Its sync hit an old files bug (the same path twice).

## Kenil's look, and the commit

After the restart he tried the skills listing and the local-network page (refused, then
opened once listed). His word: "ok looks good, lets go to next". S3 is committed on it.
