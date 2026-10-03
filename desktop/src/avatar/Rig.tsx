/**
 * The companion's rig: the painted parts (`art/panda/`, Bridge's art with permission) composed
 * on the artist's 3840-unit canvas, with the chosen animal's ears, eyes, nose, whiskers and
 * muzzle drawn over the same body, the fur and the wardrobe tinted, and the face set by what
 * Alpha is doing (`Mood`). Our own code: Bridge's rig morphs traced mouth shapes under a
 * spring director; this one picks a painted mouth per mood, blinks and breathes with CSS, and
 * cycles the mouth while talking. It is still when the window is hidden, when the Mac asks for
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

export type Mood = "idle" | "listening" | "thinking" | "talking" | "sorry";

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
/** Head and shoulders: the bust the companion shows. */
const VIEW = { x: 420, y: 180, w: 2700, h: 2250 };
const TALK = ["talking", "open", "default", "open"] as const;

const mirror = `translate(${2 * AXIS} 0) scale(-1 1)`;

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

function Ears({ kind, size, fur, inner }: { kind: "point" | "tall" | "bud" | "drop"; size: number; fur: string; inner: string }) {
  // One ear on the left, mirrored for the right; drawn in the fur with the inner colour.
  const base = { x: 1210, y: 900 };
  const s = size;
  const one =
    kind === "point" ? (
      <g transform={`translate(${base.x} ${base.y}) rotate(-22) scale(${s})`}>
        <path d="M -230 120 Q -40 -520 230 60 Q 60 170 -230 120 Z" fill={fur} />
        <path d="M -120 70 Q -20 -300 130 50 Q 20 110 -120 70 Z" fill={inner} />
      </g>
    ) : kind === "tall" ? (
      <g transform={`translate(${base.x} ${base.y}) rotate(-14) scale(${s})`}>
        <ellipse cx="0" cy="-330" rx="165" ry="520" fill={fur} />
        <ellipse cx="0" cy="-330" rx="85" ry="400" fill={inner} />
      </g>
    ) : kind === "drop" ? (
      <g transform={`translate(${base.x - 120} ${base.y + 120}) rotate(18) scale(${s})`}>
        <ellipse cx="0" cy="200" rx="170" ry="330" fill={fur} />
        <ellipse cx="0" cy="230" rx="90" ry="240" fill={inner} />
      </g>
    ) : (
      <g transform={`translate(${base.x} ${base.y - 60}) scale(${s})`}>
        <circle cx="0" cy="0" r="235" fill={fur} />
        <circle cx="0" cy="10" r="140" fill={inner} />
      </g>
    );
  return (
    <>
      {one}
      <g transform={mirror}>{one}</g>
    </>
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
    <g fill="none" stroke="#2a2b31" strokeWidth="26" strokeLinecap="round">
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

export function Rig({ look, mood, size = 96, className }: { look: Look; mood: Mood; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const animal = animalOf(look.animal);
  const fur = furOf(look);
  const visible = useVisible();
  const [talk, setTalk] = useState(0);
  const [rested, setRested] = useState(false);

  // The mouth moves while Alpha talks and the window is in view; otherwise it holds.
  useEffect(() => {
    if (mood !== "talking" || !visible) return;
    const timer = setInterval(() => setTalk((n) => n + 1), 170);
    return () => clearInterval(timer);
  }, [mood, visible]);
  // After a while with nothing happening the breath stops too.
  useEffect(() => {
    setRested(false);
    if (mood !== "idle") return;
    const timer = setTimeout(() => setRested(true), 90_000);
    return () => clearTimeout(timer);
  }, [mood]);

  const mouth: MouthName = mood === "talking" ? TALK[talk % TALK.length] : mood === "idle" ? "smile" : "default";
  const gaze = mood === "thinking" ? "translate(48 -42)" : mood === "sorry" ? "translate(0 26)" : mood === "listening" ? "translate(0 -10)" : undefined;
  const browL = mood === "listening" ? "translate(0 -48)" : mood === "thinking" ? `rotate(9 ${BOX.brow[0] + BOX.brow[2]} ${BOX.brow[1] + 60})` : mood === "sorry" ? `rotate(12 ${BOX.brow[0]} ${BOX.brow[1] + 60})` : undefined;
  const browR = mood === "listening" ? "translate(0 -48)" : mood === "thinking" ? `translate(0 -30) rotate(-6 ${BOX.browR[0]} ${BOX.browR[1] + 60})` : mood === "sorry" ? `rotate(-12 ${BOX.browR[0] + BOX.browR[2]} ${BOX.browR[1] + 60})` : undefined;
  const still = !visible || rested;
  const state = mood === "idle" ? "here" : mood === "listening" ? "listening" : mood === "thinking" ? "thinking" : mood === "talking" ? "talking" : "sorry";
  const tints = {
    fur: fur ? `url(#${id}-fur)` : undefined,
    suit: `url(#${id}-suit)`,
    shirt: `url(#${id}-shirt)`,
    tie: `url(#${id}-tie)`,
  };
  const rightEye = `translate(${2 * AXIS} 0) scale(-1 1)`;

  return (
    <svg
      className={`rig rig--${mood}${still ? " rig--still" : ""}${className ? ` ${className}` : ""}`}
      width={Math.round(size * (VIEW.w / VIEW.h))}
      height={size}
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-label={`Alpha, a ${animal.name.toLowerCase()}, is ${state}`}
      data-animal={animal.id}
    >
      <defs>
        {fur ? <Tint id={`${id}-fur`} color={fur} lo={-0.3} hi={0.08} /> : null}
        <Tint id={`${id}-suit`} color={look.suit} />
        <Tint id={`${id}-shirt`} color={look.shirt} lo={-0.3} hi={0.12} />
        <Tint id={`${id}-tie`} color={look.tie} />
      </defs>
      <g className="rig__body">
        <g className="rig__head">
          {animal.ears === "cap" ? (
            <>
              <Part href={ear} box={BOX.ear} />
              <Part href={ear} box={BOX.ear} transform={mirror} />
            </>
          ) : (
            <Ears kind={animal.ears} size={animal.earSize} fur={fur ?? "#f0e4cf"} inner={animal.earInner} />
          )}
          <Part href={shell} box={BOX.shell} filter={tints.fur} />
        </g>
        <Part href={shirt} box={BOX.shirt} filter={tints.shirt} />
        {look.neckwear === "tie" ? <Part href={tie} box={BOX.tie} filter={tints.tie} /> : look.neckwear === "bow" ? <Bow color={look.tie} /> : null}
        <Part href={suit} box={BOX.suit} filter={tints.suit} />
        <Part href={arm} box={BOX.arm} filter={tints.fur} />
        <Part href={arm} box={BOX.arm} filter={tints.fur} transform={mirror} />
        <g className="rig__face">
          {animal.id === "panda" ? (
            <>
              <Part href={patch} box={BOX.patch} />
              <Part href={patch} box={BOX.patch} transform={mirror} />
            </>
          ) : null}
          {animal.muzzle ? <ellipse cx={AXIS} cy={NOSE.y + 120} rx="330" ry="235" fill="#ffffff" opacity="0.32" /> : null}
          <g className="rig__brows">
            <Part href={brow} box={BOX.brow} transform={browL} />
            <g transform={browR}>
              <image href={brow} x={BOX.browR[0]} y={BOX.browR[1]} width={BOX.browR[2]} height={BOX.browR[3]} transform={`translate(${2 * BOX.browR[0] + BOX.browR[2]} 0) scale(-1 1)`} />
            </g>
          </g>
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
            <g className="rig__pupils" transform={gaze}>
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
          {look.glasses ? <Glasses /> : null}
          {animal.nose === "painted" ? <Part href={snout} box={BOX.snout} /> : <Nose kind={animal.nose} color={animal.noseColor} />}
          <Part href={MOUTH_ART[mouth]} box={MOUTH[mouth]} />
          {animal.whiskers ? (
            <g stroke="#3a3238" strokeWidth="14" strokeLinecap="round" opacity="0.55">
              <path d={`M ${AXIS - 420} ${NOSE.y + 20} L ${AXIS - 760} ${NOSE.y - 60}`} />
              <path d={`M ${AXIS - 430} ${NOSE.y + 110} L ${AXIS - 780} ${NOSE.y + 120}`} />
              <path d={`M ${AXIS + 420} ${NOSE.y + 20} L ${AXIS + 760} ${NOSE.y - 60}`} />
              <path d={`M ${AXIS + 430} ${NOSE.y + 110} L ${AXIS + 780} ${NOSE.y + 120}`} />
            </g>
          ) : null}
        </g>
      </g>
    </svg>
  );
}
