/**
 * Alpha's character as the companion window shows it: the rig in the look the person chose
 * (`looks.ts`, kept in the world as a preference), with the mood of what Alpha is doing.
 */
import { DEFAULT_LOOK, type Look } from "./looks";
import { Rig, type Mood } from "./Rig";

export type { Mood };

export function Character({ mood, size = 96, look = DEFAULT_LOOK }: { mood: Mood; size?: number; look?: Look }) {
  return <Rig look={look} mood={mood} size={size} className="character" />;
}
