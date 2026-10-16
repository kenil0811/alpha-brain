"""The scheduler: what runs in the background while the core is up.

It checks every half minute and starts every agent that is due in its own thread (the hands
take turns on a sign-in profile by themselves, so two runs never open one Chrome profile
twice); a run missed while Alpha was closed happens once on return. It asks every agent whose
kind looks for work whether anything happened since its cursor (the journal is the event
stream, Q50) and runs what it finds. It also starts the build of every workflow page the person
said yes to (§12), continues a build whose run ended before its work did, picks builds up
again after a restart, runs the parts that are due, and performs approved actions the app
missed; each in its own thread so agents never wait for a build. Nothing here has a limit on
how long it may take: the person stops what isn't going anywhere.

The Mac's sleep (found 3 Oct 2026, build-plan §4.22): a sleeping Mac wakes for a couple of
seconds every quarter hour to check mail and the like, and the core runs only in those slices. A
run started in one takes hours, and a page read cut short in one looks like a broken reader. So
the scheduler starts nothing until the Mac has been awake for a minute without a break (the gap
between its own ticks, in wall-clock time, is the evidence), and while anything runs it holds the
Mac awake (`caffeinate -i`: no dozing off mid-run; closing the lid still sleeps).
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import threading
import time
from typing import Any

from alpha.runtime import acting, conversations, workflow_build
from alpha.runtime import parts as parts_module
from alpha.runtime.agents import LOOKS, Work
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.route import run as model_run
from alpha.runtime.turn import Runner
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger("alpha.agents")
CHECK_EVERY_S = 30
SLEPT_GAP_S = 3 * CHECK_EVERY_S  # a tick this late after the last means the Mac was asleep
SETTLED_S = 60  # awake this long without a break before a run starts


def backoff_s(crashes: int) -> float:
    """How long a build waits after its n-th crash in a row: 30 s, 60, 120, … up to 10 min."""
    return float(min(30 * 2 ** (crashes - 1), 600))


class Scheduler:
    """Runs due agents while the core is up, each in its own thread, once the Mac is
    properly awake; `run_now` runs one at once in the background."""

    def __init__(self, world: World, runner: Runner | None = None,
                 clock: Any = time.time) -> None:
        self.world = world
        self.runner: Runner = runner or model_run
        self.lock = threading.Lock()
        self.running: set[str] = set()
        self.building: set[str] = set()
        self.crashes: dict[str, int] = {}  # a building workflow's crashed runs in a row
        self.stop_event = threading.Event()
        self.clock = clock
        self._last_tick: float | None = None
        self._awake_since: float = clock()
        self._slept = False
        self._holding = 0
        self._keeper: subprocess.Popen[bytes] | None = None

    # ---- the Mac's sleep ----

    def settled(self) -> bool:
        """Whether the Mac has been awake long enough for a run to start. Each tick notes the
        wall-clock time; a tick far later than the last means the Mac slept in between (a
        quarter-hour maintenance wake lasts seconds, so ticks there always follow a gap). After
        a gap, runs wait until a minute has passed without another."""
        with self.lock:
            now = self.clock()
            if self._last_tick is not None and now - self._last_tick > SLEPT_GAP_S:
                self._awake_since = now
                self._slept = True
            self._last_tick = now
            return not self._slept or now - self._awake_since >= SETTLED_S

    def _hold(self) -> None:
        """While anything runs, the Mac is kept from dozing off (macOS only)."""
        with self.lock:
            self._holding += 1
            if self._keeper is not None or sys.platform != "darwin":
                return
            caffeinate = shutil.which("caffeinate")
            if not caffeinate:
                return
            try:
                self._keeper = subprocess.Popen(
                    [caffeinate, "-i", "-w", str(os.getpid())],
                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL)
            except OSError:
                log.exception("could not keep the Mac awake")

    def _release(self) -> None:
        with self.lock:
            self._holding = max(0, self._holding - 1)
            if self._holding or self._keeper is None:
                return
            keeper, self._keeper = self._keeper, None
        try:
            keeper.terminate()
        except OSError:
            pass

    # ---- agents ----

    def _claim(self, aid: str) -> bool:
        with self.lock:
            if aid in self.running:
                return False
            self.running.add(aid)
            return True

    def _work(self, aid: str, trigger: str, work: Work | None) -> None:
        self._hold()
        try:
            agent_runner.run(self.world, aid, trigger=trigger, runner=self.runner, work=work)
            if work is not None:
                self.world.agents.advance_cursor(aid, work.upto)
        except Exception:
            log.exception("agent run failed")
        finally:
            self._release()
            with self.lock:
                self.running.discard(aid)

    def _run(self, aid: str, trigger: str = "schedule", work: Work | None = None) -> None:
        """Start one agent in its own thread (nothing if it is already running)."""
        if self._claim(aid):
            threading.Thread(target=self._work, args=(aid, trigger, work), daemon=True,
                             name=f"agent-{aid}").start()

    def looks(self) -> None:
        """Ask every agent whose kind looks for work whether anything happened since its
        cursor (the journal is the event stream), and run what it finds."""
        for agent in self.world.agents.working():
            if self.stop_event.is_set():
                return
            look = LOOKS.get(agent["kind"])
            if look is None or agent["id"] in self.running:
                continue
            try:
                work = look(self.world, agent)
            except Exception:
                log.exception("%s looking for work", agent["name"])
                continue
            if work is None:
                continue
            if not work.about:
                # Nothing to do in what it looked at: the cursor moves without a run.
                self.world.agents.advance_cursor(agent["id"], work.upto)
                continue
            self._run(agent["id"], "event", work)

    def builds(self) -> None:
        """Start or continue every agreed workflow's build."""
        for wf in self.world.workflows.waiting():
            if self.stop_event.is_set():
                return
            with self.lock:
                if wf["id"] in self.building:
                    continue
                self.building.add(wf["id"])
            threading.Thread(target=self._build_workflow, args=(wf["id"],), daemon=True,
                             name=f"workflow-{wf['id']}").start()

    def _build_workflow(self, wid: str) -> None:
        self._hold()
        crashed = False
        try:
            workflow_build.run(self.world, wid, runner=self.runner)
        except Exception:
            crashed = True
            log.exception("workflow build failed")
        finally:
            self._release()
            with self.lock:
                self.building.discard(wid)
        wf = self.world.workflows.get(wid)
        if wf["state"] != "building" or self.stop_event.is_set():
            self.crashes.pop(wid, None)
            return
        if crashed:
            n = self.crashes.get(wid, 0) + 1
            self.crashes[wid] = n
            if self.stop_event.wait(backoff_s(n)):
                return
        else:
            self.crashes.pop(wid, None)
        self.builds()

    def parts(self) -> None:
        """Run every part that is due on every row (a row that arrived, a part after another)."""
        try:
            parts_module.run_due(self.world)
        except Exception:
            log.exception("parts due")

    def kick(self) -> None:
        """What a turn starts at once rather than at the next tick: a workflow agreed in it,
        a row that arrived, an agent whose kind looks at what the turn left in the journal."""
        self.builds()
        self.parts()
        self.looks()

    def acts(self) -> None:
        """Perform every action the person approved that hasn't run (the app was closed in
        between, say). The approval route runs them at once; this is the catch-up."""
        for action in self.world.actions.all(("approved",)):
            if self.stop_event.is_set():
                return
            self._hold()
            try:
                acting.perform(self.world, action["id"], runner=self.runner)
            except Exception:
                log.exception("action %s failed", action["id"])
            finally:
                self._release()

    def tick(self) -> None:
        settled = self.settled()
        try:
            conversations.close_idle(self.world)
        except Exception:
            log.exception("closing quiet conversations")
        if not settled:
            # Just woke, or only in a maintenance wake: nothing starts yet.
            return
        self.builds()
        self.parts()
        self.acts()
        for agent in self.world.agents.due():
            if self.stop_event.is_set():
                return
            self._run(agent["id"])
        self.looks()

    def run_now(self, aid: str) -> None:
        self.world.agents.get(aid)  # a Problem if it doesn't exist
        if not self._claim(aid):
            raise Problem("It's already running.")
        threading.Thread(target=self._work, args=(aid, "now", None), daemon=True,
                         name=f"agent-{aid}").start()

    def start(self) -> None:
        def loop() -> None:
            while not self.stop_event.wait(CHECK_EVERY_S):
                try:
                    self.tick()
                except Exception:
                    log.exception("scheduler tick failed")

        threading.Thread(target=loop, daemon=True, name="scheduler").start()
        # Catch up once on start: anything that came due while Alpha was closed.
        threading.Thread(target=self.tick, daemon=True, name="scheduler-catch-up").start()

    def stop(self) -> None:
        self.stop_event.set()
        self._release_all()

    def _release_all(self) -> None:
        with self.lock:
            keeper, self._keeper, self._holding = self._keeper, None, 0
        if keeper is not None:
            try:
                keeper.terminate()
            except OSError:
                pass
