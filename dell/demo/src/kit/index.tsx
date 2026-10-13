import * as RDialog from "@radix-ui/react-dialog";
import * as RMenu from "@radix-ui/react-dropdown-menu";
import * as RPop from "@radix-ui/react-popover";
import * as RTip from "@radix-ui/react-tooltip";
import { ChevronRight, Info, MoreVertical, Plus, Search, Star, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Tone } from "../data/types";

/* One of each part (rulebook §14). */

export function Button({
  variant = "default", icon: Icon, children, className, type = "button", ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger"; icon?: LucideIcon }) {
  return (
    <button type={type} className={["btn", variant !== "default" && `btn--${variant}`, className].filter(Boolean).join(" ")} {...rest}>
      {Icon ? <Icon className="btn__ico" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** An icon-only control always carries a visible-on-hover name (every icon has a label). */
export function IconButton({ icon: Icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <Tip text={label}>
      <button type="button" aria-label={label} className={["iconbtn", className].filter(Boolean).join(" ")} {...rest}>
        <Icon aria-hidden />
      </button>
    </Tip>
  );
}

export function Pill({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function TipProvider({ children }: { children: ReactNode }) {
  return <RTip.Provider delayDuration={250}>{children}</RTip.Provider>;
}

export function Tip({ text, children, side = "top" }: { text: ReactNode; children: ReactNode; side?: "top" | "bottom" | "right" | "left" }) {
  return (
    <RTip.Root>
      <RTip.Trigger asChild>{children}</RTip.Trigger>
      <RTip.Portal>
        <RTip.Content className="tip" side={side} sideOffset={6} collisionPadding={8}>
          {text}
        </RTip.Content>
      </RTip.Portal>
    </RTip.Root>
  );
}

/** Explanations live under (i), never as subtitles (the owner, 11 Oct). A click opens it too,
 *  so keyboard and touch reach it. */
export function InfoTip({ text }: { text: ReactNode }) {
  return (
    <RPop.Root>
      <RPop.Trigger asChild>
        <button type="button" className="infotip" aria-label="More about this">
          <Info aria-hidden />
        </button>
      </RPop.Trigger>
      <RPop.Portal>
        <RPop.Content className="pop pop--note" side="bottom" align="start" sideOffset={6} collisionPadding={8}>
          {text}
        </RPop.Content>
      </RPop.Portal>
    </RPop.Root>
  );
}

/** Never hide a command: a control that can't be used now is disabled, and its reason shows on
 *  hover, focus or click (rulebook §14, fixed rule 7). */
export function Disabled({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <Tip text={reason}>
      <span className="disabled-wrap" tabIndex={0} aria-label={reason}>
        {children}
      </span>
    </Tip>
  );
}

export interface DDOption { value: string; label: string; icon?: LucideIcon; disabled?: string }

/** The one dropdown: search at the top, a star for the default, Add new… at the bottom, the
 *  current choice highlighted (no tick), about five rows then it scrolls. */
export function Dropdown({
  value, options, onChange, trigger, star, onStar, addLabel = "Add new…", onAdd, align = "start", width = 280,
}: {
  value: string | string[];
  options: DDOption[];
  onChange: (v: string) => void;
  trigger: ReactNode;
  star?: string;
  onStar?: (v: string) => void;
  addLabel?: string;
  onAdd?: () => void;
  align?: "start" | "end";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const chosen = Array.isArray(value) ? value : [value];
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <RPop.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <RPop.Trigger asChild>{trigger}</RPop.Trigger>
      <RPop.Portal>
        <RPop.Content className="pop dd" align={align} sideOffset={6} collisionPadding={8} style={{ width }}>
          <label className="dd__search">
            <Search aria-hidden />
            <input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search options" />
          </label>
          <div className="dd__list" role="listbox">
            {shown.length === 0 ? <div className="dd__none">Nothing matches “{q}”.</div> : null}
            {shown.map((o) => {
              const row = (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={chosen.includes(o.value)}
                  aria-disabled={!!o.disabled}
                  tabIndex={o.disabled ? -1 : 0}
                  className={["dd__opt", chosen.includes(o.value) && "dd__opt--on", o.disabled && "dd__opt--off"].filter(Boolean).join(" ")}
                  onClick={() => { if (!o.disabled) { onChange(o.value); setOpen(false); } }}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !o.disabled) { e.preventDefault(); onChange(o.value); setOpen(false); } }}
                >
                  {o.icon ? <o.icon className="dd__ico" aria-hidden /> : null}
                  <span className="dd__label">{o.label}</span>
                  {o.disabled ? <span className="dd__why">{o.disabled}</span> : null}
                  {onStar && !o.disabled ? (
                    <button
                      type="button"
                      className={["dd__star", star === o.value && "dd__star--on"].filter(Boolean).join(" ")}
                      aria-label={star === o.value ? "Default" : "Make default"}
                      onClick={(e) => { e.stopPropagation(); onStar(o.value); }}
                    >
                      <Star aria-hidden />
                    </button>
                  ) : null}
                </div>
              );
              return row;
            })}
          </div>
          <button type="button" className="dd__add" onClick={() => { setOpen(false); onAdd?.(); }} disabled={!onAdd}>
            <Plus aria-hidden /> {addLabel}
          </button>
        </RPop.Content>
      </RPop.Portal>
    </RPop.Root>
  );
}

export interface MenuEntry { label: string; icon?: LucideIcon; onSelect?: () => void; danger?: boolean; disabled?: string; sub?: MenuEntry[] }

function entries(items: MenuEntry[]) {
  return items.map((m) =>
    m.sub ? (
      <RMenu.Sub key={m.label}>
        <RMenu.SubTrigger className="menu__item">
          {m.icon ? <m.icon aria-hidden /> : <span className="menu__gap" />}
          <span>{m.label}</span>
          <ChevronRight className="menu__more" aria-hidden />
        </RMenu.SubTrigger>
        <RMenu.Portal>
          <RMenu.SubContent className="pop menu" sideOffset={4} collisionPadding={8}>
            {entries(m.sub)}
          </RMenu.SubContent>
        </RMenu.Portal>
      </RMenu.Sub>
    ) : (
      <RMenu.Item
        key={m.label}
        className={["menu__item", m.danger && "menu__item--danger"].filter(Boolean).join(" ")}
        disabled={!!m.disabled}
        onSelect={m.onSelect}
      >
        {m.icon ? <m.icon aria-hidden /> : <span className="menu__gap" />}
        <span>{m.label}</span>
        {m.disabled ? <span className="menu__why">{m.disabled}</span> : null}
      </RMenu.Item>
    ),
  );
}

/** The one "more" glyph is ⋮, everywhere. */
export function More({ items, label = "More", trigger }: { items: MenuEntry[]; label?: string; trigger?: ReactNode }) {
  return (
    <RMenu.Root modal={false}>
      <RMenu.Trigger asChild>
        {trigger ?? (
          <button type="button" className="iconbtn" aria-label={label}>
            <MoreVertical aria-hidden />
          </button>
        )}
      </RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content className="pop menu" align="end" sideOffset={6} collisionPadding={8}>
          {entries(items)}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}

export function Dialog({
  open, onOpenChange, title, children, actions, wide,
}: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="dialog__scrim" />
        <RDialog.Content className={["dialog", wide && "dialog--wide"].filter(Boolean).join(" ")} aria-describedby={undefined}>
          <RDialog.Title className="dialog__title">{title}</RDialog.Title>
          <div className="dialog__body">{children}</div>
          {actions ? <div className="dialog__actions">{actions}</div> : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Delete is never one click: a dialog that says exactly what happens. */
export function Confirm({
  open, onOpenChange, title, body, action, onConfirm, danger = true,
}: { open: boolean; onOpenChange: (o: boolean) => void; title: string; body: ReactNode; action: string; onConfirm: () => void; danger?: boolean }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      actions={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); onOpenChange(false); }}>{action}</Button>
        </>
      }
    >
      <p>{body}</p>
    </Dialog>
  );
}

export function Card({ title, icon: Icon, info, actions, children, className }: { title?: ReactNode; icon?: LucideIcon; info?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={["card", className].filter(Boolean).join(" ")}>
      {title ? (
        <header className="card__head">
          {Icon ? <Icon className="card__ico" aria-hidden /> : null}
          <h2 className="card__title">{title}</h2>
          {info ? <InfoTip text={info} /> : null}
          <span className="card__actions">{actions}</span>
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function MetricTile({
  icon: Icon, label, value, basis, attention, onOpen,
}: { icon: LucideIcon; label: string; value: ReactNode; basis: string; attention?: boolean; onOpen?: () => void }) {
  const body = (
    <>
      <span className={["metric__ico", attention && "metric__ico--warn"].filter(Boolean).join(" ")}><Icon aria-hidden /></span>
      <span className="metric__text">
        <span className="metric__label">{label}</span>
        <span className="metric__row">
          <span className="metric__num">{value ?? "—"}</span>
          <span className="metric__basis">{basis}</span>
        </span>
      </span>
    </>
  );
  return onOpen ? (
    <button type="button" className="metric metric--btn" onClick={onOpen}>{body}</button>
  ) : (
    <div className="metric">{body}</div>
  );
}

/** The header's section switch. It measures the room in the header, never its own width, and
 *  drops to icons only when the labels would not fit; it never wraps (fixed rule 4). */
export function Switch({ tabs, active, onPick }: { tabs: { id: string; label: string; icon: LucideIcon }[]; active: string; onPick: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [iconsOnly, setIconsOnly] = useState(false);
  const need = useMemo(() => tabs.reduce((n, t) => n + t.label.length * 9.5 + 62, 24), [tabs]);
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const check = () => setIconsOnly(host.clientWidth - 40 < need);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(host);
    return () => ro.disconnect();
  }, [need]);
  return (
    <div ref={ref} className="switch" role="tablist">
      {tabs.map((t) => {
        const btn = (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === active}
            aria-label={t.label}
            className={["switch__tab", t.id === active && "switch__tab--on"].filter(Boolean).join(" ")}
            onClick={() => onPick(t.id)}
          >
            <t.icon aria-hidden />
            {iconsOnly ? null : <span>{t.label}</span>}
          </button>
        );
        return iconsOnly ? <Tip key={t.id} text={t.label} side="bottom">{btn}</Tip> : btn;
      })}
    </div>
  );
}

/** A small accent line of confirmation near the action; no toasts (fixed rule 17). */
export function useFlash(ms = 2600): [string | null, (s: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), ms);
    return () => clearTimeout(t);
  }, [msg, ms]);
  return [msg, setMsg];
}

export function Flash({ msg }: { msg: string | null }) {
  return (
    <span className="flash" role="status" aria-live="polite">
      {msg}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
