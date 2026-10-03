"""Conversations: where a sentence goes, and how a conversation lives and ends.

A conversation is a chat thread: a scope (a module, or General when it has none), a title
Alpha gives it from the first sentence, a state, its own stream, and its own model session
while it is live (design §3.7). Several can be live at once. Memory is shared only through the
world, never through a session.

Routing, for a sentence that arrives without a conversation (the companion):
1. **Structure, where it is certain.** A tap on a question's choice carries the question's id.
   A sentence that follows an open question, when that question's conversation is the only
   live one or nothing else could take it, goes to the one that asked.
2. **The judge, when there is a real choice.** With more than one live conversation, the
   System One seam decides from the real state (each conversation's title, scope, open
   question and last exchange, the sentence, the focus), leaning toward continuing the focus.
   Under a confidence it does not guess: it asks the person with the candidates as choices,
   and the answer routes the original sentence.
3. No name matching, no keyword rules: a rule here never reads meaning.
"""

from __future__ import annotations

import logging
from typing import Any

from alpha.runtime import judge
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World

log = logging.getLogger(__name__)

IDLE_CLOSE_S = 30 * 60  # a conversation nobody has spoken in for half an hour is over
CONFIDENT = 0.6
NEW = "something new"
FOCUS_KEY = "companion_focus"


def title_for(sentence: str) -> str:
    words = " ".join(sentence.split())
    if len(words) <= 60:
        return words[:1].upper() + words[1:]
    cut = words[:60].rsplit(" ", 1)[0]
    return cut[:1].upper() + cut[1:] + "…"


def open_conversation(world: World, sentence: str, module: str | None) -> dict[str, Any]:
    module_id = world.modules.get(module)["id"] if module else None
    return world.modules.open_thread(title_for(sentence), "chat", module_id)


def live_for(world: World, module: str | None) -> dict[str, Any] | None:
    module_id = world.modules.get(module)["id"] if module else None
    return world.modules.live_chat(module_id)


def ensure(world: World, sentence: str, module: str | None) -> dict[str, Any]:
    """The live conversation in a scope, or a new one for this sentence."""
    return live_for(world, module) or open_conversation(world, sentence, module)


def close(world: World, cid: str, why: str = "done") -> dict[str, Any]:
    """A conversation ends: its session is dropped; its turns stay in the journal."""
    thread = world.modules.thread(cid)
    if thread["state"] == "done":
        return thread
    world.modules.update_thread(cid, state="done")
    world.modules.set_session(cid, None)
    world.journal.append("changed", f"Closed the conversation \"{thread['title']}\" ({why}).",
                         actor="alpha" if why != "done" else "person",
                         data={"conversation": cid, "why": why}, thread=cid,
                         module=thread["module"])
    if focus(world) == cid:
        set_focus(world, None)
    return world.modules.thread(cid)


def close_idle(world: World, *, idle_s: int = IDLE_CLOSE_S) -> list[str]:
    """Conversations nobody has spoken in for a while are over (the scheduler's tick)."""
    from datetime import UTC, datetime, timedelta

    cutoff = (datetime.now(UTC) - timedelta(seconds=idle_s)).replace(microsecond=0).isoformat()
    closed = []
    for chat in world.modules.chats(live=True, limit=100):
        if chat["state"] == "working":
            continue
        last = world.store.one("SELECT MAX(at) AS at FROM journal WHERE thread = ?",
                               (chat["id"],))
        last_at = (last["at"] if last and last["at"] else None) or chat["updated_at"]
        if last_at < cutoff:
            close(world, chat["id"], why="quiet for a while")
            closed.append(chat["id"])
    return closed


# ---- the companion's focus ----


def focus(world: World) -> str | None:
    row = world.store.one("SELECT value FROM meta WHERE key = ?", (FOCUS_KEY,))
    if row is None:
        return None
    try:
        return world.modules.thread(row["value"])["id"] if row["value"] else None
    except Exception:
        return None


def set_focus(world: World, cid: str | None) -> None:
    with world.store.tx() as db:
        db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (FOCUS_KEY, cid or ""))


# ---- routing ----


def _exchange(world: World, cid: str) -> str:
    turns = world.journal.recent(2, thread=cid, kinds=["said", "replied"])
    return " / ".join(f"{'person' if e['kind'] == 'said' else 'alpha'}: {e['text'][:160]}"
                      for e in turns) or "(nothing said yet)"


def _open_question(world: World, cid: str) -> str | None:
    for a in world.journal.open_asks():
        if a["thread"] == cid:
            return str(a["text"])
    return None


def candidates(world: World) -> list[dict[str, Any]]:
    """Live conversations as the judge sees them."""
    out = []
    for chat in world.modules.chats(live=True, limit=12):
        scope = world.modules.get(chat["module"])["name"] if chat["module"] else "General"
        out.append({"id": chat["id"], "title": chat["title"], "scope": scope,
                    "question": _open_question(world, chat["id"]),
                    "last": _exchange(world, chat["id"])})
    return out


def route(world: World, sentence: str, *, runner: Any = None,
          ask_when_unsure: bool = True) -> dict[str, Any]:
    """Where a sentence with no conversation of its own goes. Returns
    {"conversation": id} or, when the judge is unsure and asking is allowed,
    {"ask": journal id, "options": [...]}: the question carries the sentence, and the answer
    routes it."""
    live = candidates(world)
    current = focus(world)
    if not live:
        new = open_conversation(world, sentence, None)
        set_focus(world, new["id"])
        return {"conversation": new["id"], "by": "new"}
    # Structure: only one conversation could take it, or exactly one asked a question.
    asking = [c for c in live if c["question"]]
    if len(live) == 1:
        set_focus(world, live[0]["id"])
        return {"conversation": live[0]["id"], "by": "only one"}
    if len(asking) == 1 and len(sentence.split()) <= 12:
        set_focus(world, asking[0]["id"])
        return {"conversation": asking[0]["id"], "by": "answers the open question"}
    # A real choice: the judge, from the real state, leaning toward the focus.
    labels = {}
    lines = []
    for c in live:
        label = f"{c['scope']}: {c['title']}"
        labels[label] = c["id"]
        marks = []
        if c["id"] == current:
            marks.append("the one in focus")
        if c["question"]:
            marks.append(f"it asked: {c['question'][:160]}")
        lines.append(f"- {label}" + (f" ({'; '.join(marks)})" if marks else "")
                     + f"\n  last exchange: {c['last']}")
    question = judge.Question(
        kind="choose",
        text=("Which conversation does the person's sentence continue? Prefer the one in focus"
              " when the sentence could continue it; pick another only when the sentence"
              f" plainly belongs there; answer \"{NEW}\" when it starts a new subject."),
        state=f"The person said: \"{sentence}\"\n\nLive conversations:\n" + "\n".join(lines),
        options=[*labels, NEW],
    )
    kwargs: dict[str, Any] = {"world_path": world.path}
    if runner is not None:
        kwargs["runner"] = runner
    verdict = judge.ask(question, **kwargs)
    if verdict.answer == NEW and verdict.confidence >= CONFIDENT:
        new = open_conversation(world, sentence, None)
        set_focus(world, new["id"])
        return {"conversation": new["id"], "by": "judge: new", "confidence": verdict.confidence}
    if verdict.answer in labels and verdict.confidence >= CONFIDENT:
        cid = labels[verdict.answer]
        set_focus(world, cid)
        return {"conversation": cid, "by": f"judge: {verdict.why}",
                "confidence": verdict.confidence}
    if not ask_when_unsure:
        cid = current if current in {c["id"] for c in live} else live[0]["id"]
        set_focus(world, cid)
        return {"conversation": cid, "by": "unsure; stayed", "confidence": verdict.confidence}
    # Unsure: ask, with the candidates as choices; the answer routes the sentence.
    options = [*labels, NEW]
    jid = world.journal.append(
        "asked", f"Which is this about? \"{sentence[:120]}\"",
        data={"options": options, "routing": {"text": sentence, "choices": {**labels, NEW: ""}}})
    return {"ask": jid, "options": options, "confidence": verdict.confidence}


def routed_answer(world: World, ask: dict[str, Any], answer: str) -> dict[str, Any] | None:
    """The person's pick for a routing question: the conversation to send the original
    sentence to (opened when they chose something new), and that sentence."""
    routing = (ask.get("data") or {}).get("routing")
    if not routing:
        return None
    chosen = next((k for k in routing["choices"] if k.lower() == answer.strip().lower()), None)
    if chosen is None:
        return None
    cid = routing["choices"][chosen] or open_conversation(world, routing["text"], None)["id"]
    set_focus(world, cid)
    return {"conversation": cid, "text": routing["text"]}


def fake_runner(answer: str, confidence: float = 0.9) -> Any:
    """For tests: a judge that always gives one answer."""

    def runner(req: TurnRequest) -> RunResult:
        return RunResult(ok=True, reply=f'{{"answer": "{answer}", "confidence": {confidence},'
                                        ' "why": "test"}')

    return runner
