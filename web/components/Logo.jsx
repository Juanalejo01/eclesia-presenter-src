export default function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <defs>
        <linearGradient id="lg-mono-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2718" />
          <stop offset="100%" stopColor="#1a1410" />
        </linearGradient>
        <linearGradient id="lg-mono-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5dec8" />
          <stop offset="50%" stopColor="#db9f75" />
          <stop offset="100%" stopColor="#804012" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="34" height="34" rx="9" fill="url(#lg-mono-bg)" stroke="url(#lg-mono-stroke)" strokeWidth="1" />
      <g stroke="url(#lg-mono-stroke)" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M11 9.5 V26.5" />
        <path d="M11 9.5 H24" />
        <path d="M11 18 H21" />
        <path d="M11 26.5 H24" />
      </g>
      <circle cx="26.5" cy="11" r="1.2" fill="#f5dec8" opacity="0.9" />
    </svg>
  )
}
