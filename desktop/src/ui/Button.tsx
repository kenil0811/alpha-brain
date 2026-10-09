import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Reason } from "./Reason";

/** The one button family (the UI rulebook §14): `default` is outlined, the most common;
 *  `primary` is solid accent, at most one per area; `ghost` is for low emphasis; `danger` is red
 *  text on a red-tinted border (solid red when it confirms inside a dialog, by CSS). All are
 *  compact. `disabledReason` disables it and says why on hover and on keyboard focus: what
 *  cannot be done is never hidden. */
export function Button({
  variant = "default",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  disabled,
  disabledReason,
  "aria-describedby": described,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "md" | "sm";
  icon?: ReactNode;
  disabledReason?: string;
}) {
  const classes = ["btn", size === "sm" ? "btn--sm" : "", variant !== "default" ? `btn--${variant}` : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const button = (describedBy?: string) => (
    <button type={type} className={classes} disabled={disabled || Boolean(disabledReason)} aria-describedby={[described, describedBy].filter(Boolean).join(" ") || undefined} {...rest}>
      {icon ? (
        <span className="btn__ico" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
  return disabledReason ? <Reason reason={disabledReason} render={button} /> : button();
}
