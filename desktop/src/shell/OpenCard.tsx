/**
 * A card that opens something: an icon, a name, one line about it, optional meta, and **Open →**
 * (the UI rulebook §11 and §12). Home's module cards and Intelligence's agent cards are this one
 * part, so the two read as the same kind of thing. `dashed` is the last card, "New".
 * (9 Oct, the pages phase.)
 */
import type { ReactNode } from "react";
import { Button } from "../ui";
import { ArrowRight, ICON_SM } from "../ui/icons";

export function OpenCard({ icon, name, description, meta, openLabel = "Open", onOpen, dashed }: { icon: ReactNode; name: string; description: string; meta?: string; openLabel?: string; onOpen: () => void; dashed?: boolean }) {
  return (
    <article className={`card modcard${dashed ? " modcard--new" : ""}`}>
      <div className="modcard__top">
        <span className="modcard__ico" aria-hidden="true">
          {icon}
        </span>
        <div className="modcard__titles">
          <h3>{name}</h3>
          {meta ? <div className="faint">{meta}</div> : null}
        </div>
      </div>
      <p>{description}</p>
      <div className="modcard__foot">
        <Button size="sm" aria-label={dashed ? openLabel : `${openLabel} ${name}`} onClick={onOpen}>
          {openLabel} <ArrowRight size={ICON_SM} aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
