'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function Panel({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('panel', className)} {...rest}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="panel-header">
      <div className="min-w-0">
        <h2 className="panel-title">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = 'default' | 'primary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: boolean;
}

export function Button({ variant = 'default', icon = false, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={clsx(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'ghost' && 'btn-ghost',
        icon && 'btn-icon',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly badge?: ReactNode;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange(id: T): void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={clsx('flex gap-1 overflow-x-auto rounded-xl bg-black/25 p-1 no-scrollbar', className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={clsx(
              'relative flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              active ? 'text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {active ? (
              <motion.span
                layoutId="tab-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg bg-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]"
              />
            ) : null}
            <span className="relative flex items-center justify-center gap-1.5">
              {item.label}
              {item.badge}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm text-[var(--text-primary)]">{label}</span>
        {hint ? <span className="block text-xs text-[var(--text-muted)]">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-transparent bg-[#3b6fd4]' : 'border-white/10 bg-white/[0.07]',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          className={clsx(
            'absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow',
            checked ? 'left-[calc(100%-1.375rem)]' : 'left-1',
          )}
          style={{ height: '1.125rem', width: '1.125rem' }}
        />
      </button>
    </label>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  ...rest
}: {
  value: T;
  onChange(next: T): void;
  options: readonly { value: T; label: string }[];
  label?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  return (
    <label className={clsx('block', className)}>
      {label ? <span className="stat-label mb-1 block">{label}</span> : null}
      <select
        className="input cursor-pointer appearance-none bg-[var(--surface-2)] pr-8"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--surface-2)]">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(next: number): void;
  label: string;
  format?(value: number): string;
}) {
  return (
    <div className="py-1.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm text-[var(--text-primary)]">{label}</span>
        <span className="font-mono text-xs text-[var(--text-secondary)]">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#6ea8fe]"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-[var(--accent)]',
        className,
      )}
      aria-hidden
    />
  );
}

export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="text-2xl opacity-50">{icon}</div> : null}
      <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
      {body ? <p className="max-w-xs text-xs leading-relaxed text-[var(--text-muted)]">{body}</p> : null}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[rgba(229,72,77,0.35)] bg-[rgba(229,72,77,0.10)] px-3 py-2 text-xs leading-relaxed text-[#ffb4b6]">
      {children}
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-[#5f9bfa] to-[#26c6da]"
        animate={{ width: `${percent}%` }}
        transition={{ type: 'spring', stiffness: 160, damping: 26 }}
      />
    </div>
  );
}
