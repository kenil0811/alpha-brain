import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

/** A menu on a trigger, with focus, Escape, outside-click and arrow keys handled (Radix).
 *  `open`/`onOpenChange` hand the opening to the caller (a name that opens its menu on a
 *  single click only after a beat, so a double click can rename instead, or a right-click opens it). */
export function Menu({ trigger, children, align = "end", open, onOpenChange }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end"; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <DropdownMenu.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu__list" align={align} sideOffset={4}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <DropdownMenu.Label className="menu__head">{children}</DropdownMenu.Label>;
}

export function MenuItem({ children, onSelect, danger }: { children: ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <DropdownMenu.Item className={`menu__item${danger ? " menu__item--danger" : ""}`} onSelect={onSelect}>
      {children}
    </DropdownMenu.Item>
  );
}
