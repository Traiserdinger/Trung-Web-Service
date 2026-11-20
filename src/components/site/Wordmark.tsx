/** Ký hiệu: một con chip nhìn từ trên xuống, chân mạ vàng. */
export function ChipGlyph({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--color-solder)" />
      <rect x="9" y="9" width="14" height="14" rx="2" fill="#1b2420" />
      <circle cx="12" cy="12" r="1.1" fill="#3a4743" />
      <g fill="var(--color-enig)">
        <rect x="5" y="11" width="3" height="2" rx=".5" />
        <rect x="5" y="15" width="3" height="2" rx=".5" />
        <rect x="5" y="19" width="3" height="2" rx=".5" />
        <rect x="24" y="11" width="3" height="2" rx=".5" />
        <rect x="24" y="15" width="3" height="2" rx=".5" />
        <rect x="24" y="19" width="3" height="2" rx=".5" />
      </g>
    </svg>
  )
}

export function Wordmark() {
  return (
    <a href="#top" className="flex items-center gap-2.5 rounded-lg" aria-label="Đức Trung, về đầu trang">
      <ChipGlyph />
      <span className="leading-tight">
        <span className="block font-display text-[18px] font-bold tracking-[-0.02em]">Đức Trung</span>
        <span className="hidden text-[12px] whitespace-nowrap text-slate min-[400px]:block">Thiết kế mạch và in 3D</span>
      </span>
    </a>
  )
}
