import { useMemo } from "react";
import { CompanionZazooFace } from "../avatar/zazoo/CompanionZazooFace";
import { ZazooDirector } from "../avatar/zazoo/director";

/** Zazoo, the assistant, as a static icon — the same character the floating companion
 *  (avatar/Character.tsx) shows, in the person's chosen animal and outfit, held on one resting
 *  frame and cropped to the head, so the rail mark, panel headers and module button all read
 *  as one character. */
export function ZazooIcon({ size = 32, className, label = "Zazoo" }: { size?: number; className?: string; label?: string }) {
  const director = useMemo(() => new ZazooDirector(), []);
  return (
    <span className={className} data-overflow-ok="" style={{ display: "block", width: size, height: size }}>
      <CompanionZazooFace director={director} size={size} label={label} crop animate={false} />
    </span>
  );
}
