/**
 * Alpha's character: Bridge's Zazoo companion rig, ported wholesale from
 * platform/apps/web/src/app/avatar/zazoo/ (director + full painted-panda avatar). Same rig
 * Bridge's own desktop companion uses — breathing, blinking, saccades, mood-driven pose and
 * a `setTalking` mouth-flap while Alpha speaks — with one still frame under reduced motion
 * (CompanionZazooFace). Its eyes follow the pointer while it is over the window.
 *
 * `state` is what Alpha is really doing (pr1's avatar state, derived in AvatarWindow), performed
 * by the rig (pr1's PERFORMANCE map); a moment's mood (listening, talking, sorry) overrides it,
 * and `done` changes when work lands without a problem: a short happy beat.
 */
import { useEffect, useMemo, useRef } from "react";
import { CompanionZazooFace } from "./zazoo/CompanionZazooFace";
import { ZazooDirector, type ZazooEmotion, type ZazooPerformance } from "./zazoo/director";

export type Mood = "idle" | "listening" | "thinking" | "talking" | "sorry";
export type AvatarState = "disconnected" | "error" | "awaiting" | "building" | "thinking" | "working" | "idle";

const EMOTION: Record<Mood, ZazooEmotion> = {
  idle: "calm",
  listening: "listening",
  thinking: "thinking",
  talking: "happy",
  sorry: "concerned",
};

/** How each state is performed (pr1 avatar/state.ts, from Bridge's status-performance map). */
export const PERFORMANCE: Record<AvatarState, ZazooPerformance> = {
  idle: { emotion: "calm", action: "idle", warmth: 0.7, confidence: 0.7, energy: 0.35, attention: "cursor" },
  thinking: { emotion: "thinking", action: "idle", energy: 0.4, confidence: 0.6, attention: "away" },
  building: { emotion: "curious", action: "idle", energy: 0.6, attention: "away" },
  working: { emotion: "curious", action: "idle", energy: 0.5, attention: "away" },
  awaiting: { emotion: "unsure", action: "idle", warmth: 0.95, confidence: 0.45, energy: 0.3, attention: "user" },
  error: { emotion: "concerned", action: "idle", confidence: 0.4, energy: 0.3, attention: "user" },
  disconnected: { emotion: "sleepy", action: "idle", energy: 0.15, warmth: 0.6, attention: "user" },
};

/** One-shot when work lands without a problem: a little hop (anticipation, squash and
 *  stretch), then back to the state's own pose. */
export const DONE_PERFORMANCE: ZazooPerformance = { emotion: "celebrating", warmth: 0.9, energy: 0.6, duration: 2.2 };

export function Character({ mood, state = "idle", done = 0, size = 96 }: { mood: Mood; state?: AvatarState; done?: number; size?: number }) {
  const director = useMemo(() => new ZazooDirector(), []);
  const box = useRef<HTMLSpanElement>(null);
  // Where it looks when the pointer isn't over the window; while it is, it watches the pointer.
  const rest = useRef<ZazooPerformance["attention"]>("cursor");
  const pointerIn = useRef(false);
  useEffect(() => {
    // A moment's mood wins over the standing state; idle hands the pose back to the state.
    const p: ZazooPerformance = mood === "idle" ? PERFORMANCE[state] : { emotion: EMOTION[mood], attention: "user" };
    rest.current = p.attention;
    director.perform(pointerIn.current ? { ...p, attention: "cursor" } : p);
    director.setTalking(mood === "talking");
  }, [director, mood, state]);
  // Eyes follow the pointer while it is over the window (the rig's head follows on a lag);
  // outside the window the host doesn't say where it is, so the gaze goes back to its own.
  useEffect(() => {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const move = (e: PointerEvent) => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      // A full look at about 1.5 character widths from its face.
      const reach = r.width * 1.5;
      director.setCursor({ x: clamp((e.clientX - (r.left + r.width / 2)) / reach), y: clamp((e.clientY - (r.top + r.height * 0.35)) / reach) });
      if (!pointerIn.current) director.perform({ attention: "cursor" });
      pointerIn.current = true;
    };
    const leave = () => {
      pointerIn.current = false;
      director.setCursor(null);
      director.perform({ attention: rest.current });
    };
    window.addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, [director]);
  const lastDone = useRef(done);
  useEffect(() => {
    if (done === lastDone.current) return;
    lastDone.current = done;
    director.perform(DONE_PERFORMANCE);
  }, [director, done]);
  const label = mood !== "idle" ? mood : state === "idle" ? "here" : state;
  return (
    <span ref={box} className="avatar__character">
      <CompanionZazooFace director={director} size={size} label={`Alpha is ${label}`} crop={false} />
    </span>
  );
}
