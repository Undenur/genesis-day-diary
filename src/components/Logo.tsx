/** Знак MOMENTA: две перекрывающиеся рамки кадра и мягкая дуга звуковой волны. */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="6" y="9" width="24" height="24" rx="5.5" fill="none" stroke="#AAB8CB" strokeWidth="3" />
      <rect x="17" y="15" width="25" height="25" rx="5.5" fill="#1C2A40" stroke="#91A9D1" strokeWidth="3" />
      <path d="M21.5 29.5 C24 24.5 26.5 24.5 29.5 29.5 S35 34.5 37.5 29.5" fill="none" stroke="#EDF2FA" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={30} />
      <span className="text-[19px] tracking-[0.14em]" style={{ fontFamily: 'var(--font-brand)' }}>
        MOMENTA
      </span>
    </span>
  );
}
