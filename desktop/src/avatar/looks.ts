/**
 * The companion's look: the animal and its wardrobe, chosen by the person in Settings and kept
 * in the world as the preference `companion_look` (design §11, Q27). The companion is Zazoo
 * whichever animal it is.
 *
 * Every animal is a small delta on one painted body (the panda art, `art/CREDIT.md`): the
 * ears, the eyes, the nose, whiskers and a muzzle carry the identity; the fur colour tints the
 * same body. The idea is Bridge's (one rig, species as deltas); the vocabulary here is the
 * part of it the painted parts can carry well at the companion's size.
 */

export type AnimalId = "panda" | "cat" | "rabbit" | "fox" | "bear" | "otter" | "red_panda" | "koala" | "hamster" | "squirrel";

export interface Animal {
  id: AnimalId;
  name: string;
  /** cap: the painted panda ears · point · tall · bud (round) · drop (floppy, hangs). */
  ears: "cap" | "point" | "tall" | "bud" | "drop";
  earSize: number;
  earInner: string;
  /** dark: the painted gloss eye (panda) · white: a white eye with the painted pupil. */
  eyes: "dark" | "white";
  /** painted: the panda's snout · tri · oval. */
  nose: "painted" | "tri" | "oval";
  noseColor: string;
  whiskers: boolean;
  muzzle: boolean;
  /** The felt the animal comes in; the fur swatches still apply. null keeps the painted fur. */
  fur: string | null;
}

export const ANIMALS: Animal[] = [
  { id: "panda", name: "Panda", ears: "cap", earSize: 1, earInner: "#2f3038", eyes: "dark", nose: "painted", noseColor: "#1b1c21", whiskers: false, muzzle: false, fur: null },
  { id: "cat", name: "Cat", ears: "point", earSize: 1, earInner: "#e9aeb6", eyes: "white", nose: "tri", noseColor: "#e8899b", whiskers: true, muzzle: false, fur: "#f0dfc2" },
  { id: "rabbit", name: "Rabbit", ears: "tall", earSize: 1, earInner: "#edbcc6", eyes: "white", nose: "tri", noseColor: "#e39aa8", whiskers: true, muzzle: false, fur: "#e6e8ed" },
  { id: "fox", name: "Fox", ears: "point", earSize: 1.1, earInner: "#4a3a30", eyes: "white", nose: "tri", noseColor: "#463629", whiskers: true, muzzle: true, fur: "#d99a66" },
  { id: "bear", name: "Bear", ears: "bud", earSize: 1, earInner: "#a87c50", eyes: "white", nose: "oval", noseColor: "#463629", whiskers: false, muzzle: true, fur: "#c99c6e" },
  { id: "otter", name: "Otter", ears: "bud", earSize: 0.8, earInner: "#96714c", eyes: "white", nose: "oval", noseColor: "#4a3a30", whiskers: true, muzzle: true, fur: "#b98d64" },
  { id: "red_panda", name: "Red panda", ears: "point", earSize: 0.95, earInner: "#e3c3ac", eyes: "white", nose: "oval", noseColor: "#3a3238", whiskers: true, muzzle: true, fur: "#c97f5e" },
  { id: "koala", name: "Koala", ears: "bud", earSize: 1.35, earInner: "#d6d9de", eyes: "white", nose: "oval", noseColor: "#3a3238", whiskers: false, muzzle: false, fur: "#b8bcc4" },
  { id: "hamster", name: "Hamster", ears: "bud", earSize: 0.9, earInner: "#efd9be", eyes: "white", nose: "tri", noseColor: "#e8899b", whiskers: true, muzzle: true, fur: "#d9c4a8" },
  { id: "squirrel", name: "Squirrel", ears: "point", earSize: 0.8, earInner: "#d9b48f", eyes: "white", nose: "tri", noseColor: "#463629", whiskers: true, muzzle: false, fur: "#c08552" },
];

export interface Swatch {
  name: string;
  color: string;
}

/** Felt colours for the fur; "As painted" (null) is the panda's own and the default for it. */
export const FURS: Swatch[] = [
  { name: "Cream", color: "#f0e4cf" },
  { name: "Sand", color: "#d9c4a8" },
  { name: "Honey", color: "#d99a66" },
  { name: "Rust", color: "#c97f5e" },
  { name: "Cocoa", color: "#8a6646" },
  { name: "Grey", color: "#b8bcc4" },
  { name: "Snow", color: "#e6e8ed" },
  { name: "Slate", color: "#6f7a88" },
];

export const SUITS: Swatch[] = [
  { name: "Navy", color: "#2b3a55" },
  { name: "Charcoal", color: "#3a3d45" },
  { name: "Forest", color: "#36513f" },
  { name: "Plum", color: "#5a3b5c" },
  { name: "Camel", color: "#9a7b55" },
  { name: "Burgundy", color: "#6b2f3a" },
];

export const SHIRTS: Swatch[] = [
  { name: "White", color: "#f4f1ea" },
  { name: "Sky", color: "#cfdff0" },
  { name: "Blush", color: "#f1d6d6" },
  { name: "Mint", color: "#d4e8dc" },
  { name: "Butter", color: "#f3e7bf" },
];

export const TIES: Swatch[] = [
  { name: "Claret", color: "#8c2f3f" },
  { name: "Ink", color: "#1f2a44" },
  { name: "Olive", color: "#5b6b3a" },
  { name: "Gold", color: "#c4955a" },
  { name: "Teal", color: "#2f6b73" },
  { name: "Coral", color: "#d9705f" },
];

/** What it wears, any mix (none too). The bow tie and the scarf take the tie's colour. */
export type Accessory = "tie" | "bowtie" | "scarf" | "spectacles";
export const ACCESSORIES: { id: Accessory; label: string }[] = [
  { id: "tie", label: "Tie" },
  { id: "bowtie", label: "Bow tie" },
  { id: "scarf", label: "Scarf" },
  { id: "spectacles", label: "Spectacles" },
];
export type Size = "small" | "medium" | "large";
/** The character's height on screen, in CSS pixels, when the companion rests. */
export const SIZE_PX: Record<Size, number> = { small: 60, medium: 80, large: 108 };

export interface Look {
  animal: AnimalId;
  /** A fur swatch, or null for the animal's own felt (the panda stays as painted). */
  fur: string | null;
  suit: string;
  shirt: string;
  tie: string;
  accessories: Accessory[];
  size: Size;
}

export const DEFAULT_LOOK: Look = { animal: "panda", fur: null, suit: SUITS[0].color, shirt: SHIRTS[0].color, tie: TIES[0].color, accessories: ["tie"], size: "medium" };

export function animalOf(id: AnimalId): Animal {
  return ANIMALS.find((a) => a.id === id) ?? ANIMALS[0];
}

const HEX = /^#[0-9a-f]{6}$/i;

/** The look a stored value means: anything missing or malformed takes the default, so a value
 *  from an older or newer window still draws something. */
export function normaliseLook(value: unknown): Look {
  const v = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof Look | "neckwear" | "glasses", unknown>>;
  const animal = ANIMALS.some((a) => a.id === v.animal) ? (v.animal as AnimalId) : DEFAULT_LOOK.animal;
  const color = (c: unknown, fallback: string) => (typeof c === "string" && HEX.test(c) ? c.toLowerCase() : fallback);
  return {
    animal,
    fur: v.fur === null || v.fur === undefined ? null : typeof v.fur === "string" && HEX.test(v.fur) ? v.fur.toLowerCase() : null,
    suit: color(v.suit, DEFAULT_LOOK.suit),
    shirt: color(v.shirt, DEFAULT_LOOK.shirt),
    tie: color(v.tie, DEFAULT_LOOK.tie),
    accessories: accessoriesOf(v),
    size: v.size === "small" || v.size === "large" ? v.size : "medium",
  };
}

/** The accessories, in the picker's order. A look kept before they were a list had one
 *  `neckwear` (tie, bow or none; a tie when missing) and a separate `glasses` switch. */
function accessoriesOf(v: { accessories?: unknown; neckwear?: unknown; glasses?: unknown }): Accessory[] {
  const worn = Array.isArray(v.accessories)
    ? v.accessories
    : [v.neckwear === "bow" ? "bowtie" : v.neckwear === "none" ? null : "tie", v.glasses === true ? "spectacles" : null];
  return ACCESSORIES.map((a) => a.id).filter((a) => worn.includes(a));
}

/** The fur the rig draws: the chosen swatch, else the animal's own; null means as painted. */
export function furOf(look: Look): string | null {
  return look.fur ?? animalOf(look.animal).fur;
}

/** `#rrggbb` moved towards black (amount < 0) or white (amount > 0), for the tints' two ends. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const target = amount < 0 ? 0 : 255;
    const v = Math.round(c + (target - c) * Math.min(1, Math.abs(amount)));
    return v.toString(16).padStart(2, "0");
  };
  return `#${channel((n >> 16) & 255)}${channel((n >> 8) & 255)}${channel(n & 255)}`;
}
