/**
 * Zazoo's character as the companion window shows it: the rig in the look the person chose
 * (`looks.ts`, kept in the world as a preference), with the mood of what Zazoo is doing, eyes
 * that follow the pointer, a hop when a thing is done, and a soft shadow on the ground under
 * it that shrinks while it is in the air.
 */
import { DEFAULT_LOOK, type Look } from "./looks";
import { Rig, type Mood } from "./Rig";

export type { Mood };

export function Character({ mood, size = 96, look = DEFAULT_LOOK, done = 0 }: { mood: Mood; size?: number; look?: Look; done?: number }) {
  return (
    <span className="character">
      <Rig look={look} mood={mood} size={size} follow done={done} />
      <span className="character__shadow" aria-hidden="true" />
    </span>
  );
}
