import type { ButtonHTMLAttributes, ReactNode } from "react";

/** A button that is only an icon: the label is required, because the icon says nothing to a
 *  screen reader and little to anyone who has not seen it before. */
export function IconButton({
  label,
  icon,
  size = "md",
  className,
  type = "button",
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string;
  icon: ReactNode;
  size?: "md" | "sm";
}) {
  const classes = ["iconbtn", size === "sm" ? "iconbtn--sm" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button type={type} className={classes} aria-label={label} title={rest.title ?? label} {...rest}>
      <span aria-hidden="true" className="iconbtn__ico">
        {icon}
      </span>
    </button>
  );
}
