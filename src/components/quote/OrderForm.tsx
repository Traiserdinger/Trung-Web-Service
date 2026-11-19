import { useCallback, useRef, useState, type ReactNode } from 'react'
import { contactConfig } from '../../config/contactConfig'
import { fileLimits } from '../../config/pricingConfig'
import { fileToBase64, OrderSubmitError, submitOrder as defaultSubmit } from '../../lib/submitOrder'
import type { MeshStats } from '../../utils/meshAnalysis'
import { generateOrderCode } from '../../utils/orderCode'
import {
  buildOrderPayload,
  canUpload,
  validateCustomer,
  type CustomerErrors,
  type CustomerInfo,
} from '../../utils/orderPayload'
import type { QuoteState } from '../../utils/quoteState'
import type { PrintSettings } from '../../utils/slicerEstimator'
import { TurnstileWidget } from './TurnstileWidget'

interface Props {
  quote: QuoteState
  stats: MeshStats
  settings: PrintSettings
  file: File
  onClose(): void
  submit?: typeof defaultSubmit
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none'

function Field(p: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={p.id} className="text-sm font-medium text-slate-700">
        {p.label}
      </label>
      {p.children}
      {p.error && <p className="text-xs text-red-600">{p.error}</p>}
    </div>
  )
}

function ZaloButton({ children }: { children: ReactNode }) {
  return (
    <a
      href={contactConfig.zaloUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
    >
      {children}
    </a>
  )
}

export function OrderForm({ quote, stats, settings, file, onClose, submit = defaultSubmit }: Props) {
  // Mã đơn tạo một lần, dùng lại khi gửi lại sau lỗi.
  const [orderCode] = useState(() => generateOrderCode())
  const [customer, setCustomer] = useState<CustomerInfo>({
    name: '',
    phone: '',
    email: '',
    note: '',
    consent: false,
    honeypot: '',
  })
  const [errors, setErrors] = useState<CustomerErrors>({})
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [sendError, setSendError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const sendingRef = useRef(false)
  const onToken = useCallback((t: string | null) => setTurnstileToken(t), [])

  const tooBig = !canUpload(file.size)
  const needsTurnstile = Boolean(contactConfig.turnstileSiteKey)
  const set = (patch: Partial<CustomerInfo>) => setCustomer((c) => ({ ...c, ...patch }))

  const onSend = async () => {
    if (sendingRef.current) return
    const v = validateCustomer(customer)
    setErrors(v)
    if (Object.keys(v).length > 0) return
    if (needsTurnstile && !turnstileToken) {
      setSendError('Vui lòng hoàn tất bước xác minh chống spam')
      return
    }
    sendingRef.current = true
    setSending(true)
    setSendError(null)
    setProgress(0)
    try {
      const fileBase64 = await fileToBase64(file)
      const payload = buildOrderPayload({
        orderCode,
        quote,
        stats,
        settings,
        customer,
        fileName: file.name,
        fileSize: file.size,
        fileBase64,
        turnstileToken,
      })
      await submit(payload, { url: contactConfig.appsScriptUrl, onProgress: setProgress })
      setDone(true)
    } catch (e) {
      setSendError(e instanceof OrderSubmitError ? e.message : 'Không gửi được, kiểm tra mạng và thử lại')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  if (done) {
    return (
      <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="text-sm text-emerald-800">Đã gửi yêu cầu! Mã đơn của bạn:</div>
        <div className="font-mono text-2xl font-bold tracking-wider text-emerald-900">{orderCode}</div>
        <p className="text-sm text-emerald-800">Nhắn mã này để chốt đơn — Trung sẽ phản hồi sớm qua Zalo.</p>
        <ZaloButton>Nhắn Zalo cho Trung</ZaloButton>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-900">
            {quote.orderType === 'quote' ? 'Gửi yêu cầu in' : 'Gửi yêu cầu tư vấn'}
          </div>
          <div className="text-xs text-slate-500">
            Mã đơn: <span className="font-mono">{orderCode}</span> · {file.name}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800" aria-label="Đóng">
          ✕
        </button>
      </div>

      {tooBig ? (
        <div className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            File lớn hơn {Math.round(fileLimits.uploadMaxBytes / 1024 / 1024)}MB – vui lòng gửi file qua Zalo kèm mã
            đơn <span className="font-mono font-semibold">{orderCode}</span>.
          </p>
          <ZaloButton>Mở Zalo</ZaloButton>
        </div>
      ) : (
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void onSend()
          }}
        >
          <Field id="of-name" label="Họ tên *" error={errors.name}>
            <input id="of-name" className={inputCls} value={customer.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field id="of-phone" label="Zalo/SĐT *" error={errors.phone}>
            <input
              id="of-phone"
              inputMode="tel"
              className={inputCls}
              value={customer.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </Field>
          <Field id="of-email" label="Email (tuỳ chọn)" error={errors.email}>
            <input
              id="of-email"
              type="email"
              className={inputCls}
              value={customer.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
          <Field id="of-note" label="Ghi chú (tuỳ chọn)">
            <textarea
              id="of-note"
              rows={3}
              className={inputCls}
              value={customer.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </Field>

          {/* Honeypot chống bot: ẩn bằng CSS, người thật không thấy */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="of-website">Website</label>
            <input
              id="of-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={customer.honeypot}
              onChange={(e) => set({ honeypot: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-sky-600"
                checked={customer.consent}
                onChange={(e) => set({ consent: e.target.checked })}
              />
              <span>Tôi đồng ý cho Trung lưu file và liên hệ để báo giá.</span>
            </label>
            {errors.consent && <p className="pl-6 text-xs text-red-600">{errors.consent}</p>}
          </div>

          <TurnstileWidget siteKey={contactConfig.turnstileSiteKey} onToken={onToken} />

          {sending && (
            <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
              <div className="h-full bg-sky-600 transition-all" style={{ width: `${Math.max(5, progress * 100)}%` }} />
            </div>
          )}

          {sendError && (
            <div className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              <p>{sendError}</p>
              <p>
                Hoặc gửi file qua Zalo kèm mã đơn <span className="font-mono font-semibold">{orderCode}</span>.
              </p>
              <ZaloButton>Gửi qua Zalo</ZaloButton>
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-lg bg-sky-600 px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-wait disabled:opacity-60"
          >
            Gửi đơn
          </button>
        </form>
      )}
    </div>
  )
}
