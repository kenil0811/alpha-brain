"""Spike 6: the SDK's own files and shell in a turn, under Claude Code's sandbox, on this Mac.
Six questions: a shell write inside the module's directory (cwd); a shell write outside it; a
shell read outside it; the network from the shell; the Read tool on a granted folder (does the
permission callback see the path?); the Write tool outside cwd and add_dirs (does it reach the
callback?). Nothing here is Alpha's code: the SDK alone."""
import asyncio, os, sys, tempfile, pathlib, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "2026-10-17-slice1"))
from common import options, describe, stamp
from claude_agent_sdk import ClaudeSDKClient, PermissionResultAllow, ResultMessage

home = pathlib.Path(tempfile.mkdtemp(prefix="alpha-spike6-"))
module = home / "modules" / "m_test"; module.mkdir(parents=True)
granted = home / "granted"; granted.mkdir(); (granted / "note.txt").write_text("car wash: 3 sites shortlisted\n")
outside = home / "outside"; outside.mkdir()
seen = []

async def can_use(tool_name, input_data, context):
    seen.append((tool_name, {k: (str(v)[:80]) for k, v in dict(input_data).items()}))
    return PermissionResultAllow()

QUESTIONS = [
    ("write inside", f"Run exactly this shell command and report its output: echo inside > inside.txt && cat inside.txt && pwd"),
    ("write outside", f"Run exactly this shell command and report whether it worked or what error came back: echo out > {outside}/x.txt"),
    ("read outside", f"Run exactly this shell command and report the first line of output or the error: head -1 {outside.parent.parent}/../../../etc/hosts"),
    ("network", "Run exactly this shell command and report the output or the error: curl -sS -m 5 https://example.com | head -c 40"),
    ("Read granted", f"Use the Read tool (not the shell) on {granted}/note.txt and quote its first line."),
    ("Write outside", f"Use the Write tool (not the shell) to create {outside}/w.txt with the text 'hello'. Report whether it worked or what came back."),
]

async def main():
    opts = options(cwd=str(module), add_dirs=[str(granted)],
                   allowed_tools=["Bash", "Read", "Glob", "Grep", "Write", "Edit"],
                   permission_mode="default", can_use_tool=can_use, include_partial_messages=False,
                   sandbox={"enabled": True, "autoAllowBashIfSandboxed": True,
                            "allowUnsandboxedCommands": False, "network": {}})
    async with ClaudeSDKClient(options=opts) as c:
        for name, q in QUESTIONS:
            print(f"\n=== {name}")
            await c.query(q)
            async for m in c.receive_response():
                line = describe(m)
                if line.startswith(("User", "Assistant", "Result")):
                    print(stamp(), line[:300])
    print("\ncallback saw:", json.dumps(seen, indent=0)[:1500])
    print("inside.txt exists:", (module / "inside.txt").exists(), "| outside x.txt:", (outside / "x.txt").exists(), "| outside w.txt:", (outside / "w.txt").exists())

asyncio.run(main())
