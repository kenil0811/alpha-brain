import type { ButtonHTMLAttributes, ReactNode } from "react";

/** The one button: a plain action, the primary one, a quiet one, or a dangerous one. */
export function Button({
  variant = "default",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "md" | "sm";
  icon?: ReactNode;
}) {
  const classes = ["btn", size === "sm" ? "btn--sm" : "", variant !== "default" ? `btn--${variant}` : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon ? (
        <span className="btn__ico" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
