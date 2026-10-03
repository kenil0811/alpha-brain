/**
 * The companion's rig: the painted parts (`art/panda/`, Bridge's art with permission) composed
 * on the artist's 3840-unit canvas, with the chosen animal's ears, eyes, nose, whiskers and
 * muzzle drawn over the same body, the fur and the wardrobe tinted, and the face set by a
 * mood.
 *
 * The moods are Bridge's emotion vocabulary, rebuilt as a table of poses (`POSES`): each mood
 * picks a painted mouth, sets how open the eyes are, where the brows sit (raised, furrowed,
 * sorry), the head's tilt and drop, the ears' perk, the cheeks' blush, the gaze, the body's
 * squash or stretch, and how often it blinks and breathes. Bridge springs these every frame
 * under a director; here a mood change eases by CSS transitions, the breath, the blinks and
 * the nod are CSS animations, the pupils drift on a timer (saccades), and a happy or
 * celebrating mood hops once. It is still when the window is hidden, when the Mac asks for
 * reduced motion, and after a while with nothing happening.
 */
import { useEffect, useId, useState } from "react";
import arm from "./art/panda/arm.webp";
import brow from "./art/panda/brow.webp";
import ear from "./art/panda/ear.webp";
import eye from "./art/panda/eye.webp";
import mouthDefault from "./art/panda/mouth-default.webp";
import mouthExcited from "./art/panda/mouth-excited.webp";
import mouthHappy from "./art/panda/mouth-happy.webp";
import mouthOpen from "./art/panda/mouth-open.webp";
import mouthSmile from "./art/panda/mouth-smile.webp";
import mouthTalking from "./art/panda/mouth-talking.webp";
import patch from "./art/panda/patch.webp";
import pupil from "./art/panda/pupil.webp";
import shell from "./art/panda/shell.webp";
import shirt from "./art/panda/shirt.webp";
import snout from "./art/panda/snout.webp";
import suit from "./art/panda/suit.webp";
import tie from "./art/panda/tie.webp";
import { animalOf, furOf, shade, type Look } from "./looks";

/** What the companion feels or does; `talking` is the mouth moving over whatever it feels. */
export type Mood = "idle" | "curious" | "listening" | "thinking" | "talking" | "happy" | "proud" | "unsure" | "concerned" | "comforting" | "celebrating" | "sleepy";

/** Where each painted part sits on the canvas, [x, y, width, height]: the artist's registration. */
const BOX = {
  shell: [521, 251, 2489, 3314],
  shirt: [394, 1206, 2616, 2359],
  tie: [1603, 1667, 295, 1001],
  suit: [512, 1198, 2511, 2376],
  ear: [740, 292, 792, 740],
  patch: [1130, 871, 333, 317],
  eye: [1132, 878, 324, 309],
  pupil: [1148, 880, 305, 290],
  brow: [1205.2, 722.8, 216.7, 95.9],
  browR: [2061.4, 723, 211, 93.4],
  snout: [1591.8, 994, 350, 234],
  arm: [338.5, 1896.7, 1280.4, 1247.5],
} as const;
const MOUTH = {
  default: [1578.9, 1254.9, 374.6, 96.5],
  smile: [1664.5, 1255, 203.1, 78.8],
  excited: [1591.3, 1255, 349.5, 292.6],
  happy: [1607.6, 1255, 316.7, 219.5],
  talking: [1669.6, 1255, 192.9, 294.4],
  open: [1606.2, 1255, 319.7, 268.1],
} as const;
const MOUTH_ART = { default: mouthDefault, smile: mouthSmile, excited: mouthExcited, happy: mouthHappy, talking: mouthTalking, open: mouthOpen } as const;
type MouthName = keyof typeof MOUTH;

/** The face's axis of symmetry on the canvas: the right eye, patch and ear are the left ones mirrored here. */
const AXIS = 1768.5;
const EYE = { x: BOX.eye[0] + BOX.eye[2] / 2, y: BOX.eye[1] + BOX.eye[3] / 2 };
const NOSE = { x: AXIS, y: 1118 };
const LIP = { x: AXIS, y: 1255 };
const BROW_L = { x: BOX.brow[0] + BOX.brow[2] / 2, y: BOX.brow[1] + BOX.brow[3] / 2 };
const BROW_R = { x: BOX.browR[0] + BOX.browR[2] / 2, y: BOX.browR[1] + BOX.browR[3] / 2 };
/** Head and shoulders: the bust the companion shows. */
const VIEW = { x: 420, y: 180, w: 2700, h: 2250 };
const TALK = ["talking", "open", "default", "open"] as const;

const mirror = `translate(${2 * AXIS} 0) scale(-1 1)`;

export interface Pose {
  /** 1 open as painted; below 1 the lids come down, above 1 the eyes go wide. */
  eyeOpen: number;
  pupilScale: number;
  /** 0..1: the brows go up. */
  browRaise: number;
  /** 0..1: the inner ends come down and in (focus). */
  browFurrow: number;
  /** 0..1: the inner ends go up (worry). */
  browSorrow: number;
  /** Degrees, positive to the person's left. */
  headTilt: number;
  /** Canvas units the head settles down by. */
  headDrop: number;
  /** Degrees the ears perk up (negative: back and down). */
  earPerk: number;
  earScale: number;
  mouth: MouthName;
  mouthScale: number;
  /** 0..1 blush. */
  cheeks: number;
  /** Where the eyes look, in canvas units from straight ahead. */
  gazeX: number;
  gazeY: number;
  /** -1 stretched tall .. 0 .. 1 squashed wide. */
  squash: number;
  /** 0..1 the whiskers hang. */
  whiskerDroop: number;
  /** Seconds between blinks, and how long a blink takes relative to normal. */
  blinkEvery: number;
  blinkSpeed: number;
  /** Seconds per breath. */
  breath: number;
  /** 0..1 how far the pupils wander between looks. */
  saccade: number;
  nod: boolean;
}

const CALM: Pose = {
  eyeOpen: 1, pupilScale: 1, browRaise: 0, browFurrow: 0, browSorrow: 0, headTilt: 0, headDrop: 0, earPerk: 0, earScale: 1,
  mouth: "smile", mouthScale: 1, cheeks: 0.25, gazeX: 0, gazeY: 0, squash: 0, whiskerDroop: 0.1, blinkEvery: 4.2, blinkSpeed: 1, breath: 3.6, saccade: 0.5, nod: false,
};

/** Each mood as a delta on calm (the idea and most of the numbers are Bridge's; the mouths are the painted ones). */
export const POSES: Record<Mood, Pose> = {
  idle: CALM,
  // lips part on the unspoken question, eyes wide, head cocked
  curious: { ...CALM, eyeOpen: 1.12, pupilScale: 1.18, browRaise: 0.75, headTilt: 9, earPerk: 8, earScale: 1.08, mouth: "open", mouthScale: 0.45, squash: -0.14, cheeks: 0.35, blinkEvery: 7, saccade: 0.25, breath: 3.3 },
  // ears grow: the feature doing the work grows; everything else holds still and nods
  listening: { ...CALM, eyeOpen: 0.98, earPerk: 12, earScale: 1.28, mouth: "default", mouthScale: 0.9, headTilt: 3, browRaise: 0.25, squash: -0.06, blinkEvery: 5, saccade: 0.15, breath: 4, nod: true },
  // small and shut: the mouth gets out of the way while the brow works; the eyes go up and aside
  thinking: { ...CALM, eyeOpen: 0.78, browRaise: 0.2, browFurrow: 0.6, headTilt: -6, mouth: "smile", mouthScale: 0.78, squash: 0.08, gazeX: 50, gazeY: -48, earPerk: 2, blinkEvery: 5.5, saccade: 0.3, breath: 5 },
  talking: { ...CALM, browRaise: 0.15, mouth: "talking", blinkEvery: 4.5 },
  // greeting-warm: squinting eyes, the big smile, blush, a hop on arrival
  happy: { ...CALM, eyeOpen: 0.66, mouth: "happy", mouthScale: 1.05, squash: -0.16, cheeks: 0.9, earPerk: 4, browRaise: 0.4, blinkEvery: 4.5, breath: 3.2 },
  // chest up, drawn tall
  proud: { ...CALM, eyeOpen: 0.75, mouth: "happy", mouthScale: 0.95, squash: -0.3, headTilt: -2, cheeks: 0.55, earPerk: 6, browRaise: 0.3, blinkEvery: 5, breath: 4.4 },
  // the classic nervous tell: worried brows, eyes away, ears back, blinking often
  unsure: { ...CALM, eyeOpen: 0.8, browSorrow: 0.7, headTilt: -5, headDrop: 40, mouth: "default", mouthScale: 0.88, squash: 0.14, earPerk: -7, gazeX: -55, cheeks: 0.5, blinkEvery: 2.6, saccade: 0.7, breath: 3 },
  concerned: { ...CALM, eyeOpen: 0.92, browSorrow: 1, squash: 0.1, mouth: "default", cheeks: 0.15, earPerk: -4, whiskerDroop: 0.5, blinkEvery: 4, saccade: 0.2, breath: 3.7 },
  // soft eyes, a slow breath, a slight tilt toward the person
  comforting: { ...CALM, eyeOpen: 0.6, squash: 0.1, cheeks: 0.6, headTilt: 4, earPerk: -2, browSorrow: 0.25, mouth: "smile", blinkEvery: 6, blinkSpeed: 0.45, breath: 6.5, nod: true },
  // held, not a blip: wide eyes, the excited mouth, brows up, ears up, stretched tall
  celebrating: { ...CALM, eyeOpen: 1.08, mouth: "excited", mouthScale: 0.92, squash: -0.34, cheeks: 1, earPerk: 12, earScale: 1.1, browRaise: 0.9, blinkEvery: 5, saccade: 0.3, breath: 2.4 },
  // slack jaw, and the whole body settles into itself under its own weight
  sleepy: { ...CALM, eyeOpen: 0.3, mouth: "open", mouthScale: 0.4, squash: 0.3, earPerk: -12, earScale: 0.94, headTilt: 5, headDrop: 50, whiskerDroop: 0.8, cheeks: 0.35, browRaise: -0.3, blinkEvery: 3, blinkSpeed: 0.3, breath: 8, saccade: 0.1 },
};

function Part({ href, box, filter, transform }: { href: string; box: readonly number[]; filter?: string; transform?: string }) {
  return <image href={href} x={box[0]} y={box[1]} width={box[2]} height={box[3]} filter={filter} transform={transform} />;
}

/** A duotone: the painted part's shading kept, its colour swapped for a dark and a light end of `color`. */
function Tint({ id, color, lo = -0.42, hi = 0.1 }: { id: string; color: string; lo?: number; hi?: number }) {
  const dark = shade(color, lo);
  const light = shade(color, hi);
  const table = (i: number) => `${parseInt(dark.slice(i, i + 2), 16) / 255} ${parseInt(light.slice(i, i + 2), 16) / 255}`;
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={table(1)} />
        <feFuncG type="table" tableValues={table(3)} />
        <feFuncB type="table" tableValues={table(5)} />
      </feComponentTransfer>
    </filter>
  );
}

/** One drawn ear on the left, in the fur with the inner colour; the right is its mirror. */
function DrawnEar({ kind, size, fur, inner }: { kind: "point" | "tall" | "bud" | "drop"; size: number; fur: string; inner: string }) {
  const base = { x: 1210, y: 900 };
  const s = size;
  if (kind === "point") {
    return (
      <g transform={`translate(${base.x} ${base.y}) rotate(-22) scale(${s})`}>
        <path d="M -230 120 Q -40 -520 230 60 Q 60 170 -230 120 Z" fill={fur} />
        <path d="M -120 70 Q -20 -300 130 50 Q 20 110 -120 70 Z" fill={inner} />
      </g>
    );
  }
  if (kind === "tall") {
    return (
      <g transform={`translate(${base.x} ${base.y}) rotate(-14) scale(${s})`}>
        <ellipse cx="0" cy="-330" rx="165" ry="520" fill={fur} />
        <ellipse cx="0" cy="-330" rx="85" ry="400" fill={inner} />
      </g>
    );
  }
  if (kind === "drop") {
    return (
      <g transform={`translate(${base.x - 120} ${base.y + 120}) rotate(18) scale(${s})`}>
        <ellipse cx="0" cy="200" rx="170" ry="330" fill={fur} />
        <ellipse cx="0" cy="230" rx="90" ry="240" fill={inner} />
      </g>
    );
  }
  return (
    <g transform={`translate(${base.x} ${base.y - 60}) scale(${s})`}>
      <circle cx="0" cy="0" r="235" fill={fur} />
      <circle cx="0" cy="10" r="140" fill={inner} />
    </g>
  );
}

function Nose({ kind, color }: { kind: "tri" | "oval"; color: string }) {
  return kind === "tri" ? (
    <path d={`M ${NOSE.x - 95} ${NOSE.y - 40} Q ${NOSE.x} ${NOSE.y - 90} ${NOSE.x + 95} ${NOSE.y - 40} Q ${NOSE.x + 60} ${NOSE.y + 90} ${NOSE.x} ${NOSE.y + 110} Q ${NOSE.x - 60} ${NOSE.y + 90} ${NOSE.x - 95} ${NOSE.y - 40} Z`} fill={color} />
  ) : (
    <ellipse cx={NOSE.x} cy={NOSE.y + 10} rx="105" ry="78" fill={color} />
  );
}

function Bow({ color }: { color: string }) {
  const x = AXIS;
  const y = 1720;
  return (
    <g>
      <path d={`M ${x} ${y} L ${x - 230} ${y - 110} Q ${x - 290} ${y} ${x - 230} ${y + 110} Z`} fill={color} />
      <path d={`M ${x} ${y} L ${x + 230} ${y - 110} Q ${x + 290} ${y} ${x + 230} ${y + 110} Z`} fill={color} />
      <rect x={x - 48} y={y - 48} width="96" height="96" rx="22" fill={shade(color, -0.35)} />
    </g>
  );
}

function Glasses() {
  const r = 215;
  const rx = 2 * AXIS - EYE.x;
  return (
    <g fill="none" stroke="#2a2b31" strokeWidth="26" strokeLinecap="round" data-part="glasses">
      <circle cx={EYE.x} cy={EYE.y + 8} r={r} />
      <circle cx={rx} cy={EYE.y + 8} r={r} />
      <path d={`M ${EYE.x + r} ${EYE.y - 20} Q ${AXIS} ${EYE.y - 80} ${rx - r} ${EYE.y - 20}`} />
      <path d={`M ${EYE.x - r} ${EYE.y - 10} L ${EYE.x - r - 170} ${EYE.y - 70}`} />
      <path d={`M ${rx + r} ${EYE.y - 10} L ${rx + r + 170} ${EYE.y - 70}`} />
    </g>
  );
}

/** The document is visible: timers and animations run; hidden, the companion is still. */
function useVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

/** The Mac asks for reduced motion: no drift, no breath, no hop (CSS handles the rest). */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const brows = (pose: Pose) => {
  const raise = -60 * pose.browRaise;
  const furrow = 16 * pose.browFurrow;
  const sorrow = 16 * pose.browSorrow;
  const inward = 28 * pose.browFurrow;
  return {
    left: `translate(${inward} ${raise}) rotate(${furrow - sorrow} ${BROW_L.x} ${BROW_L.y})`,
    right: `translate(${-inward} ${raise}) rotate(${-furrow + sorrow} ${BROW_R.x} ${BROW_R.y})`,
  };
};

export function Rig({ look, mood, size = 96, className }: { look: Look; mood: Mood; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const animal = animalOf(look.animal);
  const fur = furOf(look);
  const visible = useVisible();
  const reduced = useReducedMotion();
  const pose = POSES[mood];
  const [talk, setTalk] = useState(0);
  const [rested, setRested] = useState(false);
  const [drift, setDrift] = useState({ x: 0, y: 0 });
  const [hop, setHop] = useState(false);

  // The mouth moves while Alpha talks and the window is in view; otherwise it holds.
  useEffect(() => {
    if (mood !== "talking" || !visible) return;
    const timer = setInterval(() => setTalk((n) => n + 1), 170);
    return () => clearInterval(timer);
  }, [mood, visible]);
  // After a while with nothing happening the breath stops too.
  useEffect(() => {
    setRested(false);
    if (mood !== "idle" && mood !== "sleepy") return;
    const timer = setTimeout(() => setRested(true), 90_000);
    return () => clearTimeout(timer);
  }, [mood]);
  // Saccades: the eyes wander a little between looks, as far as the mood lets them.
  useEffect(() => {
    if (!visible || reduced || rested || pose.saccade === 0) {
      setDrift({ x: 0, y: 0 });
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const look = () => {
      const amp = 36 * pose.saccade;
      setDrift({ x: (Math.random() * 2 - 1) * amp, y: (Math.random() * 2 - 1) * amp * 0.6 });
      timer = setTimeout(look, 1800 + Math.random() * 3200);
    };
    timer = setTimeout(look, 600);
    return () => clearTimeout(timer);
  }, [visible, reduced, rested, pose.saccade]);
  // Joy has a gesture: a hop when the mood arrives (the class goes again so the next one plays).
  useEffect(() => {
    if ((mood !== "happy" && mood !== "celebrating") || reduced) return;
    setHop(true);
    const timer = setTimeout(() => setHop(false), 750);
    return () => clearTimeout(timer);
  }, [mood, reduced]);

  const mouth: MouthName = mood === "talking" ? TALK[talk % TALK.length] : pose.mouth;
  const still = !visible || rested || reduced;
  const state = { idle: "here", curious: "curious", listening: "listening", thinking: "thinking", talking: "talking", happy: "happy", proud: "proud", unsure: "unsure", concerned: "concerned", comforting: "here for you", celebrating: "celebrating", sleepy: "sleepy" }[mood];
  const tints = {
    fur: fur ? `url(#${id}-fur)` : undefined,
    suit: `url(#${id}-suit)`,
    shirt: `url(#${id}-shirt)`,
    tie: `url(#${id}-tie)`,
  };
  const rightEye = `translate(${2 * AXIS} 0) scale(-1 1)`;
  const brow2 = brows(pose);
  // The painted panda caps lift; a drawn ear turns on its base. Both grow with the mood.
  const earStyle = animal.ears === "cap"
    ? { transform: `translateY(${-pose.earPerk * 3}px) scale(${pose.earScale})`, transformOrigin: "1136px 1032px" }
    : { transform: `rotate(${-pose.earPerk}deg) scale(${pose.earScale})`, transformOrigin: "1210px 900px" };
  const mouthBox = MOUTH[mouth];
  const mouthScale = mood === "talking" ? 1 : pose.mouthScale;

  return (
    <svg
      className={`rig rig--${mood}${still ? " rig--still" : ""}${pose.nod && !still ? " rig--nod" : ""}${className ? ` ${className}` : ""}`}
      width={Math.round(size * (VIEW.w / VIEW.h))}
      height={size}
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-label={`Alpha, a ${animal.name.toLowerCase()}, is ${state}`}
      data-animal={animal.id}
      data-mood={mood}
      style={{ "--blink-every": `${pose.blinkEvery}s`, "--blink-speed": `${pose.blinkSpeed}`, "--breath": `${pose.breath}s` } as React.CSSProperties}
    >
      <defs>
        {fur ? <Tint id={`${id}-fur`} color={fur} lo={-0.3} hi={0.08} /> : null}
        <Tint id={`${id}-suit`} color={look.suit} />
        <Tint id={`${id}-shirt`} color={look.shirt} lo={-0.3} hi={0.12} />
        <Tint id={`${id}-tie`} color={look.tie} />
      </defs>
      <g className={`rig__body${hop ? " rig__body--hop" : ""}`} style={{ transform: `scale(${1 + 0.07 * pose.squash}, ${1 - 0.07 * pose.squash})` }}>
        <g className="rig__head" style={{ transform: `rotate(${pose.headTilt}deg) translateY(${pose.headDrop}px)` }}>
          <g className="rig__ears">
            <g className="rig__ear" style={earStyle}>
              {animal.ears === "cap" ? <Part href={ear} box={BOX.ear} /> : <DrawnEar kind={animal.ears} size={animal.earSize} fur={fur ?? "#f0e4cf"} inner={animal.earInner} />}
            </g>
            <g transform={mirror}>
              <g className="rig__ear" style={earStyle}>
                {animal.ears === "cap" ? <Part href={ear} box={BOX.ear} /> : <DrawnEar kind={animal.ears} size={animal.earSize} fur={fur ?? "#f0e4cf"} inner={animal.earInner} />}
              </g>
            </g>
          </g>
          <Part href={shell} box={BOX.shell} filter={tints.fur} />
          <g className="rig__face">
            {animal.id === "panda" ? (
              <>
                <Part href={patch} box={BOX.patch} />
                <Part href={patch} box={BOX.patch} transform={mirror} />
              </>
            ) : null}
            {animal.muzzle ? <ellipse cx={AXIS} cy={NOSE.y + 120} rx="330" ry="235" fill="#ffffff" opacity="0.32" /> : null}
            <g className="rig__cheeks" style={{ opacity: 0.55 * pose.cheeks }} fill="#e8899b">
              <ellipse cx={EYE.x - 60} cy={EYE.y + 250} rx="150" ry="90" />
              <ellipse cx={2 * AXIS - EYE.x + 60} cy={EYE.y + 250} rx="150" ry="90" />
            </g>
            <g className="rig__brows">
              <g className="rig__brow" transform={brow2.left}>
                <Part href={brow} box={BOX.brow} />
              </g>
              <g className="rig__brow" transform={brow2.right}>
                <image href={brow} x={BOX.browR[0]} y={BOX.browR[1]} width={BOX.browR[2]} height={BOX.browR[3]} transform={`translate(${2 * BOX.browR[0] + BOX.browR[2]} 0) scale(-1 1)`} />
              </g>
            </g>
            <g className="rig__lids" style={{ transform: `scaleY(${pose.eyeOpen})` }}>
              <g className="rig__eyes">
                {animal.eyes === "white" ? (
                  <>
                    <ellipse cx={EYE.x} cy={EYE.y} rx="170" ry="166" fill="#ffffff" />
                    <ellipse cx={2 * AXIS - EYE.x} cy={EYE.y} rx="170" ry="166" fill="#ffffff" />
                  </>
                ) : (
                  <>
                    <Part href={eye} box={BOX.eye} />
                    <Part href={eye} box={BOX.eye} transform={rightEye} />
                  </>
                )}
                <g className="rig__pupils" style={{ transform: `translate(${pose.gazeX + drift.x}px, ${pose.gazeY + drift.y}px) scale(${pose.pupilScale})` }}>
                  {animal.eyes === "white" ? (
                    <>
                      <image href={pupil} x={EYE.x - 110} y={EYE.y - 104} width="220" height="209" />
                      <image href={pupil} x={2 * AXIS - EYE.x - 110} y={EYE.y - 104} width="220" height="209" />
                    </>
                  ) : (
                    <>
                      <Part href={pupil} box={BOX.pupil} />
                      <Part href={pupil} box={BOX.pupil} transform={rightEye} />
                    </>
                  )}
                </g>
              </g>
            </g>
            {look.glasses ? <Glasses /> : null}
            {animal.nose === "painted" ? <Part href={snout} box={BOX.snout} /> : <Nose kind={animal.nose} color={animal.noseColor} />}
            <g className="rig__mouth" transform={`translate(${LIP.x} ${LIP.y}) scale(${mouthScale}) translate(${-LIP.x} ${-LIP.y})`}>
              <Part href={MOUTH_ART[mouth]} box={mouthBox} />
            </g>
            {animal.whiskers ? (
              <g className="rig__whiskers" stroke="#3a3238" strokeWidth="14" strokeLinecap="round" opacity="0.55">
                <g style={{ transform: `rotate(${10 * pose.whiskerDroop}deg)`, transformOrigin: `${AXIS - 420}px ${NOSE.y + 60}px` }}>
                  <path d={`M ${AXIS - 420} ${NOSE.y + 20} L ${AXIS - 760} ${NOSE.y - 60}`} />
                  <path d={`M ${AXIS - 430} ${NOSE.y + 110} L ${AXIS - 780} ${NOSE.y + 120}`} />
                </g>
                <g style={{ transform: `rotate(${-10 * pose.whiskerDroop}deg)`, transformOrigin: `${AXIS + 420}px ${NOSE.y + 60}px` }}>
                  <path d={`M ${AXIS + 420} ${NOSE.y + 20} L ${AXIS + 760} ${NOSE.y - 60}`} />
                  <path d={`M ${AXIS + 430} ${NOSE.y + 110} L ${AXIS + 780} ${NOSE.y + 120}`} />
                </g>
              </g>
            ) : null}
          </g>
        </g>
        <Part href={shirt} box={BOX.shirt} filter={tints.shirt} />
        {look.neckwear === "tie" ? <Part href={tie} box={BOX.tie} filter={tints.tie} /> : look.neckwear === "bow" ? <Bow color={look.tie} /> : null}
        <Part href={suit} box={BOX.suit} filter={tints.suit} />
        <Part href={arm} box={BOX.arm} filter={tints.fur} />
        <Part href={arm} box={BOX.arm} filter={tints.fur} transform={mirror} />
      </g>
    </svg>
  );
}
