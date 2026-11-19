import { contactConfig } from '../../config/contactConfig'

/** Nút Zalo nổi — chỉ trên màn nhỏ, vì màn rộng đã có nút trên thanh điều hướng. */
export function FloatingZalo() {
  return (
    <a
      href={contactConfig.zaloUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Nhắn Zalo cho Đức Trung"
      className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-full bg-solder py-3 pr-5 pl-4 text-[15px] font-semibold text-white shadow-[0_14px_30px_-12px_rgb(18_112_74/0.8)] md:hidden"
    >
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true" fill="currentColor">
        <path d="M10 2C5.6 2 2 5.1 2 9c0 2.2 1.2 4.2 3 5.5V18l3.2-1.8c.6.1 1.2.2 1.8.2 4.4 0 8-3.1 8-7S14.4 2 10 2z" />
      </svg>
      Zalo
    </a>
  )
}
