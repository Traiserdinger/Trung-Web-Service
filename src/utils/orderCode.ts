const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'

/** Mã đơn dạng P3D-YYMMDD-XXXX (ngày theo giờ máy khách). */
export function generateOrderCode(date: Date = new Date(), rand: () => number = Math.random): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const ymd = `${pad(date.getFullYear() % 100)}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  let suffix = ''
  for (let i = 0; i < 4; i++) suffix += ALPHABET[Math.floor(rand() * ALPHABET.length) % ALPHABET.length]
  return `P3D-${ymd}-${suffix}`
}
