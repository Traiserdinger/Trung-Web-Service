import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { contactConfig } from '../../config/contactConfig'
import { fileLimits } from '../../config/pricingConfig'
import { fileToBase64, OrderSubmitError, submitOrder as defaultSubmit } from '../../lib/submitOrder'
import type { MeshStats } from '../../utils/meshAnalysis'
import {
  buildOrderPayload,
  canUpload,
  validateCustomer,
  type CustomerErrors,
  type CustomerInfo,
} from '../../utils/orderPayload'
import type { QuoteState } from '../../utils/quoteState'
import type { PrintSettings } from '../../utils/slicerEstimator'
import { TurnstileWidget, type TurnstileHandle } from './TurnstileWidget'

interface Props {
  quote: QuoteState
  stats: MeshStats
  settings: PrintSettings
  file: File
  /** Mã đơn do component cha giữ theo từng file, để mở lại form vẫn dùng đúng mã */
  orderCode: string
  /** Nội dung file đã đọc sẵn trong bộ nhớ: gửi đi mà không phải đọc lại từ đĩa */
  fileBuffer?: ArrayBuffer
  /** 25.4 nếu khách đã đổi inch → mm khi báo giá */
  scale?: number
  onClose(): void
  /** Báo cho cha biết đang gửi, để khoá việc đổi file và đổi thông số */
  onBusyChange?(busy: boolean): void
  /** Gửi xong: cha có thể cho phép tạo đơn mới */
  onSent?(): void
  /** Khách muốn gửi thêm một đơn khác cho cùng file */
  onNewOrder?(): void
  turnstileSiteKey?: string
  submit?: typeof defaultSubmit
}

type Stage = 'idle' | 'reading' | 'sending'

const inputCls =
  'w-full rounded-[12px] border border-mist bg-paper px-3.5 py-2.5 text-[15px] text-ink placeholder:text-slate/60 transition-colors focus:border-solder focus:outline-none focus:ring-4 focus:ring-solder/15 aria-[invalid=true]:border-alert'

function Field(p: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={p.id} className="flex items-baseline justify-between text-[14px] font-semibold text-ink">
        {p.label}
        {p.hint && <span className="text-[13px] font-normal text-slate">{p.hint}</span>}
      </label>
      <div className="mt-1.5">{p.children}</div>
      {p.error && (
        <p id={`${p.id}-error`} className="mt-1.5 text-[13px] text-alert">
          {p.error}
        </p>
      )}
    </div>
  )
}

/** Thuộc tính a11y cho ô nhập: đánh dấu lỗi và nối với dòng mô tả lỗi */
const errorProps = (id: string, error?: string) =>
  error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {}

function ZaloButton({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <a
      href={contactConfig.zaloUrl}
      target="_blank"
      rel="noreferrer"
      className={`inline-block rounded-full px-5 py-2.5 text-[14px] font-semibold transition-colors ${
        light ? 'bg-paper text-solder hover:bg-solder-tint' : 'bg-ink text-on-ink hover:bg-solder'
      }`}
    >
      {children}
    </a>
  )
}

/** Base64 từ bộ nhớ nếu có, nếu không thì đọc file (có thể lỗi nếu file đã bị xoá/di chuyển) */
async function encodeFile(file: File, buffer?: ArrayBuffer): Promise<string> {
  return fileToBase64(buffer ? new Blob([buffer]) : file)
}

export function OrderForm({
  quote,
  stats,
  settings,
  file: fileProp,
  orderCode: codeProp,
  fileBuffer: bufferProp,
  scale: scaleProp = 1,
  onClose,
  onBusyChange,
  onSent,
  onNewOrder,
  turnstileSiteKey = contactConfig.turnstileSiteKey,
  submit = defaultSubmit,
}: Props) {
  // Chụp lại file + mã đơn lúc mở form: nếu khách nạp file khác trong lúc đang gửi,
  // màn hình vẫn nói đúng file và mã đã thực sự gửi đi.
  const [{ file, orderCode, fileBuffer, scale }] = useState(() => ({
    file: fileProp,
    orderCode: codeProp,
    fileBuffer: bufferProp,
    scale: scaleProp,
  }))
  const [customer, setCustomer] = useState<CustomerInfo>({
    name: '',
    phone: '',
    email: '',
    note: '',
    consent: false,
    honeypot: '',
  })
  const [errors, setErrors] = useState<CustomerErrors>({})
  const [stage, setStage] = useState<Stage>('idle')
  const [sendError, setSendError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const sendingRef = useRef(false)
  const turnstileRef = useRef<TurnstileHandle>(null)
  const doneRef = useRef<HTMLDivElement>(null)
  const onToken = useCallback((t: string | null) => setTurnstileToken(t), [])

  const sending = stage !== 'idle'
  useEffect(() => onBusyChange?.(sending), [sending, onBusyChange])
  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  const tooBig = !canUpload(file.size)
  const needsTurnstile = Boolean(turnstileSiteKey)
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
    setStage('reading')
    setSendError(null)
    try {
      let fileBase64 = ''
      if (!tooBig) {
        try {
          fileBase64 = await encodeFile(file, fileBuffer)
        } catch {
          throw new OrderSubmitError(
            `Không đọc được file ${file.name} trên máy. Hãy chọn lại file rồi gửi, hoặc gửi file qua Zalo.`,
          )
        }
      }
      const payload = buildOrderPayload({
        orderCode,
        quote,
        stats,
        settings,
        customer,
        fileName: file.name,
        fileSize: file.size,
        fileBase64,
        fileDelivery: tooBig ? 'zalo' : 'upload',
        scale,
        turnstileToken,
      })
      setStage('sending')
      await submit(payload, { url: contactConfig.appsScriptUrl })
      setDone(true)
      onSent?.()
    } catch (e) {
      setSendError(e instanceof OrderSubmitError ? e.message : 'Không gửi được, kiểm tra mạng và thử lại')
      // Token Turnstile chỉ dùng một lần: xin token mới cho lần gửi lại
      if (needsTurnstile) turnstileRef.current?.reset()
    } finally {
      sendingRef.current = false
      setStage('idle')
    }
  }

  if (done) {
    return (
      <div
        ref={doneRef}
        tabIndex={-1}
        role="status"
        className="rounded-[22px] bg-solder-fill p-6 text-white outline-none focus-visible:ring-4 focus-visible:ring-white/60"
      >
        <div className="text-[14px] text-white/80">Đã gửi yêu cầu cho file {file.name}. Mã đơn của bạn</div>
        <div className="mt-1 font-display text-[34px] font-bold tracking-[0.02em] tnum">{orderCode}</div>
        <p className="mt-2 max-w-[40ch] text-[15px] text-white/90">
          {tooBig
            ? 'Gửi file qua Zalo kèm mã này để mình bắt đầu xem.'
            : 'Nhắn mã này để chốt đơn. Mình xem file và trả lời bạn qua Zalo.'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ZaloButton light>{tooBig ? 'Gửi file qua Zalo' : 'Nhắn Zalo cho Trung'}</ZaloButton>
          {onNewOrder && (
            <button
              type="button"
              onClick={onNewOrder}
              className="rounded-full border border-white/40 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:border-white"
            >
              Gửi đơn khác
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[22px] bg-paper p-6 ring-1 ring-mist">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-[24px] font-bold">
            {quote.orderType === 'quote' ? 'Gửi yêu cầu in' : 'Gửi yêu cầu tư vấn'}
          </h3>
          <p className="mt-1 text-[13px] text-slate">
            Mã đơn <span className="font-semibold text-ink tnum">{orderCode}</span>, file {file.name}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={sending}
          aria-label="Đóng"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate transition-colors hover:bg-fog hover:text-ink disabled:opacity-40"
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {tooBig && (
        <div className="mt-5 rounded-[14px] bg-caution-tint p-4 text-[14px] text-caution">
          File lớn hơn {Math.round(fileLimits.uploadMaxBytes / 1024 / 1024)} MB nên không gửi kèm qua web được. Bạn vẫn
          để lại thông tin để mình ghi đơn <strong className="tnum">{orderCode}</strong>, rồi gửi file qua Zalo kèm mã
          này.
        </div>
      )}

      <form
        className="mt-5 space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void onSend()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="of-name" label="Họ tên" error={errors.name}>
            <input
              id="of-name"
              autoComplete="name"
              className={inputCls}
              value={customer.name}
              onChange={(e) => set({ name: e.target.value })}
              {...errorProps('of-name', errors.name)}
            />
          </Field>
          <Field id="of-phone" label="Zalo/SĐT" error={errors.phone}>
            <input
              id="of-phone"
              inputMode="tel"
              autoComplete="tel"
              className={inputCls}
              value={customer.phone}
              onChange={(e) => set({ phone: e.target.value })}
              {...errorProps('of-phone', errors.phone)}
            />
          </Field>
        </div>
        <Field id="of-email" label="Email" hint="không bắt buộc" error={errors.email}>
          <input
            id="of-email"
            type="email"
            autoComplete="email"
            className={inputCls}
            value={customer.email}
            onChange={(e) => set({ email: e.target.value })}
            {...errorProps('of-email', errors.email)}
          />
        </Field>
        <Field id="of-note" label="Ghi chú" hint="không bắt buộc">
          <textarea
            id="of-note"
            rows={3}
            maxLength={1500}
            placeholder="Màu nhựa, ngày cần lấy, chỗ cần lưu ý…"
            className={inputCls}
            value={customer.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </Field>

        {/* Honeypot chống bot: ẩn bằng CSS. Tên trường không phổ biến để trình duyệt không tự điền vào. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="of-hp">Để trống ô này</label>
          <input
            id="of-hp"
            name="of_hp_leave_empty"
            tabIndex={-1}
            autoComplete="off"
            value={customer.honeypot}
            onChange={(e) => set({ honeypot: e.target.value })}
          />
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-[14px] text-ink">
            <input
              type="checkbox"
              className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-[var(--color-solder)]"
              checked={customer.consent}
              onChange={(e) => set({ consent: e.target.checked })}
              {...errorProps('of-consent', errors.consent)}
            />
            <span>Tôi đồng ý cho Trung lưu file và liên hệ để báo giá.</span>
          </label>
          {errors.consent && (
            <p id="of-consent-error" className="mt-1.5 pl-7 text-[13px] text-alert">
              {errors.consent}
            </p>
          )}
        </div>

        <TurnstileWidget ref={turnstileRef} siteKey={turnstileSiteKey} onToken={onToken} />

        {sendError && (
          <div role="alert" className="space-y-3 rounded-[14px] bg-alert-tint p-4 text-[14px] text-alert">
            <p className="font-semibold">{sendError}</p>
            <p className="text-ink">
              Hoặc gửi file qua Zalo kèm mã đơn <strong className="tnum">{orderCode}</strong>.
            </p>
            <ZaloButton>Gửi qua Zalo</ZaloButton>
          </div>
        )}

        <button
          type="submit"
          disabled={sending}
          className="relative w-full overflow-hidden rounded-full bg-solder-fill px-5 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-solder-deep disabled:cursor-wait"
        >
          <span className={sending ? 'invisible' : ''}>Gửi đơn</span>
          {sending && (
            <span className="absolute inset-0 flex items-center justify-center gap-2.5" aria-live="polite">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
              {stage === 'reading' ? 'Đang chuẩn bị file' : 'Đang gửi đơn'}
            </span>
          )}
        </button>
      </form>
    </div>
  )
}
