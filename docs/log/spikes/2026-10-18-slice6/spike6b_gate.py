"""Spike 6b: the gates in code. Read/Write/Edit kept out of allowed_tools so they reach the
callback, which allows a read in the granted folder, denies a write outside the module, and
denies the sandbox's network request; the shell reads the granted folder (add_dirs)."""
import asyncio, os, sys, tempfile, pathlib, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "2026-10-17-slice1"))
from common import options, describe, stamp
from claude_agent_sdk import ClaudeSDKClient, PermissionResultAllow, PermissionResultDeny

home = pathlib.Path(tempfile.mkdtemp(prefix="alpha-spike6b-"))
module = home / "modules" / "m_test"; module.mkdir(parents=True)
granted = home / "granted"; granted.mkdir(); (granted / "note.txt").write_text("car wash: 3 sites shortlisted\n")
outside = home / "outside"; outside.mkdir()
seen = []

def inside(path: str, roots) -> bool:
    p = pathlib.Path(path).resolve()
    return any(p == r or r in p.parents for r in roots)

async def can_use(tool_name, input_data, context):
    d = dict(input_data); seen.append((tool_name, {k: str(v)[:60] for k, v in d.items()}))
    if tool_name == "SandboxNetworkAccess":
        return PermissionResultDeny(message="No network from the shell: anything that leaves the world goes through act_outward.")
    if tool_name in ("Read", "Glob", "Grep"):
        path = d.get("file_path") or d.get("path") or str(module)
        return PermissionResultAllow() if inside(path, [module, granted]) else PermissionResultDeny(message=f"{path} is not in a folder the person granted.")
    if tool_name in ("Write", "Edit"):
        path = d.get("file_path", "")
        return PermissionResultAllow() if inside(path, [module]) else PermissionResultDeny(message="Alpha writes only inside the module's own directory.")
    return PermissionResultAllow()

QUESTIONS = [
    ("shell reads granted", f"Run exactly: cat {granted}/note.txt   and report the output or error."),
    ("network denied", "Run exactly: curl -sS -m 5 https://example.com | head -c 40   and report the output or the error."),
    ("Read outside denied", f"Use the Read tool on /etc/hosts and report what came back."),
    ("Write outside denied", f"Use the Write tool to create {outside}/w.txt with 'hello' and report what came back."),
    ("Write inside ok", f"Use the Write tool to create NOTES.md in the current directory with 'notes' and report what came back."),
]

async def main():
    opts = options(cwd=str(module), add_dirs=[str(granted)], allowed_tools=["Bash", "Glob", "Grep"],
                   permission_mode="default", can_use_tool=can_use, include_partial_messages=False,
                   sandbox={"enabled": True, "autoAllowBashIfSandboxed": True, "allowUnsandboxedCommands": False, "network": {}})
    async with ClaudeSDKClient(options=opts) as c:
        for name, q in QUESTIONS:
            print(f"\n=== {name}")
            await c.query(q)
            async for m in c.receive_response():
                line = describe(m)
                if line.startswith(("User", "Assistant")):
                    print(stamp(), line[:260])
    print("\ncallback saw:", json.dumps([s[0] for s in seen]))
    print("outside w.txt:", (outside / "w.txt").exists(), "| module NOTES.md:", (module / "NOTES.md").exists())

asyncio.run(main())
