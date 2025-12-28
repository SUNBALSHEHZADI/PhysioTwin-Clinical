export function ClinicalHeroIllustration() {
  // Inline SVG illustration (no external asset dependency)
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-sky-50 to-white shadow-soft">
      <svg viewBox="0 0 800 520" className="h-full w-full">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e0f2fe" />
            <stop offset="1" stopColor="#ffffff" />
          </linearGradient>
          <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0ea5a4" stopOpacity="0.22" />
            <stop offset="1" stopColor="#0ea5a4" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="800" height="520" fill="url(#g1)" />

        {/* Calm clinical waves */}
        <path
          d="M0,360 C120,330 220,410 340,380 C460,350 560,430 800,390 L800,520 L0,520 Z"
          fill="url(#g2)"
        />

        {/* Simple “patient + joints” abstract */}
        <circle cx="540" cy="175" r="54" fill="#0f172a" opacity="0.08" />
        <circle cx="540" cy="172" r="48" fill="#ffffff" />

        <path
          d="M520 228 C515 265 505 315 488 352 C470 390 448 420 420 450"
          stroke="#0f172a"
          strokeOpacity="0.18"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M560 228 C566 265 575 315 592 352 C610 390 632 420 660 450"
          stroke="#0f172a"
          strokeOpacity="0.18"
          strokeWidth="18"
          strokeLinecap="round"
        />

        {/* “Joint markers” */}
        <circle cx="500" cy="330" r="10" fill="#0ea5a4" opacity="0.9" />
        <circle cx="585" cy="330" r="10" fill="#0ea5a4" opacity="0.9" />
        <circle cx="455" cy="412" r="10" fill="#0ea5a4" opacity="0.75" />
        <circle cx="630" cy="412" r="10" fill="#0ea5a4" opacity="0.75" />

        {/* “Measurement card” */}
        <rect x="80" y="110" width="280" height="210" rx="22" fill="#ffffff" stroke="#e2e8f0" />
        <rect x="110" y="150" width="220" height="14" rx="7" fill="#0f172a" opacity="0.14" />
        <rect x="110" y="180" width="180" height="12" rx="6" fill="#0f172a" opacity="0.10" />
        <rect x="110" y="215" width="220" height="18" rx="9" fill="#0ea5a4" opacity="0.22" />
        <rect x="110" y="250" width="140" height="14" rx="7" fill="#0f172a" opacity="0.10" />

        <rect x="110" y="280" width="92" height="30" rx="15" fill="#ecfeff" stroke="#cffafe" />
        <rect x="214" y="280" width="92" height="30" rx="15" fill="#fff7ed" stroke="#ffedd5" />
        <rect x="318" y="280" width="92" height="30" rx="15" fill="#fff1f2" stroke="#ffe4e6" />
      </svg>
    </div>
  );
}


