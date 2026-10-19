"""A turn: the person says something; Alpha does it and answers.

1. the sentence is journaled (`said`);
2. the layers are built for the scope (`context/layers.py`): the start layer, given when the
   session is new and after a compaction, and the turn layer, given with every sentence;
3. what the model is given is recorded with the turn (`turn_contexts`), so a wrong answer can
   be traced to what it saw;
4. the model runs with the world's tools; Home and a work item resume their own session
   (`conversation=True`) when it was made with the same tools and the same way of giving the
   world, else start a fresh one carrying the conversation's checkpoint; an agent's run starts
   from its brief and its own thread, never from a remembered conversation;
5. the answer is journaled (`replied`), or the failure (`failed`) in plain words.
"""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from alpha import config
from alpha.connectors.base import skills_text
from alpha.context import layers
from alpha.runtime import engine, route, running
from alpha.runtime.conversations import first_line
from alpha.runtime.running import NO_ANSWER, STALLED, RunResult, TurnRequest
from alpha.world.journal import RUN
from alpha.world.store import Problem, loads
from alpha.world.world import World

log = logging.getLogger("alpha.turn")


@dataclass
class TurnOutcome:
    reply: str
    ok: bool
    said: str
    replied: str
    result: RunResult
    opened: list[str] = field(default_factory=list)


Runner = Callable[[TurnRequest], RunResult]


def timings(world: World, limit: int = 40, *, actor: str = "person") -> list[dict[str, Any]]:
    """How long the last turns took, from the journal: the wall time from the sentence to the
    reply, the time to its first words, the model's own time and steps (the CLI's result), its
    tokens (none before 19 Oct night) and whether the run resumed a conversation's session. The
    numbers STATE quotes are measured here (`alpha turns`)."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in world.store.all(
            "SELECT id, at, kind, data FROM journal WHERE kind IN ('replied', 'failed')"
            " AND json_extract(data, '$.turn') IS NOT NULL AND deleted_at IS NULL ORDER BY at"):
        data = loads(row["data"], {})
        try:
            said = world.journal.read(str(data["turn"]))
        except Problem:
            continue
        session = data.get("session_id")
        resumed = bool(session) and session in seen
        if session:
            seen.add(str(session))
        if said["actor"] != actor or not data.get("duration_ms"):
            continue
        wall = (datetime.fromisoformat(row["at"]) - datetime.fromisoformat(said["at"]))
        out.append({"at": said["at"], "turn": said["id"], "text": said["text"],
                    "wall_s": round(wall.total_seconds(), 1),
                    "model_s": round(data["duration_ms"] / 1000, 1),
                    "steps": data.get("num_turns") or 0, "resumed": resumed,
                    "first_s": (round(data["first_text_ms"] / 1000, 1)
                                if data.get("first_text_ms") else None),
                    **{k: data.get(k) for k in TOKENS},
                    "ok": row["kind"] == "replied"})
    return out[-limit:]


def close_answered_asks(world: World, sentence: str, thread: str | None) -> None:
    """The person's next message in the same conversation answers what Alpha asked in its
    previous turn there: words typed answer every question of that turn; an answer given on
    a question's own card answers that question alone (found 11 Oct: one tap closed the two
    cards beside it), so the siblings stay open until each has its answer."""
    previous = world.journal.recent(1, thread=thread, stream=thread is None, kinds=["said"])
    if not previous:
        return
    turn = previous[-1]["id"]
    # a question asked with no thread of its own is Home's
    home = world.modules.home_thread()["id"] if thread else None
    asked = [a for a in world.journal.open_asks()
             if (a["thread"] or home) == thread and a["data"].get("turn") == turn]
    if not asked:
        return
    answered_on_cards = world.store.one(
        "SELECT 1 AS one FROM journal b JOIN journal a ON json_extract(b.data, '$.ask') = a.id"
        " WHERE b.kind = 'answered' AND a.kind = 'asked' AND json_extract(a.data, '$.turn') = ?"
        " AND b.deleted_at IS NULL", (turn,))
    if answered_on_cards:
        return
    for a in asked:
        world.journal.append("answered", sentence, actor="person", data={"ask": a["id"]},
                             thread=thread, module=a["module"])


def answers_a_deferral(world: World, thread: str | None) -> bool:
    """Whether the thread's newest answer is to a card a deferred call waits on (P3 item 7):
    that turn resumes its session whatever changed, or the call would be lost."""
    if not thread:
        return False
    last = world.journal.recent(1, thread=thread, kinds=["answered"])
    ask = last[-1]["data"].get("ask") if last else None
    if not ask:
        return False
    try:
        return bool(world.journal.read(str(ask))["data"].get("tool_use"))
    except Problem:
        return False


def wrote_anything(world: World, turn_id: str) -> bool:
    """Whether a turn left anything in the journal beyond the sentence that started it."""
    return any(e["data"].get("turn") == turn_id and e["id"] != turn_id
               for e in world.journal.recent(200))


def module_made_by(world: World, turn_id: str) -> str | None:
    """The module a turn made, if one (its tool journals `made` with the turn's id)."""
    row = world.store.one(
        "SELECT json_extract(data, '$.module') AS m FROM journal WHERE kind = 'made'"
        " AND json_extract(data, '$.turn') = ? AND json_extract(data, '$.module') IS NOT NULL"
        " ORDER BY at LIMIT 1", (turn_id,))
    return str(row["m"]) if row and row["m"] else None


def threads_opened_by(world: World, turn_id: str) -> list[str]:
    """The threads a turn opened (its tools journal each one with the turn's id)."""
    rows = world.store.all(
        "SELECT json_extract(data, '$.thread') AS t FROM journal WHERE kind = 'made'"
        " AND json_extract(data, '$.turn') = ? AND json_extract(data, '$.thread') IS NOT NULL",
        (turn_id,),
    )
    return [str(r["t"]) for r in rows]


# A turn's tokens as the model's result gives them, the three kinds of input kept apart (B8):
# what was read fresh, what came from the cache and what was written to it.
TOKENS = {"tokens_input": "input_tokens", "tokens_cache_read": "cache_read_input_tokens",
          "tokens_cache_made": "cache_creation_input_tokens", "tokens_out": "output_tokens"}


def tokens_of(result: RunResult) -> dict[str, int]:
    usage = (result.raw or {}).get("usage") or {}
    if not isinstance(usage, dict) or not usage:
        return {}
    return {kept: int(usage.get(given) or 0) for kept, given in TOKENS.items()}


# What was going on in a conversation, for a fresh session (A12): Watson's checkpoint, which
# registers itself here (it imports this module, so it cannot be imported back).
CARRY_OVER: list[Callable[..., str | None]] = []
# What a conversation keeps when its session was compacted during a turn (B6, Q99): Watson
# writes its checkpoint afresh, so a fresh session there later carries what is true now.
AFTER_COMPACTION: list[Callable[..., Any]] = []


def carry_over(world: World, thread: str, runner: Runner) -> str | None:
    for find in CARRY_OVER:
        try:
            found = find(world, thread, runner=runner)
        except Exception:
            log.exception("what was going on in %s", thread)
            continue
        if found:
            return found
    return None


def ask(
    world: World,
    sentence: str,
    *,
    module: str | None = None,
    thread: str | None = None,
    runner: Runner = route.run,
    rules: str | None = None,
    actor: str = "person",
    agent: str | None = None,
    model: str | None = None,
    on_said: Callable[[str], None] | None = None,
    journal_as: str | None = None,
    conversation: bool = False,
) -> TurnOutcome:
    """One turn. `actor` is who says the sentence: the person, Alpha (a turn it starts itself)
    or an agent (its run), journaled as said or did. `agent` is the agent doing the turn, if
    one: it is the actor of every step and of the reply, the tools know it and cut its hands
    to its write list (Q50). `journal_as` is the short line journaled in place of a long prompt
    (the prompt itself is kept with the turn's context)."""
    module_id = world.modules.get(module)["id"] if module else None
    # A sentence with no thread of its own is Home's (harness §7): the one conversation.
    thread = thread or world.modules.home_thread()["id"]
    thread_row = world.modules.thread(thread) if thread else None
    if module_id is None and thread_row and thread_row["module"]:
        module_id = thread_row["module"]
    if actor == "person":
        close_answered_asks(world, sentence, thread)
    said = world.journal.append(
        "said" if actor == "person" else "did", journal_as or sentence, actor=actor,
        module=module_id, thread=thread,
        data={"prompt": sentence} if journal_as else None,
    )
    if on_said is not None:
        on_said(said)
    rules = rules if rules is not None else config.prompt("turn")
    # The system prompt is fixed, so the session's cache holds; the world rides on the sentence
    # in two layers (section B, Q99): the start layer when the session is made, the turn layer
    # with every sentence.
    fixed = f"{rules}\n\nHOW TO USE WHAT ALPHA CAN REACH\n\n{skills_text()}"
    rules_hash = hashlib.sha256(fixed.encode()).hexdigest()[:12]
    start = layers.start_layer(world, module=module_id, thread=thread)
    layer = layers.turn_layer(world, sentence, module=module_id, thread=thread, said=said)
    resume = thread_row.get("session_ref") if (conversation and thread_row) else None
    if (resume and thread_row and thread_row.get("session_tools") != engine.fingerprint()
            and not answers_a_deferral(world, thread)):
        # A session made with other tool names would have the model call names this run lacks
        # (18 Oct 2026), and one made before the layers keeps the world in its old system
        # prompt (section B): a fresh one starts, given the start layer with what was going on
        # (A12: the conversation's checkpoint, in the start layer since Q99 question 5)
        resume = None
        carried = carry_over(world, thread, runner)
        if carried:
            start = f"{start}\n\n{layers.carried_part(carried)}"
        world.journal.append("did", "Starting a fresh session here: Alpha changed since the last"
                             " turn" + (", carrying what was going on." if carried else "."),
                             actor="alpha", thread=thread, module=module_id,
                             data={"turn": said, "fresh_session": True})
    # what the model is given with this sentence, kept as it saw it (`turn_contexts`)
    given = layer if resume else f"{start}\n\n{layer}"
    world.journal.keep_context(said, given, rules_hash)
    replier = agent or "alpha"
    request = TurnRequest(
        sentence=sentence,
        system=fixed,
        world_path=world.path,
        turn_id=said,
        thread_id=thread,
        module_id=module_id,
        model=model,
        actor=agent or "alpha",
        resume=resume,
        persist=conversation,
        run=RUN.get(),
        start_layer=start,
        turn_layer=layer,
    )
    result = runner(request)
    if (not result.ok and not result.stopped and result.error in (NO_ANSWER, STALLED)
            and not wrote_anything(world, said)):
        # The route failed (the CLI gave no answer, or its run went silent) before the turn
        # wrote anything: tried once more, the window saying so; never a turn that wrote
        # something, which would do it twice (the conversation, slice 1; Q35's leftover).
        running.LIVE.note([said], doing="Trying again")
        result = runner(request)
    if "start after a compaction" in request.injected:
        world.journal.keep_context(said, f"{given}\n\nGIVEN AGAIN AFTER A COMPACTION\n\n{start}",
                                   rules_hash)
    if "compacted" in request.injected and conversation and thread:
        for keep in AFTER_COMPACTION:
            try:
                keep(world, thread, runner=runner)
            except Exception:
                log.exception("after the compaction of %s", thread)
    if conversation and thread and result.ok and result.session_id:
        world.modules.set_session(thread, result.session_id, tools=engine.fingerprint())
    data = {
        "turn": said,
        "session_id": result.session_id,
        "num_turns": result.num_turns,
        "duration_ms": result.duration_ms,
        "cost_estimate": result.cost_estimate,
        "first_text_ms": getattr(result, "first_text_ms", None),
        # what the turn read and wrote, in tokens (A8 and B8 are measured by it)
        **tokens_of(result),
    }
    if result.ok:
        replied = world.journal.append(
            "replied", result.reply, actor=replier, data=data, module=module_id, thread=thread
        )
        reply = result.reply

    else:
        reply = (result.error or "You stopped it.") if result.stopped else (
            f"That didn't work: {result.error or 'no answer came back'}")
        replied = world.journal.append(
            "failed", reply, actor=replier, data={**data, "error": result.error},
            module=module_id, thread=thread,
        )
    if thread:
        # A page agreed in this conversation is done when the turn that did the work ended
        # well, stopped when the person stopped it (harness 2a: the yes, then the work here).
        world.workflows.settle_after_turn(thread, ok=result.ok, stopped=result.stopped,
                                          module=module_made_by(world, said))
        # The thread's one line, its card (slice 3); its state is the caller's to settle.
        world.modules.update_thread(thread, last_line=first_line(reply) or reply[:200])
    world.files.sync()  # the modules' directories follow the turn (slice 5)
    return TurnOutcome(reply=reply, ok=result.ok, said=said, replied=replied, result=result,
                       opened=threads_opened_by(world, said))
