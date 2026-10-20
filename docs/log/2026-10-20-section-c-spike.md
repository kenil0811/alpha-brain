# Section C, C0: the spike (20 Oct 2026, afternoon)

Kenil sent section C, "one stream, many sessions underneath" (C0–C7), after section A's
acceptance was committed (`8f9dd78`). C0 comes first: three questions about the pinned SDK,
each answered yes or no here before anything is built. Nothing in the product changed.

**How:** a script on the SDK as Alpha's engine uses it (0.2.168, bundled Claude Code
2.1.301), headless, model Sonnet:
- Claude Code's preset prompt, with `Agent`, `Task`, `Bash`, `SendMessage`, `TaskOutput` and
  `TaskStop` allowed;
- hooks on PreToolUse and PostToolUse that note every call with its `agent_id`;
- one `ClaudeSDKClient` kept open for the whole run, and read with `receive_messages()`
  while no query was in flight.

The script and its two outputs are in the session's scratchpad (`c0spike/`).

## (a) A background subagent while the turn returns: yes

- **Asked** to start one subagent with `run_in_background: true`, then reply "started":
  - the Agent call came back at once ("Async agent launched successfully");
  - a `TaskStartedMessage` gave the task's id;
  - the turn's result ("started") came 8.1 s after the start, while the subagent ran.
- **The subagent's calls** reached both hooks carrying its id (`agent_id=a6591e556e3b5252d`,
  the same as the task's id). The desk's own calls carry none.
- **Its progress** came as `TaskProgressMessage`s ("Running sleep 25 && echo FINISHED-XYZ"),
  with its tool calls as messages whose `parent_tool_use_id` is the Agent call.

## (b) Its completion while the desk is idle: yes, and the desk takes a turn of its own

- **The completion arrived with no query in flight:**
  - a `TaskUpdatedMessage` (completed);
  - a `TaskNotificationMessage` with the subagent's final message as its `summary`.
- **The bundled Claude Code then started a turn of the desk session by itself:** an `init`,
  an assistant message with no parent, and a `ResultMessage`. In that turn the desk
  reported the outcome in its own words.
- **So the spec's nudge is not needed:** the desk writes the outcome without the core
  starting a turn. What the core has to do is keep the desk's client connected and read its
  stream between the person's sentences.

## (c) A message to a running background task: yes

- **The desk** found `SendMessage` by tool search and sent the running subagent "also add
  EXTRA-123". The tool answered "Resuming agent ace607f".
- **The subagent's next report was "ORIGINAL EXTRA-123".** The desk then took its own turn
  again to report it.

## Seen along the way

- **A subagent that backgrounds its own command finishes early.**
  - Claude Code blocked a bare `sleep` in the subagent ("use Monitor with an until-loop"), so
    the subagent ran the command in the background itself.
  - It then ended its turn with an interim line ("I'm waiting for it to finish"), which
    counted as the task completed.
  - When the inner command finished, the subagent woke again (the same task id started
    again) and completed a second time.
  - Each completion gave the desk a turn of its own: two outcomes for one piece of work, the
    first one premature.
  - In Alpha, a subagent's shell would have to run in the foreground, as S2's hook already
    makes the Agent call itself do.
- **Background work lives in the CLI's process.** Today the engine opens one client per turn
  and closes it at the turn's end. Under path 1, the desk's client has to stay open between
  sentences, or its work dies with the turn. A restart of the core ends any running work, as
  it ends a working item today.

## Which path

(a) yes and (b) yes: **path 1**, the SDK's background subagents, with no nudge. The proposal
for C1–C7 follows, for Kenil's yes.
