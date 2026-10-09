import * as RadixPopover from "@radix-ui/react-popover";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useAssistant } from "./assistant";
import { Button } from "./Button";
import { ChevronDown, PlusIcon, Star } from "./icons";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** The reason this option cannot be picked right now; it shows when the option is hovered or
   *  reached by the arrow keys. */
  disabled?: string;
}

/** What the single and the multiple dropdown share. */
interface DropdownBase<T extends string> {
  options: DropdownOption<T>[];
  /** What this chooses, for assistive technology ("Group by"), and the context of "Add new…". */
  label: string;
  placeholder?: string;
  /** Adds an option the caller's own way; without it "Add new…" asks the assistant. */
  onAdd?: () => void;
  addLabel?: string;
  size?: "md" | "sm";
  className?: string;
  id?: string;
  /** Opens on arrival, for a cell that turns into a dropdown to be edited. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** An icon before the value in the trigger (the data view's view picker, which shows only
   *  this when the toolbar is narrow). */
  icon?: ReactNode;
  /** The person's default option, when the caller keeps it (with `onSetDefault`). */
  defaultValue?: string;
  /** Makes an option the default (the star); it does not choose the option. Without it the
   *  dropdown keeps the default itself, under `defaultKey` (else `label`): see `useDropdownDefault`. */
  onSetDefault?: (value: T) => void;
  defaultKey?: string;
}

const STORE = "alpha.default.";
const heard = new Set<() => void>();
function storeDefault(key: string, value: string) {
  localStorage.setItem(STORE + key, value);
  for (const hear of heard) hear();
}
const listen = (hear: () => void) => {
  heard.add(hear);
  return () => void heard.delete(hear);
};

/** The default a dropdown keeps itself (the star, when its caller passes no `onSetDefault`), for
 *  the caller to start from: `useDropdownDefault(label) ?? "table"`. Every reader hears a change. */
export function useDropdownDefault(key: string, fallback?: string): string | undefined {
  return useSyncExternalStore(listen, () => localStorage.getItem(STORE + key) ?? fallback);
}

/** The one standard single-select, in place of the browser's native `<select>` (the UI rulebook
 *  §14 and §17, as Vikas decided on 9 Oct): a search box at the top, always; the selected option
 *  first, shown by a highlighted row (no tick); about five rows show and the list scrolls; a star
 *  on each option, ★ filled on the person's default, ☆ on hover or focus to make one the default
 *  without choosing it; "Add new…" pinned at the bottom. From the keyboard: arrows move, Enter
 *  picks, Escape closes, typing searches. Built on a Radix popover, so it stays inside the window. */
export function Dropdown<T extends string = string>({ value, onChange, ...rest }: DropdownBase<T> & { value: T; onChange: (value: T) => void }) {
  return <DropdownCore {...rest} values={[value]} onPick={(v) => onChange(v)} />;
}

/** The same, choosing several: every chosen option is highlighted, a click toggles one and the
 *  list stays open; the trigger reads the chosen labels, or "3 selected". */
export function MultiDropdown<T extends string = string>({ values, onChange, ...rest }: DropdownBase<T> & { values: T[]; onChange: (values: T[]) => void }) {
  return <DropdownCore {...rest} multiple values={values} onPick={(v) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])} />;
}

function DropdownCore<T extends string>({
  values,
  onPick,
  multiple,
  options,
  label,
  placeholder = "Choose…",
  onAdd,
  addLabel = "Add new…",
  size = "md",
  className,
  id,
  defaultOpen,
  onOpenChange,
  icon,
  defaultValue,
  onSetDefault,
  defaultKey,
}: DropdownBase<T> & { values: T[]; onPick: (value: T) => void; multiple?: boolean }) {
  const [open, setOpenState] = useState(Boolean(defaultOpen));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const assistant = useAssistant();
  const storeKey = defaultKey ?? label;
  const stored = useDropdownDefault(storeKey);
  const theDefault = onSetDefault ? defaultValue : stored;
  const setDefault = onSetDefault ?? ((v: T) => storeDefault(storeKey, v));
  const chosen = options.filter((o) => values.includes(o.value));

  const shown = useMemo(() => {
    // one choice comes first; several stay where they are, so a toggle does not move the row
    const first = multiple ? undefined : options.find((o) => values.includes(o.value));
    const ordered = first ? [first, ...options.filter((o) => o !== first)] : options;
    const q = query.trim().toLowerCase();
    return q ? ordered.filter((o) => o.label.toLowerCase().includes(q)) : ordered;
  }, [options, values, multiple, query]);
  const rows = shown.length + 1; // the options, then "Add new…"
  const optionId = (i: number) => `${uid}-o${i}`;

  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next) {
      setQuery("");
      setActive(0);
      setAdding(null);
    }
    onOpenChange?.(next);
  };
  const pick = (option: DropdownOption<T>) => {
    if (option.disabled) return;
    onPick(option.value);
    if (!multiple) setOpen(false);
  };
  const add = () => {
    if (!onAdd) return setAdding("");
    setOpen(false);
    onAdd();
  };
  const send = () => {
    if (!assistant || !adding?.trim()) return;
    assistant.say(`In "${label}", add: ${adding.trim()}`);
    setOpen(false);
  };

  useEffect(() => {
    if (open && adding === null) document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  });

  const move = (to: number) => setActive(Math.max(0, Math.min(rows - 1, to)));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation(); // a row or a cell behind this must not hear the keys
    if (adding !== null || (e.target as HTMLElement).closest?.(".dropdown__star")) return; // the add box and a star hear their own keys
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "Enter") {
      if (active < shown.length) pick(shown[active]);
      else add();
    } else return;
    e.preventDefault();
  };

  const current = active < shown.length ? shown[active] : undefined;
  const valueId = `${uid}-value`;
  const listId = `${uid}-list`;
  const shownValue = chosen.length > 2 ? `${chosen.length} selected` : chosen.map((o) => o.label).join(", ");
  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button type="button" id={id} role="combobox" aria-haspopup="listbox" aria-label={label} aria-describedby={valueId} className={["btn", size === "sm" ? "btn--sm" : "", "dropdown__trigger", className ?? ""].filter(Boolean).join(" ")} onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}>
          {icon ? (
            <span className="dropdown__tico" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span id={valueId} className={`dropdown__value${chosen.length ? "" : " dropdown__value--placeholder"}`}>
            {shownValue || placeholder}
          </span>
          <span className="dropdown__chev" aria-hidden="true">
            <ChevronDown />
          </span>
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          className="dropdown__pop"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            searchRef.current?.focus();
          }}
        >
          {adding !== null ? (
            <div className="dropdown__ask">
              <textarea
                autoFocus
                className="dropdown__askbox"
                aria-label="Describe what you'd like to add"
                placeholder="Describe what you'd like to add"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
              />
              <Button variant="primary" size="sm" onClick={send} disabled={!adding.trim()} disabledReason={assistant ? undefined : "The assistant isn't reachable here."}>
                Send
              </Button>
            </div>
          ) : (
            <>
              <input
                ref={searchRef}
                className="dropdown__search"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={optionId(active)}
                aria-label={`Search ${label}`}
                placeholder="Search…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
              />
              <div id={listId} className="dropdown__list" role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} tabIndex={-1}>
                {shown.map((o, i) => (
                  <div
                    key={o.value}
                    id={optionId(i)}
                    role="option"
                    aria-selected={values.includes(o.value)}
                    aria-disabled={o.disabled ? true : undefined}
                    data-active={i === active ? "" : undefined}
                    className="dropdown__opt"
                    onMouseMove={() => active !== i && setActive(i)}
                    onClick={() => pick(o)}
                  >
                    {o.icon ? (
                      <span className="dropdown__ico" aria-hidden="true">
                        {o.icon}
                      </span>
                    ) : null}
                    <span className="dropdown__label">{o.label}</span>
                    {o.value === theDefault ? (
                      <span className="dropdown__star" data-on="" role="img" aria-label={`${o.label} is the default`}>
                        <Star fill="currentColor" aria-hidden="true" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="dropdown__star"
                        aria-label={`Make ${o.label} the default`}
                        title={o.disabled ? o.disabled : `Make ${o.label} the default`}
                        disabled={Boolean(o.disabled)}
                        onClick={(e) => {
                          e.stopPropagation(); // the star sets the default; it does not choose
                          setDefault(o.value);
                        }}
                      >
                        <Star aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
                {!shown.length ? <div className="dropdown__none">No match</div> : null}
              </div>
              {current?.disabled ? (
                <div className="dropdown__hint" role="status">
                  {current.disabled}
                </div>
              ) : null}
              <button type="button" id={optionId(shown.length)} className="dropdown__add" data-active={active === shown.length ? "" : undefined} tabIndex={-1} onMouseMove={() => active !== shown.length && setActive(shown.length)} onClick={add}>
                <PlusIcon aria-hidden="true" />
                {addLabel}
              </button>
            </>
          )}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
