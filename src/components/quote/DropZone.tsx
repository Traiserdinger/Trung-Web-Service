import { useRef, useState } from 'react'
import { fileLimits } from '../../config/pricingConfig'

interface Props {
  onFile(f: File): void
  disabled?: boolean
  fileName?: string | null
}

export function DropZone({ onFile, disabled, fileName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = (f: File | undefined) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.stl')) {
      setError('Chỉ nhận file .stl')
      return
    }
    if (f.size > fileLimits.previewMaxBytes) {
      setError(`File quá lớn (tối đa ${Math.round(fileLimits.previewMaxBytes / 1024 / 1024)}MB)`)
      return
    }
    setError(null)
    onFile(f)
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!disabled) accept(e.dataTransfer.files[0])
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-4 text-center text-sm transition ${
          over ? 'border-sky-500 bg-sky-50' : 'border-slate-300 bg-white hover:border-sky-400'
        } ${disabled ? 'cursor-wait opacity-60' : ''}`}
      >
        <span className="font-semibold text-slate-800">Kéo-thả file .stl vào đây hoặc bấm để chọn</span>
        <span className="mt-1 text-xs text-slate-500">
          {fileName ? `Đang xem: ${fileName}` : 'STL dạng binary hoặc ASCII, tối đa 100MB'}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".stl"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
