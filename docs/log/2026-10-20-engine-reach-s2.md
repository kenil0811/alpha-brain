# Engine reach, S2: subagents, writes that follow the grants, network by allowlist (20 Oct 2026)

Kenil: "lets commit and start with s2 for now". S2 was agreed with the rest of section A
(Q98, `design/engine-reach-proposal.md`): A2 subagents (its spike first), A4 writes, A3 the
network from scripts. Nothing here is committed.

## A2: subagents

**The spike** ran on a scratch world with the real model, Task allowed in Alpha's own engine:
- **A subagent has the turn's hands.** Two helpers counted two tables at once, each through
  `world_query` (found by its own tool search).
  - In Claude Code 2.1.301 the tool is `Agent`; `Task` is its old name and still works.
  - Each helper's transcript is kept under the session's `subagents/`.
- **Its shell has the same sandbox.** A helper's `curl https://example.com` came back with
  exit 137: no network.
- **Its removal reaches the card, but the yes never completed it.**
  - In a conversation a removal is deferred (P3 item 7): the turn ends on the card, and the
    yes resumes the session. A subagent's call is not resumed: the subagent is gone by then.
  - Fuji stayed, and the next helper met the card again.
- **Fixed:** a subagent's removal (its hook input carries `agent_id`) is not deferred. It
  reaches the permission callback, which puts the same card and waits in memory while the
  turn goes on, as every removal outside a conversation already did.
  - Run again: two cards for one removal, then Fuji gone.
- **The two cards** came from a first call with no row revision: the card was put before the
  hand could refuse the call.
  - Fixed: a removal that names no row it can act on is refused in the hand's own words
    before any card, in the hook and in the callback alike.

**Built:**
- `Agent` and `Task` are among a turn's own tools; judges and other tool-less runs still deny
  them.
- The step words read "Working on part of it alongside: <its description>".
- **A helper runs in the foreground.** `helpers_side_by_side`'s first run ended with "I'll put
  the counts side by side once both report back". This Claude Code starts helpers in the
  background by default, and a turn's process ends with the turn, so they never reported.
  A PreToolUse hook now sets `run_in_background: false` on every Agent call, and the turn
  waits for its helpers.

## A4: writes follow the person's grants

- Write and Edit are allowed wherever Read is: the module's directory, the folders the person
  granted, or anywhere with the whole-Mac switch. They were allowed only in the module's own
  directory.
- Never under a `.claude` folder: its settings would be accepted without a word (the slice 1
  spike).
- The words follow: `grants.describe` says "Folders you may read and write", and the files
  connector's SKILL.md no longer says Alpha never changes the person's files.
- The deny outside the grants names `connect what=folder`, as before.

## A3: network from scripts, by allowlist

- **Two lists.**
  - Each module has a list of hosts its scripts may reach (`modules.network`, migrated in).
    It is written to its `module.yaml` and read back when the file was changed after the
    world, as NOTES.md is. A kit carries it.
  - The world has a list for every module: Settings' card is now "Folders and network",
    with the hosts listed, Add and Remove (`POST /api/network`).
  - Hosts are kept as hosts: no scheme, path or port, lower case.
- **The sandbox.** Each run's `sandbox.network.allowedDomains` is its module's list and the
  world's.
- **The card.** A script reaching any other host comes to the permission callback as
  `SandboxNetworkAccess` with `{host}` (read in the bundled CLI). It puts a card: "Let scripts
  in <module> reach <host>? Reading from it only: anything sent still asks you first."
  - "Yes, always for <module>" puts the host on the module's list, journaled, and the script
    goes on. "No" refuses, naming the Settings card.
  - It waits in memory while the turn goes on, as a subagent's removal now does. The spec
    asked for the removal card's deferral, but a host is reached by the sandbox's own request,
    never a tool call, so there is no call to defer. A restart while it waits asks again the
    next time.
  - Two hosts in one turn are two cards: a permission card's key now includes its host.
- **What still leaves the world only through act_outward:** a message, a post, a form, a
  payment. A host is for reading. The words given to the model say so in `grants.describe`
  ("Hosts your scripts may reach … any other host asks the person on a card first").
- **The words that were out of date after A4:** the Settings card said Alpha "writes only
  inside each module's own folder" and the whole-Mac switch "it never writes outside its own".
  Both now say read and write; Activity's line for the switch too.
- Q103 records it: Q80's "no network from the shell" is reversed.

## What ran

- **Tests:**
  - A2: a subagent's removal reaches the callback, not the deferral; a malformed removal is
    refused before any card; a helper is made to run in the foreground; the step words.
  - A4: writes in a granted folder, outside it, under `.claude`, and with the whole Mac.
  - A3: a listed host with no card; a yes that lists the host and writes it into
    `module.yaml`; a no that refuses; the run's allowed domains; `module.yaml` read back; the
    folders API with its hosts; the Settings card adding a host.
  - Core 439 and desktop 239 passed; lint and types clean.
- **Journeys:** `helpers_side_by_side` (A2) and `write_in_a_granted_folder` (A4) are new, with
  a check `file_in_folder`.
  - First runs: the helpers' answer never came (above), and the folder journey never reached
    its sentence, because Home's router asked "new item or answer here?" (section C).
  - Both are single sentences, so they are now plain turns, not routed.
  - Run again, both passed:
    - `helpers_side_by_side` (`docs/journeys/2026-10-20-0035.md`): 2 leads worth 42,000 and
      3 worth 58,000, answered within the turn;
    - `write_in_a_granted_folder` (`-0036.md`): a CSV with Dune, Piranesi and Herbert in the
      granted Exports folder.
  - `remove_asks` (`-0029.md`) and `two_things_at_once` (`-0031.md`) also passed: a removal in
    the conversation itself is still deferred, and the yes still lands.
- **A3's journeys**, new, with a `network` seed and a `hosts` check, both passed:
  - `script_reads_a_listed_host` (`2026-10-20-0912.md`): a Python script in the shell read a
    public JSON endpoint on the module's list and wrote 10 users, each with the URL as its
    source;
  - `script_asks_for_a_host` (`-0914.md`): an unlisted host put the card "Let scripts in Lists
    reach jsonplaceholder.typicode.com?". The suite's yes listed it, and it is in Lists'
    module.yaml. The fetch then went through in the same turn, and the reply gave the todo's
    title.

## Kenil's look at A2 and A4

After the rebuild and restart on his word, he tried both in his app: a comparison with a helper
reading each side, and a CSV saved into a folder he granted. His word: "both works, lets move
on to the next". A2 and A4 are committed on it, with the plan he gave ("then commit on my word
and build A3"); A3 follows.

## Kenil's look at A3

After the restart on his word he tried the Settings card ("Folders and network": a host added
and removed) and a script in Deals reaching a new host (the card, his yes, the answer; then no
card the second time). His word: "ok looks good, lets move on". A3 is committed on it.

## Left in S2

- Not built from A3's spec: a module's own list shown on its page (the list lives in its
  module.yaml and Activity). It wasn't asked for, so it was left.
