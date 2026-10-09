import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "./icons";
import { Tooltip } from "./Tooltip";

export interface ContextItem {
  label: string;
  icon?: ReactNode;
  /** What it does; an item with `children` opens them instead. */
  onSelect?: () => void;
  /** A submenu ("Download ›" CSV, Excel…), opened by hover, a click or ArrowRight. */
  children?: ContextItem[];
  /** The reason it cannot be done now; the item stays visible, greyed, and says why on hover. */
  disabled?: string;
  danger?: boolean;
  separatorBefore?: boolean;
  /** An on/off setting ("Wrap text"): a switch at the item's end shows it, never a tick. */
  on?: boolean;
}

/** One menu for a right-click and for a ⋮ button (the UI rulebook §6 and §14). It opens at a
 *  point: the pointer for a right-click, under the button for ⋮, beside the focused element for
 *  Shift+F10 or the ContextMenu key. Built on the Radix dropdown menu, so Escape and a click
 *  outside close it, the arrow keys move, and it stays inside the window.
 *
 *  `useContextMenu(items)` gives `bind(target)` (spread on the row, cell or header) and `menu`
 *  (render it anywhere; it draws nothing until open), plus `openFrom(target, element)` for a ⋮
 *  button. An item with `children` is a submenu. `items` may be a function of the target, so one menu serves every row of a table.
 *  (9 Oct, the UI rulebook phase 1.) */
export function useContextMenu<T = void>(items: ContextItem[] | ((target: T) => ContextItem[])) {
  const [at, setAt] = useState<{ x: number; y: number; target: T } | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const openAt = (target: T, x: number, y: number, from: HTMLElement | null) => {
    opener.current = from;
    setAt({ x, y, target });
  };
  /** Under the element (a ⋮ button), or beside it (`"right"`, a side submenu such as Download ›). */
  const openFrom = (target: T, element: HTMLElement, side: "below" | "right" = "below") => {
    const r = element.getBoundingClientRect();
    if (side === "right") openAt(target, r.right, r.top, element);
    else openAt(target, r.left, r.bottom, element);
  };
  const bind = (target: T) => ({
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      openAt(target, e.clientX, e.clientY, e.currentTarget);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // only the element that has the focus answers, not a row for a key pressed in a field inside it
      if (e.target !== e.currentTarget) return;
      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        openAt(target, r.left + 8, r.top + Math.min(r.height, 32), e.currentTarget);
      }
    },
  });

  const list = at ? (typeof items === "function" ? items(at.target) : items) : [];
  const menu = (
    <DropdownMenu.Root modal={false} open={Boolean(at)} onOpenChange={(o) => !o && setAt(null)}>
      {at
        ? createPortal(
            <DropdownMenu.Trigger asChild>
              <span aria-hidden="true" style={{ position: "fixed", left: at.x, top: at.y, width: 0, height: 0, pointerEvents: "none" }} />
            </DropdownMenu.Trigger>,
            document.body,
          )
        : null}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu__list"
          align="start"
          side="bottom"
          sideOffset={2}
          collisionPadding={8}
          onClick={(e) => e.stopPropagation()} // a click or right-click in the menu is not one on the row under it
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault(); // back to what had the focus, not to the invisible anchor
            opener.current?.focus?.();
          }}
        >
          {list.map((item, i) => (
            <ContextRow key={`${i}-${item.label}`} item={item} />
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
  return { bind, menu, openFrom };
}

function ContextRow({ item }: { item: ContextItem }) {
  if (item.children && !item.disabled) {
    return (
      <>
        {item.separatorBefore ? <DropdownMenu.Separator className="menu__sep" /> : null}
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger className="menu__item menu__item--sub">
            {item.icon ? (
              <span className="menu__ico" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            {item.label}
            <span className="menu__ico menu__chev" aria-hidden="true">
              <ChevronRight />
            </span>
          </DropdownMenu.SubTrigger>
          <DropdownMenu.Portal>
            <DropdownMenu.SubContent className="menu__list" sideOffset={2} collisionPadding={8}>
              {item.children.map((child, i) => (
                <ContextRow key={`${i}-${child.label}`} item={child} />
              ))}
            </DropdownMenu.SubContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Sub>
      </>
    );
  }
  const inner = (
    <>
      {item.icon ? (
        <span className="menu__ico" aria-hidden="true">
          {item.icon}
        </span>
      ) : null}
      {item.label}
    </>
  );
  const className = `menu__item${item.danger ? " menu__item--danger" : ""}`;
  const row =
    item.on === undefined ? (
      <DropdownMenu.Item className={className} disabled={Boolean(item.disabled)} onSelect={item.onSelect}>
        {inner}
      </DropdownMenu.Item>
    ) : (
      <DropdownMenu.CheckboxItem className={className} disabled={Boolean(item.disabled)} checked={item.on} onSelect={item.onSelect}>
        {inner}
        <span className={`switch menu__switch${item.on ? "" : " switch--off"}`} aria-hidden="true" />
      </DropdownMenu.CheckboxItem>
    );
  return (
    <>
      {item.separatorBefore ? <DropdownMenu.Separator className="menu__sep" /> : null}
      {item.disabled ? <Tooltip text={item.disabled}>{row}</Tooltip> : row}
    </>
  );
}

/** The same, as a wrapper, for a plain region: right-click anywhere in it, or focus it and press
 *  Shift+F10. For a table row use `useContextMenu` so the menu knows which row. */
export function ContextMenu({ items, children, className }: { items: ContextItem[]; children: ReactNode; className?: string }) {
  const { bind, menu } = useContextMenu(items);
  return (
    <div className={className} tabIndex={0} {...bind()}>
      {children}
      {menu}
    </div>
  );
}
