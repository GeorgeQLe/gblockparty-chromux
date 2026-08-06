import React, { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";

export type ButtonTone = "default" | "primary" | "danger" | "quiet";

export function Button({
  icon: Icon,
  tone = "default",
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  tone?: ButtonTone;
  loading?: boolean;
}) {
  return <button
    {...props}
    className={`ui-button tone-${tone} ${loading ? "is-loading" : ""} ${className}`}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
  >
    {Icon && <Icon aria-hidden="true" size={16} strokeWidth={1.8} />}
    <span>{loading ? "Working…" : children}</span>
  </button>;
}

export function IconButton({
  label,
  icon: Icon,
  tone = "quiet",
  className = "",
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string;
  icon: LucideIcon;
  tone?: ButtonTone;
}) {
  return <button
    {...props}
    className={`ui-icon-button tone-${tone} ${className}`}
    aria-label={label}
    title={props.title ?? label}
  ><Icon aria-hidden="true" size={17} strokeWidth={1.8} /></button>;
}

export function Tabs<T extends string>({
  label,
  value,
  items,
  onChange,
  className = ""
}: {
  label: string;
  value: T;
  items: Array<{ value: T; label: string; icon?: LucideIcon }>;
  onChange(value: T): void;
  className?: string;
}) {
  return <nav className={`ui-tabs ${className}`} aria-label={label}>
    {items.map((item) => {
      const Icon = item.icon;
      return <button
        key={item.value}
        className={value === item.value ? "active" : ""}
        aria-current={value === item.value ? "page" : undefined}
        onClick={() => onChange(item.value)}
        title={item.label}
      >
        {Icon && <Icon aria-hidden="true" size={16} strokeWidth={1.8} />}
        <span>{item.label}</span>
      </button>;
    })}
  </nav>;
}

export function Field({
  label,
  hint,
  children,
  className = ""
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return <label className={`ui-field ${className}`}>
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>;
}

export function Badge({
  tone = "neutral",
  children,
  className = ""
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "sage";
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`ui-badge badge-${tone} ${className}`}>{children}</span>;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return <section className="ui-empty-state">
    {Icon && <Icon aria-hidden="true" size={24} strokeWidth={1.5} />}
    <h3>{title}</h3>
    <p>{description}</p>
    {action}
  </section>;
}

export function Toolbar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`ui-toolbar ${className}`}>{children}</div>;
}

export function Panel({
  title,
  eyebrow,
  actions,
  children,
  className = ""
}: {
  title?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`ui-panel ${className}`}>
    {(title || actions) && <header>
      <div>{eyebrow && <span>{eyebrow}</span>}{title && <h2>{title}</h2>}</div>
      {actions}
    </header>}
    {children}
  </section>;
}

export function Dialog({
  title,
  eyebrow,
  description,
  close,
  children,
  footer,
  className = "",
  initialFocus,
  dismissible = true
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  close(): void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  initialFocus?: React.RefObject<HTMLElement | null>;
  dismissible?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    const root = dialog.current;
    if (!root) return;
    const focusable = () => [...root.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
    )].filter((item) => !item.hasAttribute("disabled") && !item.getAttribute("aria-hidden"));
    (initialFocus?.current ?? focusable()[0])?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey
        ? (index <= 0 ? items.length - 1 : index - 1)
        : (index >= items.length - 1 ? 0 : index + 1);
      event.preventDefault();
      items[next]?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnFocus.current?.focus();
    };
  }, [close, dismissible, initialFocus]);

  return <div className="modal-backdrop" onMouseDown={dismissible ? close : undefined}>
    <div
      ref={dialog}
      className={`ui-dialog ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header>
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        {dismissible && <IconButton label={`Close ${title}`} icon={X} onClick={close} />}
      </header>
      <div className="ui-dialog-content">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  </div>;
}
