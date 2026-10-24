'use client';

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, interactive, ...p }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'qp-card rounded-[26px] bg-white ring-1 ring-black/[0.035]',
        interactive && 'cursor-pointer hover:-translate-y-1 active:translate-y-0 active:scale-[0.99]',
        className,
      )}
      {...p}
    />
  );
}

export function CardHeader({ title, subtitle, icon, action, className }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('group/h flex items-start justify-between gap-3 px-5 pt-5 pb-3', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-black/[0.07] text-[#1d1d1f] transition-all duration-300 group-hover/h:rotate-[-8deg] group-hover/h:border-transparent group-hover/h:bg-[#d6f26a]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-black/45">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; accent?: string }>(
  function Button({ className, variant = 'secondary', size = 'md', accent, style, ...p }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          'group/btn inline-flex items-center justify-center gap-1.5 rounded-full font-semibold whitespace-nowrap select-none transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6cf0]/40 disabled:opacity-45 disabled:pointer-events-none active:scale-[0.96]',
          size === 'sm' && 'h-8 px-3.5 text-[12.5px]',
          size === 'md' && 'h-10 px-4 text-[13px]',
          size === 'lg' && 'h-12 px-6 text-[14px]',
          variant === 'primary' && 'qp-ink-btn qp-shine text-white hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-10px_var(--qp-btn-glow)]',
          variant === 'secondary' && 'bg-white text-[#1d1d1f] ring-1 ring-black/[0.08] hover:-translate-y-0.5 hover:bg-[#d6f26a] hover:ring-transparent hover:shadow-[0_10px_22px_-12px_rgba(29,29,31,0.35)]',
          variant === 'ghost' && 'text-black/60 hover:bg-black/[0.05] hover:text-[#1d1d1f]',
          variant === 'soft' && 'bg-black/[0.05] text-[#1d1d1f] hover:bg-black/[0.09]',
          variant === 'danger' && 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100',
          className,
        )}
        style={{ ['--qp-btn-glow' as string]: accent ?? 'rgba(29,29,31,0.55)', ...style }}
        {...p}
      />
    );
  },
);

export function Badge({ children, tone = 'slate', className, dot }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'orange' | 'sky'; className?: string; dot?: boolean }) {
  const tones = {
    slate: 'bg-black/[0.05] text-black/70',
    green: 'bg-[#e9f7b4] text-[#3f5a00]',
    amber: 'bg-amber-100/80 text-amber-800',
    red: 'bg-rose-100/80 text-rose-700',
    blue: 'bg-blue-100/70 text-blue-700',
    violet: 'bg-[#ece8fd] text-[#5b47d6]',
    orange: 'bg-orange-100/80 text-orange-700',
    sky: 'bg-sky-100/80 text-sky-700',
  };
  const dots = { slate: 'bg-black/40', green: 'bg-[#86b31c]', amber: 'bg-amber-500', red: 'bg-rose-500', blue: 'bg-blue-500', violet: 'bg-[#7c6cf0]', orange: 'bg-orange-500', sky: 'bg-sky-500' };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold leading-4 whitespace-nowrap', tones[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dots[tone])} />}
      {children}
    </span>
  );
}

export function Kpi({ label, value, sub, icon, accent, trend }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: string; trend?: ReactNode }) {
  return (
    <Card className="group p-5 hover:-translate-y-1">
      <div className="flex items-center gap-2.5">
        {icon && (
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-black/[0.07] transition-all duration-300 group-hover:scale-110 group-hover:border-transparent"
            style={{ color: accent ?? '#1d1d1f', background: accent ? `${accent}14` : undefined }}
          >
            {icon}
          </span>
        )}
        <span className="text-[13px] font-semibold text-[#1d1d1f]">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[30px] font-medium leading-none tracking-tight text-[#1d1d1f] tabular-nums">{value}</span>
        {trend}
      </div>
      {sub && <div className="mt-2 text-[12px] text-black/45">{sub}</div>}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-black/[0.05]', className)} />;
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10">
      <div className="qp-float grid h-12 w-12 place-items-center rounded-full bg-[#d6f26a] text-[#1d1d1f]">{icon}</div>
      <div className="mt-3 text-[14px] font-semibold text-[#1d1d1f]">{title}</div>
      {body && <div className="mt-1 max-w-sm text-[12.5px] text-black/45">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-full bg-black/[0.05] p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all duration-200',
            value === o.value ? 'bg-[#1d1d1f] text-white shadow-sm' : 'text-black/50 hover:text-[#1d1d1f]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, accent = '#d6f26a' }: { on: boolean; onChange: (v: boolean) => void; label?: string; accent?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-[24px] w-[42px] shrink-0 items-center rounded-full transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c6cf0]/40"
      style={{ background: on ? accent : 'rgba(29,29,31,0.18)' }}
    >
      <span className={cn('inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(.2,.9,.3,1.3)]', on ? 'translate-x-[21px]' : 'translate-x-[3px]')} />
    </button>
  );
}

export const fmt = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v === null || v === undefined ? '—' : String(v));
