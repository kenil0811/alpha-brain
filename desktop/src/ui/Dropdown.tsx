import * as RadixPopover from "@radix-ui/react-popover";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Check, ChevronDown, PlusIcon, Star } from "./icons";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** The reason this option cannot be picked right now; it shows when the option is hovered or
   *  reached by the arrow keys. */
  disabled?: string;
}

/** More options than this and the list gets a search box (the UI rulebook §14). */
const SEARCH_ABOVE = 7;

/** The one standard single-select, in place of the browser's native `<select>` (the UI rulebook
 *  §14 and §17): the selected option comes first, marked with a check; a search box above
 *  seven options; about five rows show and the list scrolls; an optional "Add…" row is pinned at
 *  the bottom. From the keyboard: arrows move, Enter picks, Escape closes, typing searches (a
 *  box when there is one, otherwise a jump to the option that starts with what was typed).
 *  Built on a Radix popover, so it stays inside the window. (9 Oct, the UI rulebook phase 1.)
 *  Star defaults (§14): given `onSetDefault`, every option carries a star; a filled one marks the
 *  person's default, an outline one (shown on hover or focus) makes that option the default
 *  without choosing it. The stars are buttons, so Tab reaches them. */
export function Dropdown<T extends string = string>({
  value,
  options,
  onChange,
  label,
  placeholder = "Choose…",
  onAdd,
  addLabel = "Add…",
  size = "md",
  className,
  id,
  defaultOpen,
  onOpenChange,
  icon,
  defaultValue,
  onSetDefault,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** What this chooses, for assistive technology ("Group by"). */
  label: string;
  placeholder?: string;
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
  /** The person's default option, marked with a filled star when `onSetDefault` is given. */
  defaultValue?: string;
  /** Makes an option the default (the star); it does not choose the option. */
  onSetDefault?: (value: T) => void;
}) {
  const [open, setOpenState] = useState(Boolean(defaultOpen));
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const typed = useRef({ text: "", at: 0 });
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const searchable = options.length > SEARCH_ABOVE;
  const selected = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const ordered = selected ? [selected, ...options.filter((o) => o !== selected)] : options;
    const q = query.trim().toLowerCase();
    return q ? ordered.filter((o) => o.label.toLowerCase().includes(q)) : ordered;
  }, [options, selected, query]);
  const rows = shown.length + (onAdd ? 1 : 0);
  const optionId = (i: number) => `${uid}-o${i}`;

  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next) {
      setQuery("");
      setActive(0);
    }
    onOpenChange?.(next);
  };
  const pick = (option: DropdownOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };
  const add = () => {
    setOpen(false);
    onAdd?.();
  };

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  });

  const move = (to: number) => setActive(Math.max(0, Math.min(rows - 1, to)));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation(); // a row or a cell behind this must not hear the keys
    if ((e.target as HTMLElement).closest?.(".dropdown__star")) return; // a star hears its own Enter and Space
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(rows - 1);
    else if (e.key === "Enter" || (e.key === " " && !searchable && !typed.current.text)) {
      if (active < shown.length) pick(shown[active]);
      else if (onAdd && rows) add();
    } else if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    } else return;
    e.preventDefault();
  };

  const current = active < shown.length ? shown[active] : undefined;
  const valueId = `${uid}-value`;
  const listId = `${uid}-list`;
  const activeId = rows ? optionId(active) : undefined;
  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button type="button" id={id} role="combobox" aria-haspopup="listbox" aria-label={label} aria-describedby={valueId} className={["btn", size === "sm" ? "btn--sm" : "", "dropdown__trigger", className ?? ""].filter(Boolean).join(" ")} onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } }}>
          {icon ? (
            <span className="dropdown__tico" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <span id={valueId} className={`dropdown__value${selected ? "" : " dropdown__value--placeholder"}`}>
            {selected ? selected.label : placeholder}
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
            (searchRef.current ?? listRef.current)?.focus();
          }}
        >
          {searchable ? (
            <input
              ref={searchRef}
              className="dropdown__search"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={activeId}
              aria-label={`Search ${label}`}
              placeholder="Search…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
            />
          ) : null}
          <div ref={listRef} id={listId} className="dropdown__list" role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={searchable ? undefined : activeId}>
            {shown.map((o, i) => (
              <div
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={o === selected}
                aria-disabled={o.disabled ? true : undefined}
                data-active={i === active ? "" : undefined}
                className="dropdown__opt"
                onMouseMove={() => active !== i && setActive(i)}
                onClick={() => pick(o)}
              >
                <span className="dropdown__check" aria-hidden="true">
                  {o === selected ? <Check /> : null}
                </span>
                {o.icon ? (
                  <span className="dropdown__ico" aria-hidden="true">
                    {o.icon}
                  </span>
                ) : null}
                <span className="dropdown__label">{o.label}</span>
                {onSetDefault ? (
                  o.value === defaultValue ? (
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
                        onSetDefault(o.value);
                      }}
                    >
                      <Star aria-hidden="true" />
                    </button>
                  )
                ) : null}
              </div>
            ))}
            {!shown.length ? <div className="dropdown__none">No match</div> : null}
          </div>
          {current?.disabled ? (
            <div className="dropdown__hint" role="status">
              {current.disabled}
            </div>
          ) : null}
          {onAdd ? (
            <button type="button" id={optionId(shown.length)} className="dropdown__add" data-active={active === shown.length ? "" : undefined} tabIndex={-1} onMouseMove={() => active !== shown.length && setActive(shown.length)} onClick={add}>
              <PlusIcon aria-hidden="true" />
              {addLabel}
            </button>
          ) : null}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
