import { useState } from "react";
import { IconButton } from "./IconButton";
import { Popover } from "./Popover";
import { Check, ChevronDown, Star } from "./icons";

export interface StarOption<T extends string> {
  id: T;
  label: string;
}

/** A dropdown whose options each carry a star: picking an option shows it now; the star makes
 *  it the default the page opens on without picking it, and a filled star clears that. */
export function StarPicker<T extends string>({ label, value, options, onChange, starred, onStar }: { label: string; value: T; options: StarOption<T>[]; onChange: (id: T) => void; starred: T | null; onStar: (id: T | null) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <Popover
      label={label}
      align="start"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className="btn btn--sm starpick" aria-label={`${label}: ${current?.label ?? "none"}`}>
          {current?.label ?? label}
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      }
    >
      {options.map((o) => {
        const on = o.id === starred;
        return (
          <div key={o.id} className="starpick__row">
            <button
              type="button"
              className="menu__item starpick__pick"
              aria-current={o.id === value ? "true" : undefined}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              <span className="starpick__mark" aria-hidden="true">
                {o.id === value ? <Check size={13} /> : null}
              </span>
              {o.label}
            </button>
            <IconButton
              size="sm"
              className={on ? "starpick__star starpick__star--on" : "starpick__star"}
              label={on ? `${o.label} is the default; clear it` : `Make ${o.label} the default`}
              aria-pressed={on}
              icon={<Star size={13} fill={on ? "currentColor" : "none"} />}
              onClick={() => onStar(on ? null : o.id)}
            />
          </div>
        );
      })}
    </Popover>
  );
}
