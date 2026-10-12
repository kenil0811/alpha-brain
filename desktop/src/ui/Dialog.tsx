import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

/** A dialog over the page: focus kept inside, Escape and the overlay close it. `bare` is the
 *  lightbox shape (an image on a dark field) rather than a card. */
export function Dialog({ open, onOpenChange, title, children, bare, className, hideTitle }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode; bare?: boolean; className?: string; /** The title is for assistive technology only (a peek that shows a page with its own). */ hideTitle?: boolean }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog__overlay" />
        <RadixDialog.Content className={[bare ? "dialog dialog--bare" : "dialog", className ?? ""].filter(Boolean).join(" ")} aria-describedby={undefined}>
          <RadixDialog.Title className={bare || hideTitle ? "sr-only" : "dialog__title"}>{title}</RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
