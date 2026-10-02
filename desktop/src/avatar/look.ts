/** What the companion looks like: which animal and what it wears (Bridge's ZazooAppearance and
 *  ZazooLab swatches). Kept in localStorage so every window draws the same character: the
 *  companion window hears a change through the `storage` event, this window through LOOK_EVENT.
 *  ponytail: per-Mac localStorage; move to the core if the look should follow the person. */
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_APPEARANCE, type ZazooAppearance } from "./zazoo/ZazooAvatar";
import { DEFAULT_SPECIES, SPECIES, type ZazooSpecies } from "./zazoo/species";

export const LOOK_KEY = "alpha.avatar";
/** Fired on this window when the avatar or the appearance changes here. */
export const LOOK_EVENT = "alpha:look";

export interface AvatarLook extends ZazooAppearance {
  species: string;
}

export const DEFAULT_LOOK: AvatarLook = { species: DEFAULT_SPECIES.id, ...DEFAULT_APPEARANCE };

/** [colour, name] — Bridge's ZazooLab swatches. */
export const BODY_COLORS: [string, string][] = [["#FAF1E7", "Cream"], ["#F0DFC2", "Oat"], ["#D8DCE4", "Silver"], ["#CFE0D2", "Mint"], ["#F2C9B0", "Peach"], ["#D6CBEB", "Lilac"]];
export const SUIT_COLORS: [string, string][] = [["#7E2732", "Burgundy"], ["#15151A", "Black"], ["#3E5A7E", "Navy"], ["#4A4E5A", "Charcoal"], ["#7E937E", "Sage"], ["#2F4A44", "Pine"]];
export const TIE_COLORS: [string, string][] = [["#E8B93C", "Mustard"], ["#B8323C", "Red"], ["#2E5E8C", "Blue"], ["#D9D5CC", "Stone"], ["#4F7F5A", "Green"]];
export const SHIRT_COLORS: [string, string][] = [["#F4EEE2", "Ivory"], ["#FFFFFF", "White"], ["#CFE0EA", "Sky"], ["#E6D9C3", "Sand"], ["#D9C9D9", "Mauve"]];
export const ACCESSORIES: { value: ZazooAppearance["accessory"]; label: string }[] = [
  { value: "tie", label: "Tie" },
  { value: "bowtie", label: "Bow tie" },
  { value: "scarf", label: "Scarf" },
  { value: "none", label: "None" },
];

export function speciesOf(look: AvatarLook): ZazooSpecies {
  return SPECIES.find((s) => s.id === look.species) ?? DEFAULT_SPECIES;
}

/** "Red panda" from "red panda". */
export function kindLabel(s: ZazooSpecies): string {
  return s.kind.charAt(0).toUpperCase() + s.kind.slice(1);
}

export function readLook(): AvatarLook {
  try {
    return { ...DEFAULT_LOOK, ...(JSON.parse(window.localStorage.getItem(LOOK_KEY) ?? "{}") as Partial<AvatarLook>) };
  } catch {
    return DEFAULT_LOOK;
  }
}

export function saveLook(look: AvatarLook): void {
  try {
    window.localStorage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    /* per-window convenience only */
  }
  window.dispatchEvent(new Event(LOOK_EVENT));
}

/** Calls `onChange` when the look or the appearance changes in this or another window. */
export function useLookChange(onChange: () => void): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOOK_KEY || e.key === "alpha.appearance" || e.key === "alpha.theme") onChange();
    };
    window.addEventListener(LOOK_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LOOK_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [onChange]);
}

export function useLook(): AvatarLook {
  const [look, setLook] = useState(readLook);
  useLookChange(useCallback(() => setLook(readLook()), []));
  return look;
}
