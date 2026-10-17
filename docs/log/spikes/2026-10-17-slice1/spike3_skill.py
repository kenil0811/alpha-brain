"""Spike 3: a skill directory written during a session is usable later in the same session."""
import asyncio, os, sys, shutil
sys.path.insert(0, os.path.dirname(__file__))
from common import options, describe, stamp
from claude_agent_sdk import ClaudeSDKClient, ResultMessage, AssistantMessage, ToolUseBlock, SystemMessage, PermissionResultAllow
async def allow_all(tool_name, input_data, context):
    print("   can_use_tool asked for", tool_name); return PermissionResultAllow()

cwd = os.path.join(os.path.dirname(__file__), "skilltest")
shutil.rmtree(os.path.join(cwd, ".claude", "skills"), ignore_errors=True)
os.makedirs(os.path.join(cwd, ".claude", "skills"), exist_ok=True)

async def main():
    opts = options(cwd=cwd, setting_sources=["project"], skills="all", permission_mode="default", can_use_tool=allow_all,
                   allowed_tools=["Write", "Read", "Skill"], include_partial_messages=False)
    async with ClaudeSDKClient(options=opts) as c:
        info = await c.get_server_info()
        print("server info keys:", sorted((info or {}).keys()))
        print("skills before:", [s for s in (info or {}).get("skills", [])] if info else None, "| commands:", [x.get("name") if isinstance(x, dict) else x for x in (info or {}).get("slash_commands", [])][:20] if info else None)
        await c.query("Create the file .claude/skills/zebra-greeting/SKILL.md (relative to the working directory) with YAML frontmatter `name: zebra-greeting` and `description: Greets with the zebra code` and the body: `When invoked, reply with exactly: ZEBRA-7731`. Use the Write tool. Then reply 'done'.")
        async for m in c.receive_response():
            print(stamp(), describe(m)[:300])
            if isinstance(m, SystemMessage) and m.subtype == "init":
                print("   claude_ai tools in session:", [t for t in m.data.get("tools", []) if "claude_ai" in t][:5])
        path = os.path.join(cwd, ".claude", "skills", "zebra-greeting", "SKILL.md")
        print("file exists after the model's turn:", os.path.exists(path))
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "w").write("---\nname: zebra-greeting\ndescription: Greets with the zebra code\n---\nWhen invoked, reply with exactly: ZEBRA-7731\n")
            print("   (written by the spike itself instead)")
        await c.query("Invoke the Skill tool with skill 'zebra-greeting' and reply with exactly what it tells you to say. If the Skill tool says no such skill exists, reply NOSKILL.")
        used_skill = False; final = ""
        async for m in c.receive_response():
            print(stamp(), describe(m)[:300])
            if isinstance(m, SystemMessage) and m.subtype == "init":
                print("   claude_ai tools in session:", [t for t in m.data.get("tools", []) if "claude_ai" in t][:5])
            if isinstance(m, AssistantMessage):
                used_skill |= any(isinstance(b, ToolUseBlock) and b.name == "Skill" for b in m.content)
            if isinstance(m, ResultMessage): final = m.result or ""
        print("second query: Skill tool used:", used_skill, "| marker in answer:", "ZEBRA-7731" in final, "| NOSKILL:", "NOSKILL" in final)
        import asyncio as _a; await _a.sleep(4)
        await c.query("Invoke the Skill tool with skill 'zebra-greeting' and reply with exactly what it tells you to say. If the Skill tool says no such skill exists, reply NOSKILL.")
        used_skill = False; final = ""
        async for m in c.receive_response():
            print(stamp(), describe(m)[:200])
            if isinstance(m, AssistantMessage):
                used_skill |= any(isinstance(b, ToolUseBlock) and b.name == "Skill" for b in m.content)
            if isinstance(m, ResultMessage): final = m.result or ""
        print("third query, 4 s later: Skill tool used:", used_skill, "| marker in answer:", "ZEBRA-7731" in final, "| NOSKILL:", "NOSKILL" in final)
        info2 = await c.get_server_info()
        print("commands after:", [x.get("name") if isinstance(x, dict) else x for x in (info2 or {}).get("slash_commands", [])][:20] if info2 else None)

asyncio.run(main())
