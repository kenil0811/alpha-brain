# Reliability first (9 October 2026)

Kenil: "lets do 1 and 2" after the 8 Oct reading of what went wrong. This entry is item 1, the
small fixes that each close a way the system failed that week; item 2, agents, follows.

**A turn whose tool calls all failed is a failed turn** (`claude_cli.count_tools`,
`tools_verdict`; `codex_cli.parse_events`). Both runners now count the tool calls a run made and
the ones that failed at the transport (the tool server not there, the call refused), as against
a tool answering with a plain problem. When every call failed, the run is not ok and its error
says so: "Alpha's tools didn't answer in this run (1 of 1 call failed: Codex refused the call
under its own approval gate ('user cancelled MCP tool call')); nothing it said counts." The
model's words are never the answer. On 8 Oct that turn would have come back failed in the panel
instead of "Approved. The build will run in the background".

**Switching routes runs a real tool call first** (`route.trial`, `PUT /api/thinking`). One
small run through the new way (`collections_list`, then "ok") before the preference moves; a
way that cannot reach Alpha's tools is never switched to, with the reason: "ChatGPT can't reach
Alpha's tools yet: …". Use this says "Trying it…" meanwhile. Run for real on a copy of Kenil's
world: Claude passed in 6.9 s ("1 tool call answered"); Codex was refused in 7.9 s with the
words above. The ChatGPT route stays unreachable until Codex's own setting is found.

**A page that doesn't answer at wake is tried again in a minute** (`pipeline.transient`,
`RETRY_AFTER_S`). A read step whose browser error is a network one (`net::ERR_…`, a navigation
timeout) is journaled ("brokers couldn't reach its page (net::ERR_NETWORK_CHANGED …); trying
again in a minute") and run once more after a minute; a second failure skips that source for the
run ("couldn't be reached") and the others carry on, where before the whole run died on the
first.

**The schedule's words say the truth** (`automations.describe`). A clock time reads "every day
at 07:00, or when your Mac next wakes", because that is what the scheduler's sleep rule does;
the window and the journal both say it now.

**Runs that went wrong reach the person** (`views.troubles`, `/api/companion`, the companion's
bubble). The companion bubbles the newest run of the last day that ended with a problem,
"Daily deal tracker: brokers couldn't be reached.", with See it (Intelligence › Automations) and
OK, once per failure, and looks concerned while it has one to say.

**Reading in a run is the steps' work, never the model's; an old automation converts itself**
(`reader_run` inside an automation, `AUTOMATION_RULES`, `automation.run`). `reader_run` is
refused inside an automation's run with the way to convert it (`automation_update` with `read …
into … keep …` and `tell` steps); the run's rules say the same; and when the procedure run ends
with the automation converted, the steps run at once in the same run, so the day is not lost.
The LinkedIn connections automation, a procedure since 1 Oct, is the case this was written for.

**Checked.** Core: the verdict from both runners' events; the trial (passes, refuses, and no
trial for the same route); the retry and the skip; the schedule words; the wall, the conversion
and the steps running in the same run; the companion's troubles. 217 core tests, 77 desktop,
lint, mypy and typecheck clean. Journey `automation_self_converts` on a copy of Kenil's world,
the real LinkedIn connections automation through Claude (`docs/journeys/2026-10-09-0008.md`):
passed, 1 of 1, 208 s. The run's model turn was refused its reader call, converted the
automation to steps (`linkedin_connections` then tell), and the steps read LinkedIn in the
same run: "Read 1 of 1 sources. LinkedIn Connections: 2 new, 50 changed, 1 gone." In Kenil's
own world the same happens at the automation's next run, on Claude.
