import { cn } from '@/lib/utils';

/**
 * QueryPilot mark: a "Q" ring (the question) whose tail is a pilot's navigation arrow,
 * around a lavender core (the verified answer).
 */
export function LogoMark({ size = 40, variant = 'lime', className }: { size?: number; variant?: 'lime' | 'ink'; className?: string }) {
  const tile = variant === 'lime' ? '#d6f26a' : '#1d1d1f';
  const ink = variant === 'lime' ? '#1d1d1f' : '#d6f26a';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden className={cn('shrink-0', className)}>
      <rect width="64" height="64" rx="19" fill={tile} />
      <path d="M34.25 39.56A14.5 14.5 0 1 1 39.56 34.25" stroke={ink} strokeWidth="6.5" strokeLinecap="round" className="qp-logo-ring" />
      <path d="M52 52 46.7 33.26 43.51 43.51 33.26 46.7Z" fill={ink} stroke={ink} strokeWidth="2.5" strokeLinejoin="round" className="qp-logo-arrow" />
      <circle cx="27" cy="27" r="5" fill="#7c6cf0" className="qp-logo-core" />
      <circle cx="25.4" cy="25.4" r="1.6" fill="#fff" fillOpacity="0.85" />
    </svg>
  );
}

export function Wordmark({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  return (
    <span className={cn('text-[19px] leading-none tracking-[-0.04em]', className)}>
      <span className={cn('font-medium', tone === 'light' ? 'text-white' : 'text-[#1d1d1f]')}>query</span>
      <span className={cn('font-bold', tone === 'light' ? 'text-[#d6f26a]' : 'text-[#7c6cf0]')}>pilot</span>
    </span>
  );
}
