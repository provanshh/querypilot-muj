'use client';

import { cn } from '@/lib/utils';
import { gradeTone } from './theme';
import { fmt } from './ui';

export function BarList({ data, color = '#b9aaf6', max, className, valueFmt = fmt }: { data: { label: string; value: number; tone?: string }[]; color?: string; max?: number; className?: string; valueFmt?: (v: number) => string }) {
  const m = max ?? Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div className={cn('space-y-2', className)}>
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="group grid grid-cols-[minmax(80px,38%)_1fr_auto] items-center gap-3 text-[12px]">
          <span className="truncate text-black/55 transition-colors group-hover:text-[#1d1d1f]" title={d.label}>{d.label}</span>
          <div className="h-[10px] overflow-hidden rounded-full bg-black/[0.06]">
            <div
              className="qp-bar h-full rounded-full transition-[filter,transform] duration-300 group-hover:brightness-105 group-hover:scale-y-125"
              style={{ width: `${Math.max(3, (Math.abs(d.value) / m) * 100)}%`, background: d.tone ?? color, animationDelay: `${i * 50}ms` }}
            />
          </div>
          <span className="tabular-nums font-semibold text-[#1d1d1f]">{valueFmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Gauge({ score, size = 132, label, sub }: { score: number; size?: number; label?: string; sub?: string }) {
  const tone = gradeTone(score);
  const r = (size - 16) / 2;
  const c = Math.PI * r;
  const off = c * (1 - score / 100);
  return (
    <div className="group relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`} className="transition-transform duration-300 group-hover:scale-105">
        <path d={`M 8 ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 8} ${size / 2 + 4}`} fill="none" stroke="rgba(29,29,31,0.07)" strokeWidth={14} strokeLinecap="round" />
        <path
          d={`M 8 ${size / 2 + 4} A ${r} ${r} 0 0 1 ${size - 8} ${size / 2 + 4}`}
          fill="none" stroke={tone.hex} strokeWidth={14} strokeLinecap="round" strokeDasharray={c}
          className="qp-gauge-arc" style={{ ['--qp-from' as string]: c, ['--qp-to' as string]: off, strokeDashoffset: off }}
        />
      </svg>
      <div className="absolute top-[36%] flex flex-col items-center">
        <span className="text-[30px] font-medium tabular-nums tracking-tight text-[#1d1d1f]">{score}</span>
      </div>
      {label && <span className={cn('mt-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold', tone.bg, tone.text)}>{label}</span>}
      {sub && <span className="mt-1 text-[11.5px] text-black/45">{sub}</span>}
    </div>
  );
}

export function Sparkline({ values, color = '#7c6cf0', width = 140, height = 40 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const xs = values.map((_, i) => (i / (values.length - 1)) * (width - 4) + 2);
  const ys = values.map((v) => height - 4 - ((v - min) / (max - min || 1)) * (height - 8));
  const d = xs.map((x, i) => `${i ? 'L' : 'M'} ${x} ${ys[i]}`).join(' ');
  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id={`sg-${color.slice(1)}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L ${xs.at(-1)} ${height} L ${xs[0]} ${height} Z`} fill={`url(#sg-${color.slice(1)})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={xs.at(-1)} cy={ys.at(-1)} r={3} fill={color} />
    </svg>
  );
}

/** Three overlapping circles sized by value: lavender, ink and lime. */
export function Bubbles({ items }: { items: { label: string; value: number; sub: string }[] }) {
  const [a, b, c] = items;
  const max = Math.max(1, ...items.map((i) => i.value));
  const size = (v: number, lo: number, hi: number) => lo + (hi - lo) * Math.sqrt(v / max);
  const bubble = 'absolute grid place-items-center rounded-full text-center transition-all duration-500 ease-[cubic-bezier(.2,.9,.3,1.2)] hover:z-20 hover:scale-110 cursor-default qp-pop';
  return (
    <div className="relative mx-auto h-[220px] w-[250px]">
      {a && (
        <div className={cn(bubble, 'left-0 top-2 bg-[#b9aaf6] text-[#1d1d1f] hover:shadow-[0_20px_40px_-16px_rgba(124,108,240,0.7)]')} style={{ width: size(a.value, 110, 150), height: size(a.value, 110, 150) }} title={a.label}>
          <div><div className="text-[30px] font-medium leading-none tracking-tight">{fmt(a.value)}</div><div className="mt-1 text-[11px] text-black/60">{a.sub}</div></div>
        </div>
      )}
      {b && (
        <div className={cn(bubble, 'left-[118px] top-8 z-10 bg-[#1d1d1f] text-white hover:shadow-[0_20px_40px_-16px_rgba(29,29,31,0.8)]')} style={{ width: size(b.value, 92, 122), height: size(b.value, 92, 122), animationDelay: '120ms' }} title={b.label}>
          <div><div className="text-[24px] font-medium leading-none tracking-tight">{fmt(b.value)}</div><div className="mt-1 text-[11px] text-white/60">{b.sub}</div></div>
        </div>
      )}
      {c && (
        <div className={cn(bubble, 'bottom-0 left-[70px] z-10 bg-[#d6f26a] text-[#1d1d1f] ring-4 ring-white hover:shadow-[0_20px_40px_-16px_rgba(156,201,42,0.8)]')} style={{ width: size(c.value, 80, 104), height: size(c.value, 80, 104), animationDelay: '240ms' }} title={c.label}>
          <div><div className="text-[22px] font-medium leading-none tracking-tight">{fmt(c.value)}</div><div className="mt-1 text-[11px] text-black/60">{c.sub}</div></div>
        </div>
      )}
    </div>
  );
}

/** Columns of dots; each column fills `value / max` of its height. */
export function DotMatrix({ columns, rows = 7, title }: { columns: { label: string; value: number; max: number }[]; rows?: number; title?: (c: { label: string; value: number }) => string }) {
  return (
    <div className="flex items-end justify-between gap-1.5">
      {columns.map((c, ci) => {
        const filled = c.max ? Math.round((c.value / c.max) * rows) : 0;
        return (
          <div key={`${c.label}-${ci}`} className="group flex flex-col-reverse gap-1.5" title={title?.(c) ?? `${c.label}: ${c.value}`}>
            {Array.from({ length: rows }, (_, ri) => (
              <span
                key={ri}
                className={cn(
                  'qp-dot h-3 w-3 rounded-full transition-all duration-300 group-hover:scale-125',
                  ri < filled ? (ri === filled - 1 ? 'bg-[#7c6cf0]' : 'bg-[#b9aaf6]') : 'bg-[#ece8fd]',
                )}
                style={{ animationDelay: `${ci * 40 + ri * 25}ms` }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Dark-card column chart: hatched pairs per bucket, the highlighted bucket solid lime + lavender. */
export function ColumnPairs({ buckets, highlight }: { buckets: { label: string; a: number; b: number }[]; highlight: number }) {
  const max = Math.max(1, ...buckets.flatMap((x) => [x.a, x.b]));
  return (
    <div className="flex h-[150px] items-end justify-between gap-2">
      {buckets.map((x, i) => {
        const on = i === highlight;
        return (
          <div key={`${x.label}-${i}`} className="group flex flex-1 flex-col items-center gap-2" title={`${x.label}: ${x.a} answered · ${x.b} declined or failed`}>
            <div className="flex h-[120px] w-full items-end justify-center gap-1">
              <span className={cn('qp-col w-[42%] max-w-[22px] rounded-full transition-all duration-300 group-hover:brightness-125', on ? 'bg-[#d6f26a]' : 'qp-hatch')} style={{ height: `${Math.max(8, (x.a / max) * 100)}%`, animationDelay: `${i * 60}ms` }} />
              <span className={cn('qp-col w-[42%] max-w-[22px] rounded-full transition-all duration-300 group-hover:brightness-125', on ? 'bg-[#b9aaf6]' : 'qp-hatch')} style={{ height: `${Math.max(8, (x.b / max) * 100)}%`, animationDelay: `${i * 60 + 30}ms` }} />
            </div>
            <span className={cn('text-[11px] transition-colors', on ? 'font-semibold text-white' : 'text-white/45 group-hover:text-white/80')}>{x.label}</span>
          </div>
        );
      })}
    </div>
  );
}
