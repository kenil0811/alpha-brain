import { useId } from "react";
import type { ReactElement } from "react";
import { Tooltip } from "./Tooltip";

/** A control that cannot be used right now, with the reason (the UI rulebook §14, "never hide a
 *  command"). A disabled control receives no focus and no hover, so it sits in a focusable
 *  wrapper: the reason shows on hover and on keyboard focus, and a screen reader reads it after
 *  the control's name. `render` gets the id to put on the control as `aria-describedby`. */
export function Reason({ reason, render }: { reason: string; render: (describedBy: string) => ReactElement }) {
  const id = useId();
  return (
    <Tooltip text={reason}>
      <span className="reason" tabIndex={0}>
        {render(id)}
        <span id={id} className="sr-only">
          {reason}
        </span>
      </span>
    </Tooltip>
  );
}
