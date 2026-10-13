import * as RadixPopover from "@radix-ui/react-popover";
import type { ReactNode } from "react";

/** A small panel on a trigger for controls that stay open while used (checkboxes, arrows);
 *  focus, Escape and outside-click handled (Radix). `open`/`onOpenChange` let a choice inside
 *  close it (a column's Group by, 13 Oct); `side` opens it beside the trigger (the sidebar's hidden
 *  modules open to its right). */
export function Popover({ trigger, children, label, align = "end", side, open, onOpenChange }: { trigger: ReactNode; children: ReactNode; label: string; align?: "start" | "end"; side?: "right" | "bottom"; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content className="menu__list popover" align={align} side={side} sideOffset={4} collisionPadding={8} aria-label={label}>
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
