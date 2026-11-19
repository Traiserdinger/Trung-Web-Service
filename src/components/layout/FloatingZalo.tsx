import { contactConfig } from '../../config/contactConfig'

export function FloatingZalo() {
  return (
    <a
      href={contactConfig.zaloUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Nhắn Zalo"
      className="fixed right-4 bottom-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-lg ring-4 ring-white hover:bg-blue-700"
    >
      Zalo
    </a>
  )
}
