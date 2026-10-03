/**
 * The companion's look, chosen in Settings: the animal, the fur, the suit, the shirt, the
 * neckwear and glasses. Every change is kept in the world at once (the preference
 * `companion_look`), so the companion window and any other Mac draw the same character.
 */
import { useEffect, useState } from "react";
import type { Client } from "../core/client";
import { Tabs } from "../ui";
import { ANIMALS, DEFAULT_LOOK, FURS, SHIRTS, SUITS, TIES, animalOf, normaliseLook, type Look, type Neckwear, type Swatch } from "./looks";
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

export function LookPicker({ client }: { client: Client }) {
  const [look, setLook] = useState<Look | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .preference(KEY)
      .then((p) => !cancelled && setLook(normaliseLook(p.value)))
      .catch((e) => !cancelled && (setLook(DEFAULT_LOOK), setProblem(e instanceof Error ? e.message : String(e))));
    return () => {
      cancelled = true;
    };
  }, [client]);

  const change = (patch: Partial<Look>) => {
    if (!look) return;
    const next = { ...look, ...patch };
    setLook(next);
    setProblem(null);
    client.setPreference(KEY, next).catch((e) => setProblem(e instanceof Error ? e.message : String(e)));
  };

  if (!look) return <p className="faint">Loading the look…</p>;
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
