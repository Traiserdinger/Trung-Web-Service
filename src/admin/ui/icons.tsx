// Biểu tượng nét mảnh cho menu, cùng độ dày nét với nút đổi giao diện của web chính.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function IconOverview({ className = 'h-5 w-5' }: { className?: string }) {
  // ba khối nhỏ trên một đường: dây chuyền
  return (
    <svg {...base} className={className}>
      <path d="M3 18h18" />
      <rect x="4" y="11" width="4" height="7" rx="1" />
      <rect x="10" y="7" width="4" height="11" rx="1" />
      <rect x="16" y="13" width="4" height="5" rx="1" />
    </svg>
  )
}

export function IconOrders({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
    </svg>
  )
}

export function IconSpool({ className = 'h-5 w-5' }: { className?: string }) {
  // cuộn nhựa nhìn nghiêng
  return (
    <svg {...base} className={className}>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
      <path d="M8 10.5v6M12 11v6.5M16 10.5v6" opacity=".55" />
    </svg>
  )
}

export function IconLogout({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </svg>
  )
}

export function IconSearch({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

export function IconBack({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="m14.5 6-6 6 6 6" />
    </svg>
  )
}

export function IconChevron({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  )
}

export function IconUp({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="m6 14.5 6-6 6 6" />
    </svg>
  )
}

export function IconDown({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg {...base} className={className}>
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  )
}
