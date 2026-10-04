import * as RadixPopover from "@radix-ui/react-popover";
import type { ReactNode } from "react";

/** A small panel on a trigger for controls that stay open while used (checkboxes, arrows);
 *  focus, Escape and outside-click handled (Radix). */
export function Popover({ trigger, children, label, align = "end", open, onOpenChange }: { trigger: ReactNode; children: ReactNode; label: string; align?: "start" | "end"; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content className="menu__list" align={align} sideOffset={4} aria-label={label}>
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
