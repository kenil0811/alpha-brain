/**
 * Alpha's character: Bridge's Zazoo companion rig, ported wholesale from
 * platform/apps/web/src/app/avatar/zazoo/ (director + full painted-panda avatar). Same rig
 * Bridge's own desktop companion uses — breathing, blinking, saccades, mood-driven pose and
 * a `setTalking` mouth-flap while Alpha speaks — with the built-in prefers-reduced-motion
 * fallback to a static head (CompanionZazooFace -> ZazooCompact).
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

/** One-shot when work lands without a problem: auto-reverts to the state's own pose. */
export const DONE_PERFORMANCE: ZazooPerformance = { emotion: "happy", warmth: 0.9, energy: 0.6, duration: 2.5 };

export function Character({ mood, state = "idle", done = 0, size = 96 }: { mood: Mood; state?: AvatarState; done?: number; size?: number }) {
  const director = useMemo(() => new ZazooDirector(), []);
  useEffect(() => {
    // A moment's mood wins over the standing state; idle hands the pose back to the state.
    if (mood === "idle") director.perform(PERFORMANCE[state]);
    else director.perform({ emotion: EMOTION[mood], attention: "user" });
    director.setTalking(mood === "talking");
  }, [director, mood, state]);
  const lastDone = useRef(done);
  useEffect(() => {
    if (done === lastDone.current) return;
    lastDone.current = done;
    director.perform(DONE_PERFORMANCE);
  }, [director, done]);
  const label = mood !== "idle" ? mood : state === "idle" ? "here" : state;
  return <CompanionZazooFace director={director} size={size} label={`Alpha is ${label}`} crop={false} />;
}
