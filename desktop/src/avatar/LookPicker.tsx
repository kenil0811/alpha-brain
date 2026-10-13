/**
 * The companion's look, chosen in Settings: the animal, the fur, the suit, the shirt, the
 * neckwear and glasses. Every change is kept in the world at once (the preference
 * `companion_look`), so the companion window and any other Mac draw the same character. Since
 * 13 Oct (Q42 section 7c) the same pickers choose each agent's look on its page (`LookEditor`).
 */
import { useState } from "react";
import type { Client } from "../core/client";
import { usePreference } from "../core/preferences";
import { Tabs } from "../ui";
import { ANIMALS, FURS, SHIRTS, SUITS, TIES, animalOf, normaliseLook, type Look, type Neckwear, type Size, type Swatch } from "./looks";
import { Rig } from "./Rig";

const KEY = "companion_look";

function Swatches({ label, choices, value, onPick, none }: { label: string; choices: Swatch[]; value: string | null; onPick: (color: string | null) => void; none?: string }) {
  return (
    <div className="look__row" role="group" aria-label={label}>
      <span className="look__label">{label}</span>
      <div className="look__swatches">
        {none ? (
          <button type="button" className={`look__swatch look__swatch--none${value === null ? " look__swatch--on" : ""}`} aria-pressed={value === null} aria-label={none} title={none} onClick={() => onPick(null)}>
            ·
          </button>
        ) : null}
        {choices.map((c) => (
          <button key={c.color} type="button" className={`look__swatch${value === c.color ? " look__swatch--on" : ""}`} style={{ background: c.color }} aria-pressed={value === c.color} aria-label={c.name} title={c.name} onClick={() => onPick(c.color)} />
        ))}
      </div>
    </div>
  );
}

/** The companion's own look (Settings): kept under `companion_look` in the world. */
export function LookPicker({ client }: { client: Client }) {
  const [kept, setKept] = usePreference<unknown>(client, KEY, null);
  const [problem, setProblem] = useState<string | null>(null);
  return <LookEditor look={normaliseLook(kept)} problem={problem} onChange={(next) => { setProblem(null); void setKept(next).then((err) => err && setProblem(err)); }} />;
}

/** The pickers for a look, for whoever keeps it: the companion (above) or one agent (its page,
 *  13 Oct, Q42 section 7c). */
export function LookEditor({ look, onChange, problem }: { look: Look; onChange: (next: Look) => void; problem?: string | null }) {
  const change = (patch: Partial<Look>) => onChange({ ...look, ...patch });
  const animal = animalOf(look.animal);
  return (
    <div className="look">
      <div className="look__preview" aria-hidden="true">
        <Rig look={look} mood="idle" size={150} />
      </div>
      <div className="look__controls">
        <div className="look__row" role="group" aria-label="Animal">
          <span className="look__label">Animal</span>
          <div className="look__animals">
            {ANIMALS.map((a) => (
              <button key={a.id} type="button" className={`look__animal${a.id === look.animal ? " look__animal--on" : ""}`} aria-pressed={a.id === look.animal} aria-label={a.name} title={a.name} onClick={() => change({ animal: a.id, fur: null })}>
                <Rig look={{ ...look, animal: a.id, fur: null }} mood="idle" size={40} />
              </button>
            ))}
          </div>
        </div>
        <Swatches label="Fur" choices={FURS} value={look.fur} onPick={(fur) => change({ fur })} none={animal.fur === null ? "As painted" : `${animal.name}'s own`} />
        <Swatches label="Suit" choices={SUITS} value={look.suit} onPick={(suit) => suit && change({ suit })} />
        <Swatches label="Shirt" choices={SHIRTS} value={look.shirt} onPick={(shirt) => shirt && change({ shirt })} />
        <div className="look__row" role="group" aria-label="Neckwear">
          <span className="look__label">Neckwear</span>
          <Tabs<Neckwear> className="toggle toggle--views" label="Neckwear" value={look.neckwear} onChange={(neckwear) => change({ neckwear })} items={[{ id: "tie", label: "Tie" }, { id: "bow", label: "Bow" }, { id: "none", label: "None" }]} />
        </div>
        {look.neckwear !== "none" ? <Swatches label={look.neckwear === "bow" ? "Bow" : "Tie"} choices={TIES} value={look.tie} onPick={(tie) => tie && change({ tie })} /> : null}
        <div className="look__row" role="group" aria-label="Size">
          <span className="look__label">Size</span>
          <Tabs<Size> className="toggle toggle--views" label="Size" value={look.size} onChange={(size) => change({ size })} items={[{ id: "small", label: "Small" }, { id: "medium", label: "Medium" }, { id: "large", label: "Large" }]} />
        </div>
        <div className="look__row">
          <span className="look__label">Glasses</span>
          <button type="button" className={`switch${look.glasses ? "" : " switch--off"}`} role="switch" aria-checked={look.glasses} aria-label="Glasses" onClick={() => change({ glasses: !look.glasses })} />
        </div>
        {problem ? (
          <p className="notice" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
    </div>
  );
}
