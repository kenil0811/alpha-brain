"""Acting outward: procedures Alpha writes, actions the person approves, the walls between."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import alpha.connectors.browser as browser_module
from alpha.api.server import create_app
from alpha.connectors.base import Connections
from alpha.mcp.tools import Tools
from alpha.runtime import acting
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.actions import check_steps
from alpha.world.purge import remove_connection
from alpha.world.store import Problem
from alpha.world.world import World

STEPS = [{"click_text": "Compose"}, {"fill": "textarea[name=to]", "value": "{to}"},
         {"fill": "input[name=subjectbox]", "value": "{subject}"},
         {"type": "div[aria-label='Message Body']", "value": "{body}"},
         {"click": "img[aria-label='Save & close']"}]
FIELDS = ["to", "subject", "body"]
PAYLOAD = {"to": "sania@example.com", "subject": "Barcelona", "body": "Are you ready?"}


class Driver:
    """A fake browser driver: records the act jobs, writes the screenshots, and answers as told."""

    def __init__(self) -> None:
        self.jobs: list[dict[str, Any]] = []
        self.fail_at: int | None = None
        self.verified: bool | None = True

    def __call__(self, job: dict[str, Any], timeout: int) -> dict[str, Any]:
        self.jobs.append(job)
        if job["op"] == "status":
            return {"signed_in": True, "cookies": 3}
        assert job["op"] == "act"
        shots_dir = Path(job["shots_dir"])
        shots_dir.mkdir(parents=True, exist_ok=True)
        steps = job["steps"]
        upto = len(steps) - 1 if job["stop_before_last"] else len(steps)
        log = []
        shots: dict[str, str] = {}
        for i in range(upto):
            if self.fail_at == i + 1:
                (shots_dir / "error.png").write_bytes(b"png")
                shots["error"] = str(shots_dir / "error.png")
                log.append({"step": "click", "ok": False, "error": "no such button"})
                return {"done": i, "failed_step": i + 1, "error": "no such button", "log": log,
                        "shots": shots, "final_url": job["url"], "title": "Page not found",
                        "page_text": "This page doesn't exist. Please check your URL."}
            log.append({"step": next(iter(steps[i])), "ok": True, "ms": 5})
        name = "preview" if job["stop_before_last"] else "after"
        (shots_dir / f"{name}.png").write_bytes(b"png")
        shots[name] = str(shots_dir / f"{name}.png")
        return {"done": upto, "stopped_before_last": job["stop_before_last"],
                "verified": None if job["stop_before_last"] else self.verified,
                "log": log, "shots": shots, "final_url": job["url"], "title": "Gmail"}


def gmail_connected(world: World) -> None:
    # mail.google.com is google.com to the hand (registrable domain); a real gmail.com sign-in
    # covers it through the hosts its window passed, which a fake profile has no record of.
    Connections(world.store).upsert("browser", "google.com", status="connected")


def said(world: World, text: str) -> str:
    return world.journal.append("said", text, actor="person")


def keep_procedure(world: World, turn: str | None = None, effect: str = "prepare") -> Tools:
    t = Tools(world, turn=turn)
    out = t.procedure_save("gmail_draft", "https://mail.google.com/mail/u/0/#inbox",
                           "Make a draft email in Gmail", effect, STEPS, FIELDS,
                           verify=[{"expect_text": "Draft saved"}])
    assert out.get("version") == 1 and out["site"] == "google.com", out
    return t


# ---- the walls in the procedure itself ----


def test_fills_take_only_payload_fields_and_the_last_step_commits() -> None:
    with pytest.raises(Problem, match="never typed"):
        check_steps([{"fill": "x", "value": "hello there"}, {"click": "b"}], ["to"],
                    effect="prepare")
    with pytest.raises(Problem, match="not in fields"):
        check_steps([{"fill": "x", "value": "{cc}"}, {"click": "b"}], ["to"], effect="prepare")
    with pytest.raises(Problem, match="last step is the commit"):
        check_steps([{"fill": "x", "value": "{to}"}], ["to"], effect="send")
    with pytest.raises(Problem, match="effect must be"):
        check_steps([{"click": "b"}], [], effect="maybe")
    with pytest.raises(Problem, match="exactly one of"):
        check_steps([{"run": "document.title"}, {"click": "b"}], [], effect="prepare")
    steps, verify = check_steps(STEPS, FIELDS, effect="prepare",
                                verify=[{"expect_text": "Draft saved"}])
    assert len(steps) == 5 and verify == [{"expect_text": "Draft saved"}]


def test_a_payload_must_match_the_procedures_fields(world: World) -> None:
    t = keep_procedure(world)
    out = t.action_propose("gmail_draft", "Draft to Sania", {"to": "a@b.c"},
                           "the draft can be deleted")
    assert "missing subject, body" in out["error"]
    out = t.action_propose("gmail_draft", "Draft to Sania", {**PAYLOAD, "cc": "x"},
                           "the draft can be deleted")
    assert "doesn't use" in out["error"]


# ---- propose: a dry run, a card, nothing leaves ----


def test_propose_dry_runs_up_to_the_commit_and_waits_for_the_person(world: World,
                                                                     tmp_path: Path) -> None:
    gmail_connected(world)
    driver = Driver()
    with_fake(driver)
    try:
        t = keep_procedure(world, turn=said(world, "draft an email to sania about barcelona"))
        out = t.action_propose("gmail_draft", "Draft to Sania about Barcelona", PAYLOAD,
                               "the draft can be deleted from Gmail", evidence="your words")
        assert out["dry_run"] == "ok" and out["steps_done"] == 4, out
        action = world.actions.get(out["action"])
        assert action["state"] == "proposed" and action["preview"].endswith("preview.png")
        job = driver.jobs[-1]
        assert job["stop_before_last"] is True and job["values"] == {**PAYLOAD, "__files": {}}
        assert job["profile"].endswith("google.com")
        # Journaled as a proposal with the action, and as the dry run the hand did.
        kinds = [e["kind"] for e in world.journal.recent(5)]
        assert "proposed" in kinds and "did" in kinds
        assert world.procedures.get("gmail_draft")["health"] == "untried"
    finally:
        restore()


def test_acting_needs_the_persons_sign_in(world: World) -> None:
    driver = Driver()
    t = keep_procedure(world, turn=said(world, "draft to sania"))
    with_fake(driver)
    try:
        out = t.action_propose("gmail_draft", "Draft", PAYLOAD, "deletable")
        assert out["dry_run"] == "failed" and "sign-in" in out["why"]
        assert not driver.jobs or all(j["op"] != "act" for j in driver.jobs)
        failed = world.actions.get(out["action"])
        assert failed["state"] == "failed" and "sign-in" in failed["error"]
        # A failed card can't be approved: nothing runs on a dry run that didn't work.
        with pytest.raises(Problem, match="is failed"):
            acting.approve(world, out["action"], "yes",
                           runner=lambda r: RunResult(ok=True, reply=""))
    finally:
        restore()


def with_fake(driver: Driver) -> None:
    browser_module.run_job = driver  # type: ignore[assignment]


def restore() -> None:
    from importlib import reload

    reload(browser_module)


# ---- approve: the person's yes runs it; always makes a standing sentence ----


def test_approval_runs_it_and_a_standing_permission_skips_the_card_next_time(
        world: World) -> None:
    gmail_connected(world)
    driver = Driver()
    with_fake(driver)
    try:
        turn1 = said(world, "draft an email to sania")
        t = keep_procedure(world, turn=turn1)
        aid = t.action_propose("gmail_draft", "Draft to Sania", PAYLOAD, "deletable")["action"]
        # In the proposing turn the yes is refused; in the next, the person's words approve it.
        assert "reply to it" in t.action_approve(aid, "draft an email")["error"]
        turn2 = said(world, "yes do it, and always allow drafts")
        out = Tools(world, turn=turn2).action_approve(aid, "yes do it", always=True)
        assert out["state"] == "done" and out["verified"] is True, out
        action = world.actions.get(aid)
        assert action["result"].startswith("Made: Draft to Sania")
        assert action["approval"] == '"yes do it"'
        assert driver.jobs[-1]["stop_before_last"] is False and driver.jobs[-1]["verify"]
        assert world.procedures.get("gmail_draft")["health"] == "ok"
        granted = world.permissions.live()
        assert [p["sentence"] for p in granted] == [
            "Alpha may make a draft email in Gmail on google.com without asking."]
        # Next time: no card, it runs at once under the sentence.
        turn3 = said(world, "draft another one to sania")
        out = Tools(world, turn=turn3).action_propose("gmail_draft", "Second draft", PAYLOAD,
                                                      "deletable")
        assert out["ran_now"] is True and out["under"].startswith("Alpha may")
        assert world.actions.get(out["action"])["state"] == "done"
        # Revoked, the card is back.
        world.permissions.revoke(granted[0]["id"])
        out = Tools(world, turn=said(world, "once more")).action_propose(
            "gmail_draft", "Third", PAYLOAD, "deletable")
        assert out["dry_run"] == "ok" and world.actions.get(out["action"])["state"] == "proposed"
    finally:
        restore()


def test_a_send_never_gets_a_standing_permission(world: World) -> None:
    gmail_connected(world)
    with_fake(Driver())
    try:
        t = keep_procedure(world, turn=said(world, "send it"), effect="send")
        aid = t.action_propose("gmail_draft", "Email to Sania", PAYLOAD,
                               "a sent email cannot be unsent")["action"]
        out = Tools(world, turn=said(world, "yes send it, always")).action_approve(
            aid, "yes send it", always=True)
        assert out["state"] == "done"
        assert world.permissions.live() == []
        assert world.actions.get(aid)["result"].startswith("Sent: Email to Sania")
    finally:
        restore()


def test_a_failed_run_marks_the_procedure_broken_and_alpha_repairs(world: World) -> None:
    gmail_connected(world)
    driver = Driver()
    with_fake(driver)
    repairs: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        repairs.append(req.sentence)
        return RunResult(ok=True, reply="Repaired and proposed again.")

    try:
        t = keep_procedure(world, turn=said(world, "draft"))
        aid = t.action_propose("gmail_draft", "Draft", PAYLOAD, "deletable")["action"]
        driver.fail_at = 3
        out = acting.approve(world, aid, "yes", runner=runner)
        assert out["ok"] is False and "failed at step 3" in out["why"]
        action = world.actions.get(aid)
        assert action["state"] == "failed" and "no such button" in action["error"]
        assert world.procedures.get("gmail_draft")["health"] == "broken"
        assert repairs and "Repair the procedure" in repairs[0]
        # Alpha is shown what the hand saw, so a wrong address is not read as a wall.
        assert "Page not found" in repairs[0] and "This page doesn't exist" in repairs[0]
        failed = [e for e in world.journal.recent(10) if e["kind"] == "failed"]
        assert failed and "did not happen" in failed[-1]["text"]
    finally:
        restore()


# ---- the app: the card, approve, edit, decline, permissions ----


def test_the_api_shows_the_card_and_takes_the_decision(world: World) -> None:
    gmail_connected(world)
    with_fake(Driver())
    try:
        t = keep_procedure(world, turn=said(world, "draft to sania"))
        aid = t.action_propose("gmail_draft", "Draft to Sania", PAYLOAD, "deletable",
                               evidence="your words")["action"]
        c = TestClient(create_app(world, live=False,
                                  runner=lambda req: RunResult(ok=True, reply="")))
        home = c.get("/api/home").json()
        cards = [i for i in home["needs_you"] if i["kind"] == "action"]
        assert len(cards) == 1 and cards[0]["action"]["preview"] == "preview.png"
        assert not [i for i in home["needs_you"] if i["kind"] == "proposal"]
        shot = c.get(f"/api/actions/{aid}/shots/preview.png")
        assert shot.status_code == 200 and shot.headers["content-type"] == "image/png"
        edited = c.patch(f"/api/actions/{aid}", json={"payload": {"subject": "Barcelona!"}}).json()
        assert edited["payload"]["subject"] == "Barcelona!" and edited["preview"] == "preview.png"
        done = c.post(f"/api/actions/{aid}/approve", json={"always": True}).json()
        assert done["state"] == "done" and done["shots"] == {"after": "after.png"}
        intel = c.get("/api/intelligence").json()
        assert len(intel["knowledge"]["permissions"]) == 1
        assert intel["procedures"][0]["name"] == "gmail_draft"
        pid = intel["knowledge"]["permissions"][0]["id"]
        assert c.post(f"/api/permissions/{pid}/revoke").json()["revoked_at"]
        aid2 = t.action_propose("gmail_draft", "Another", PAYLOAD, "deletable")["action"]
        assert c.post(f"/api/actions/{aid2}/decline").json()["state"] == "declined"
        convo = c.get("/api/conversation").json()
        assert {a["state"] for a in convo["actions"]} == {"done", "declined"}
    finally:
        restore()


def test_removing_the_connection_takes_its_procedures_and_pending_actions(world: World) -> None:
    gmail_connected(world)
    with_fake(Driver())
    try:
        t = keep_procedure(world, turn=said(world, "draft"))
        aid = t.action_propose("gmail_draft", "Draft", PAYLOAD, "deletable")["action"]
        world.permissions.grant(sentence="Alpha may make drafts.", procedure="gmail_draft",
                                effect="prepare")
        conn = Connections(world.store).find("browser", "google.com")
        assert conn is not None
        gone = remove_connection(world, conn["id"])
        assert gone["procedures"] == ["gmail_draft"]
        assert world.procedures.names() == []
        assert world.actions.get(aid)["state"] == "declined"
        assert world.permissions.live() == []
    finally:
        restore()


def test_a_card_cannot_be_approved_before_its_preview_exists(world: World) -> None:
    gmail_connected(world)
    with_fake(Driver())
    try:
        t = keep_procedure(world, turn=said(world, "draft"))
        proc = world.procedures.get("gmail_draft")
        pending = world.actions.propose(proc, title="Draft", payload=PAYLOAD, undo="deletable",
                                        evidence=None, module=None, thread=None, turn=None)
        world.actions.previewed(pending["id"], preview=None, note=acting.PREVIEW_PENDING, shots=[])
        with pytest.raises(Problem, match="preview isn't ready"):
            acting.approve(world, pending["id"], "yes")
        assert world.actions.get(pending["id"])["state"] == "proposed"
        c = TestClient(create_app(world, live=False,
                                  runner=lambda req: RunResult(ok=True, reply="")))
        refused = c.post(f"/api/actions/{pending['id']}/approve", json={"always": False})
        assert refused.status_code == 400 and "preview" in refused.json()["error"]
        del t
    finally:
        restore()


def test_an_error_in_the_hand_is_a_failure_never_a_sent(world: World) -> None:
    """17:47 on 2 Oct: the hand threw, and the action was marked Sent with nothing sent."""
    gmail_connected(world)

    class Broken(Driver):
        def __call__(self, job: dict[str, Any], timeout: int) -> dict[str, Any]:
            if job["op"] == "act" and not job["stop_before_last"]:
                raise Problem("The browser couldn't do that: profile in use")
            return super().__call__(job, timeout)

    with_fake(Broken())
    try:
        t = keep_procedure(world, turn=said(world, "send it"), effect="send")
        aid = t.action_propose("gmail_draft", "Email to Sania", PAYLOAD,
                               "cannot be unsent")["action"]
        out = acting.approve(world, aid, "yes", runner=lambda r: RunResult(ok=True, reply=""),
                             repair=False)
        assert out["ok"] is False and "profile in use" in out["why"]
        action = world.actions.get(aid)
        assert action["state"] == "failed" and "profile in use" in action["error"]
        assert not any(e["text"].startswith("Sent") for e in world.journal.recent(20))
        assert world.procedures.get("gmail_draft")["health"] == "broken"
    finally:
        restore()


def test_a_placeholder_anywhere_must_be_a_payload_field() -> None:
    with pytest.raises(Problem, match="not in fields"):
        check_steps([{"click": "a[href*='{slug}']"}, {"click_text": "Send"}], ["message"],
                    effect="send")
    steps, _ = check_steps([{"goto": "https://x.example/in/{slug}/"}, {"click_text": "Message"},
                            {"type": ".box", "value": "{message}"}, {"click_text": "Send"}],
                           ["slug", "message"], effect="send")
    assert steps[0]["goto"].endswith("{slug}/")


def test_a_failed_check_after_the_commit_is_unconfirmed_never_redone(world: World) -> None:
    """21:29 on 2 Oct: the LinkedIn message went out, Alpha's check afterwards failed, the
    repair proposed the same message again. Once the commit ran, it happened."""
    gmail_connected(world)
    driver = Driver()
    driver.verified = False
    with_fake(driver)
    prompts: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        prompts.append(req.sentence)
        return RunResult(ok=True, reply="Fixed the check.")

    try:
        t = keep_procedure(world, turn=said(world, "send it"), effect="send")
        aid = t.action_propose("gmail_draft", "Email to Sania", PAYLOAD,
                               "cannot be unsent")["action"]
        out = acting.approve(world, aid, "yes", runner=runner)
        action = world.actions.get(aid)
        assert out["ok"] and out["unconfirmed"] and action["state"] == "done"
        assert action["result"].startswith("Sent, not confirmed: Email to Sania")
        assert world.procedures.get("gmail_draft")["health"] == "broken"
        assert prompts and "Do NOT propose the action again" in prompts[0]
        assert not [a for a in world.actions.all() if a["id"] != aid]
        done = [e for e in world.journal.recent(10) if e["kind"] == "did"
                and e["data"].get("unconfirmed")]
        assert done and done[-1]["text"].startswith("Sent, not confirmed")
    finally:
        restore()
