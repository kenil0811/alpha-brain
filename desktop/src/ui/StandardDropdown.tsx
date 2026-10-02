import { useMemo, useState } from "react";
import { Plus, Star, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import { Input } from "./Input";
import "./StandardDropdown.css";

export interface StandardDropdownOption {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** Why it can't be picked here; the option shows greyed with this beside it. */
  disabledReason?: string;
}

/** Ports Bridge's StandardDropdown behavior: search past 6 options, a pinned "+ Add…" row
 * that can be disabled with a reason (shown as a tooltip-less inline note, kept simple here).
 * Given `onDefaultChange`, every option carries a star: clicking it makes that option the
 * default (what opens first) without picking it, and clicking the filled star clears it. */
export function StandardDropdown({
  options,
  value,
  onChange,
  placeholder = "Select…",
  onAdd,
  addLabel = "Add…",
  addDisabledReason,
  ariaLabel,
  defaultValue,
  onDefaultChange,
  searchable = options.length > 6,
}: {
  options: StandardDropdownOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  onAdd?: () => void;
  addLabel?: string;
  addDisabledReason?: string;
  ariaLabel?: string;
  defaultValue?: string | null;
  onDefaultChange?: (value: string | null) => void;
  /** A short fixed list (kinds of view) reads better without the search box. */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const showSearch = searchable;
  const filtered = useMemo(
    () => (query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options),
    [options, query],
  );
  const current = options.find((o) => o.value === value);
  const CurrentIcon = current?.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="ui-select-trigger ui-std-dropdown__trigger" aria-label={ariaLabel} title={current?.label}>
          {CurrentIcon ? <CurrentIcon size={14} aria-hidden="true" /> : null}
          <span>{current ? current.label : placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <div className="ui-std-dropdown">
          {showSearch ? (
            <Input autoFocus placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} className="ui-std-dropdown__search" />
          ) : null}
          <div className="ui-std-dropdown__list" role="listbox">
            {filtered.map((option) => {
              const Icon = option.icon;
              const starred = option.value === defaultValue;
              return (
                <div key={option.value} className="ui-std-dropdown__row">
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    disabled={Boolean(option.disabledReason)}
                    title={option.disabledReason}
                    className={`ui-std-dropdown__item${option.value === value ? " ui-std-dropdown__item--current" : ""}`}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {Icon ? <Icon size={14} aria-hidden="true" /> : null}
                    <span className="ui-std-dropdown__label">{option.label}</span>
                    {option.disabledReason ? <span className="ui-std-dropdown__reason">{option.disabledReason}</span> : null}
                  </button>
                  {onDefaultChange && !option.disabledReason ? (
                    <button
                      type="button"
                      className={`ui-std-dropdown__star${starred ? " ui-std-dropdown__star--on" : ""}`}
                      aria-label={`Make ${option.label} the default`}
                      aria-pressed={starred}
                      title={starred ? "The default. Click to clear it" : "Make this the default"}
                      onClick={() => onDefaultChange(starred ? null : option.value)}
                    >
                      <Star size={13} aria-hidden="true" fill={starred ? "currentColor" : "none"} />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {filtered.length === 0 ? <p className="ui-std-dropdown__empty">No matches</p> : null}
          </div>
          {onAdd ? (
            <button
              type="button"
              className="ui-std-dropdown__add"
              disabled={Boolean(addDisabledReason)}
              title={addDisabledReason}
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
            >
              <Plus size={14} /> {addLabel}
              {addDisabledReason ? <span className="ui-std-dropdown__reason">{addDisabledReason}</span> : null}
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
