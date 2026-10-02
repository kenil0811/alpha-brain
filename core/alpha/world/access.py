"""Access modes: how much Alpha may do in a conversation before it asks (the composer's + ->
Advanced -> Access, seeded from Settings -> Builds), after Alpha's own `needs_approval`.

- ask ("Ask for approval"): reading the web through Alpha's browser (`page_read`,
  `page_script`, `page_to_table`, `reader_run`) and removing a record wait for the person's yes;
- approve_for_me ("Approve for me"): only removing a record waits;
- full ("Full access"): nothing here waits.

A call that waits becomes a pending action (`alpha.world.actions`) with the exact call as its
payload: the person approves it on Home and it runs once, from the core, exactly as stored.
The modes only ever add approvals on top of the governance rules, never take any away: in every
mode a write outward is still only a pending action, the never list still refuses, and the taint
gate still closes the web once a run has read private material. Automations and the turns that
make a project (a `build` thread) run as the person set them up, as in Alpha, where neither went
through the approval step.
"""

from __future__ import annotations

import inspect
from collections.abc import Callable
from typing import TYPE_CHECKING, Any

from alpha.connectors.browser import site_of
from alpha.models import settings
from alpha.world.actions import Actions, register
from alpha.world.store import Problem
from alpha.world.world import World

if TYPE_CHECKING:
    from alpha.mcp.tools import Tools

KIND = "approved_call"
WEB = {"page_read", "page_script", "page_to_table", "reader_run"}
UNSAFE = {"records_delete"}


def gated(mode: str) -> set[str]:
    return WEB | UNSAFE if mode == "ask" else UNSAFE if mode == "approve_for_me" else set()


def _summary(tools: Tools, name: str, call: dict[str, Any]) -> str:
    if name == "records_delete":
        try:
            desc = tools.world.collections.describe(str(call.get("collection")))
            rec = tools.world.collections.get(desc["name"], str(call.get("id")))
            title = rec.get(desc["title_field"]) or "a row"
            return f"Remove {title} from {desc['title']}"
        except Problem:
            return "Remove a row"
    if name == "reader_run":
        return f"Run the reader {call.get('name')}"
    try:
        return f"Read {site_of(str(call.get('url')))} in Alpha's browser"
    except Problem:
        return "Read a page in Alpha's browser"


def hold(tools: Tools, fn: Callable[..., Any], args: tuple[Any, ...],
         kwargs: dict[str, Any]) -> dict[str, Any] | None:
    """None to let the call run now; otherwise it waits for the person, as a pending action."""
    name = fn.__name__
    if tools.approved or name not in WEB | UNSAFE:
        return None
    if tools._in_automation():
        return None
    store = tools.world.store
    if tools.thread:
        row = store.one("SELECT kind FROM threads WHERE id = ?", (tools.thread,))
        if row and row["kind"] == "build":
            return None
    if name not in gated(settings.access_mode(store, tools.thread)):
        return None
    call = dict(inspect.signature(fn).bind(tools, *args, **kwargs).arguments)
    call.pop("self", None)
    action = Actions(tools.world).propose(
        KIND, _summary(tools, name, call),
        {"tool": name, "input": call, "turn": tools.turn, "thread": tools.thread,
         "module": tools.module},
        connector="alpha", turn=tools.turn, thread=tools.thread, module=tools.module)
    return {"pending_action": action["id"], "state": action["state"],
            "note": "This conversation's access is set to ask first, so it waits on Home for "
                    "the person's yes and then runs once by itself. Tell them; carry on with "
                    "the rest."}


def enable(world: World) -> None:
    """Let an approved call run: exactly the stored call, once, outside any model run."""
    from alpha.mcp.tools import Tools

    def run(payload: dict[str, Any]) -> dict[str, Any]:
        tools = Tools(world, turn=payload.get("turn"), thread=payload.get("thread"),
                      module=payload.get("module"))
        tools.approved = True
        out = getattr(tools, str(payload["tool"]))(**payload.get("input", {}))
        if isinstance(out, dict) and "error" in out:
            raise Problem(str(out["error"]))
        return out if isinstance(out, dict) else {"result": out}

    register(KIND, "alpha", run)
