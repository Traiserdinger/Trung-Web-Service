// Lớp Tailwind dùng chung: nút và ô nhập bo 10px, viên thuốc bo tròn hẳn (giống web chính).

export const inputCls =
  'w-full rounded-[10px] border border-mist bg-paper px-3.5 py-2.5 text-[15px] text-ink placeholder:text-slate/70 transition-colors focus:border-solder focus:outline-none focus:ring-4 focus:ring-solder/15'

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-[10px] bg-ink px-5 py-2.5 text-[15px] font-semibold text-on-ink transition-colors hover:bg-solder disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-ink'

export const btnSolder =
  'inline-flex items-center justify-center gap-2 rounded-[10px] bg-solder-fill px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-solder-deep disabled:cursor-not-allowed disabled:opacity-45'

export const btnQuiet =
  'inline-flex items-center justify-center gap-2 rounded-[10px] border border-mist bg-paper px-4 py-2 text-[14px] font-medium text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-mist'

export const btnDanger =
  'inline-flex items-center justify-center gap-2 rounded-[10px] bg-alert px-5 py-2.5 text-[15px] font-semibold text-on-ink transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'

export const sectionTitle = 'font-display text-[21px] font-bold tracking-[-0.02em]'

export const alertCls = 'rounded-[10px] bg-alert-tint px-4 py-3 text-[15px] text-alert'
