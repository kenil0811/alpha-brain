import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Reason } from "./Reason";

/** A button that is only an icon: the label is required, because the icon says nothing to a
 *  screen reader and little to anyone who has not seen it before. `disabledReason` disables it
 *  and says why on hover and on keyboard focus (§14). */
export function IconButton({
  label,
  icon,
  size = "md",
  className,
  type = "button",
  disabled,
  disabledReason,
  title,
  "aria-describedby": described,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string;
  icon: ReactNode;
  size?: "md" | "sm";
  disabledReason?: string;
}) {
  const classes = ["iconbtn", size === "sm" ? "iconbtn--sm" : "", className ?? ""].filter(Boolean).join(" ");
  const button = (describedBy?: string) => (
    <button type={type} className={classes} aria-label={label} title={disabledReason ? undefined : (title ?? label)} disabled={disabled || Boolean(disabledReason)} aria-describedby={[described, describedBy].filter(Boolean).join(" ") || undefined} {...rest}>
      <span aria-hidden="true" className="iconbtn__ico">
        {icon}
      </span>
    </button>
  );
  return disabledReason ? <Reason reason={disabledReason} render={button} /> : button();
}
