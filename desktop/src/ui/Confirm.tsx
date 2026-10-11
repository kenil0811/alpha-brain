import type { ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

/** A yes-or-no before something that cannot be undone: the question, what it means, two
 *  buttons, Cancel then the dangerous one named for what it does ("Remove 3 rows"), never "OK" (§14). */
export function Confirm({ open, title, children, action, danger = true, onConfirm, onCancel }: { open: boolean; title: string; children?: ReactNode; action: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()} title={title}>
      {children ? <div className="dialog__body">{children}</div> : null}
      <div className="row dialog__actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} autoFocus>
          {action}
        </Button>
      </div>
    </Dialog>
  );
}
