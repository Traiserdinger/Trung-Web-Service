import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { fileLimits } from '../../config/pricingConfig'

export interface DropZoneHandle {
  openPicker(): void
}

interface Props {
  onFile(f: File): void
  disabled?: boolean
  /** true khi chưa có file: hiện lời mời thả file phủ giữa khung */
  empty: boolean
  children: ReactNode
}

/** Biến cả sân khấu 3D thành vùng thả file. */
export const DropZone = forwardRef<DropZoneHandle, Props>(function DropZone({ onFile, disabled, empty, children }, ref) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = () => !disabled && inputRef.current?.click()
  useImperativeHandle(ref, () => ({ openPicker: open }))

  const accept = (f: File | undefined) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.stl')) {
      setError('Chỉ nhận file .stl. Với file STEP hay 3MF, hãy gửi qua Zalo.')
      return
    }
    if (f.size > fileLimits.previewMaxBytes) {
      setError(`File lớn hơn ${Math.round(fileLimits.previewMaxBytes / 1024 / 1024)} MB. Hãy gửi qua Zalo để mình xem trực tiếp.`)
      return
    }
    setError(null)
    onFile(f)
  }

  return (
    <div>
      <div
        className="relative"
        onDragOver={(e) => {
          e.preventDefault()
          if (disabled) {
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
            return
          }
          setOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (disabled) {
            setError('Đang xử lý file hoặc gửi đơn. Đợi xong rồi hãy thả file mới.')
            return
          }
          accept(e.dataTransfer.files[0])
        }}
      >
        {children}

        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="pointer-events-auto flex max-w-[340px] flex-col items-center rounded-[22px] bg-paper/85 px-8 py-7 text-center shadow-[0_20px_40px_-24px_rgb(27_36_32/0.35)] ring-1 ring-mist backdrop-blur">
              <svg viewBox="0 0 48 48" className="h-11 w-11 text-solder" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M24 6 40 15v18L24 42 8 33V15z" strokeLinejoin="round" />
                <path d="M8 15l16 9 16-9M24 24v18" strokeLinejoin="round" />
              </svg>
              <div className="mt-3 font-display text-[22px] font-bold text-ink">Thả file STL vào đây</div>
              <p className="mt-1 text-[14px] text-slate">STL dạng binary hoặc ASCII, tối đa 100 MB</p>
              <button
                type="button"
                onClick={open}
                disabled={disabled}
                className="mt-4 rounded-full bg-ink px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-solder disabled:opacity-60"
              >
                Chọn file từ máy
              </button>
            </div>
          </div>
        )}

        {over && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[28px] bg-solder-tint/80 ring-2 ring-solder ring-inset">
            <span className="font-display text-[24px] font-bold text-solder">Thả để xem giá</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        // iOS Safari chỉ nhận đuôi file khi kèm cả kiểu MIME, nếu không sẽ làm mờ file .stl
        accept=".stl,model/stl,application/sla,application/vnd.ms-pki.stl,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && (
        <p role="alert" className="mt-3 rounded-[12px] bg-alert-tint px-4 py-3 text-[14px] text-alert">
          {error}
        </p>
      )}
    </div>
  )
})
