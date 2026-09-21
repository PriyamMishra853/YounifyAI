import { Link } from 'react-router'
import { MODALITIES } from '@younifyai/shared'

export function PrismMark({ className = 'h-7 w-7', tone = 'dark' }) {
  const bg = tone === 'dark' ? '#0D2B45' : '#16202A'
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill={bg} />
      <path d="M32 13 51 47H13Z" fill="none" stroke="#F4A900" strokeWidth="4" strokeLinejoin="round" />
      <path d="M5 35 25 31.5" stroke="#8FA3B8" strokeWidth="3" strokeLinecap="round" />
      <path d="M40 29 58 23M41 33.5 58 33.5M40 38 58 44" stroke="#F4A900" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ to = '/', tone = 'dark', className = '' }) {
  return (
    <Link to={to} className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="YounifyAI home">
      <PrismMark tone={tone} />
      <span className={`font-display text-[1.28rem] font-bold tracking-[-0.03em] ${tone === 'dark' ? 'text-paper' : 'text-ink'}`}>
        Younify<span className={tone === 'dark' ? 'text-amber' : 'text-amber-ink'}>AI</span>
      </span>
    </Link>
  )
}

/** Small colored chip naming an input type. Color is the modality's, everywhere. */
export function ModalityChip({ kind, tone = 'dark', children }) {
  const m = MODALITIES[kind] || MODALITIES.docs
  return (
    <span
      className="chip"
      style={{
        color: tone === 'dark' ? '#EEF2F6' : '#16202A',
        background: `color-mix(in srgb, ${m.hex} ${tone === 'dark' ? 22 : 14}%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${m.hex} 55%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.hex }} />
      {children || m.label}
    </span>
  )
}
