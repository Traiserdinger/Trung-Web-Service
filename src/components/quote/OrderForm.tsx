import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { contactConfig } from '../../config/contactConfig'
import type { ColorOption } from '../../config/colorConfig'
import { fileLimits, printerConfig } from '../../config/pricingConfig'
import { recentSummary, saveRecentOrder } from '../../lib/recentOrders'
import { buildPlateInWorker } from '../../lib/stlWorkerClient'
import { OrderSubmitError, submitOrder as defaultSubmit } from '../../lib/submitOrder'
import {
  buildOrderMeta,
  validateCustomer,
  type CustomerErrors,
  type CustomerInfo,
  type OrderMetaFile,
  type OrderMetaItem,
} from '../../utils/orderPayload'
import type { Placement } from '../../utils/plateArrange'
import type { PlateQuote } from '../../utils/plateState'
import type { SharedSettings } from '../../utils/slicerEstimator'
import { TurnstileWidget, type TurnstileHandle } from './TurnstileWidget'
import type { PlateFile, PlateItem } from './usePlateItems'

interface Props {
  quote: PlateQuote
  files: PlateFile[]
  items: PlateItem[]
  shared: SharedSettings
  /** Kết quả xếp bàn: vị trí từng bản và hull từng món (theo id món) */
  arrangement: {
    fits: boolean
    placements: Record<string, Placement[]>
    hulls: Record<string, [number, number][]>
  } | null
  /** Mã đơn do component cha giữ theo từng bộ file, để mở lại form vẫn dùng đúng mã */
  orderCode: string
  /** Màu khách đã chọn */
  color: ColorOption
  onClose(): void
  /** Báo cho cha biết đang gửi, để khoá việc đổi file và đổi thông số */
  onBusyChange?(busy: boolean): void
  /** Gửi xong: cha có thể cho phép tạo đơn mới */
  onSent?(): void
  /** Khách muốn gửi thêm một đơn khác cho cùng file */
  onNewOrder?(): void
  turnstileSiteKey?: string
  submit?: typeof defaultSubmit
  buildPlate?: typeof buildPlateInWorker
}

const MAX_FOOTPRINT = 32
const COPIED_MS = 2000

/** Giữ tối đa 32 điểm, lấy đều theo chỉ số để kết quả luôn giống nhau */
function decimate(hull: [number, number][]): [number, number][] {
  if (hull.length <= MAX_FOOTPRINT) return hull
  return Array.from({ length: MAX_FOOTPRINT }, (_, k) => hull[Math.floor((k * hull.length) / MAX_FOOTPRINT)])
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

export function OrderForm({
  quote: quoteProp,
  files: filesProp,
  items: itemsProp,
  shared: sharedProp,
  arrangement: arrangementProp,
  orderCode: codeProp,
  color,
  onClose,
  onBusyChange,
  onSent,
  onNewOrder,
  turnstileSiteKey = contactConfig.turnstileSiteKey,
  submit = defaultSubmit,
  buildPlate = buildPlateInWorker,
}: Props) {
  // Chụp lại bộ file + mã đơn lúc mở form: nếu khách nạp file khác trong lúc đang gửi,
  // màn hình vẫn nói đúng những gì đã thực sự gửi đi.
  const [{ quote, files, items, shared, arrangement, orderCode }] = useState(() => ({
    quote: quoteProp,
    files: filesProp,
    items: itemsProp,
    shared: sharedProp,
    arrangement: arrangementProp,
    orderCode: codeProp,
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
  const [done, setDone] = useState<{ trackUrl: string; failed: string[]; preview: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const codeRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const totalBytes = files.reduce((n, f) => n + f.file.size, 0)
  const tooBig = totalBytes > fileLimits.uploadMaxBytes
  /** Quá 35 MB, hoặc đơn tư vấn từ 2 món: không tải file lên, khách gửi qua Zalo kèm mã. Đơn tư vấn một món vẫn tải file. */
  const zalo = tooBig || (quote.orderType !== 'quote' && items.length >= 2)
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
      // Bàn in: chỉ khi báo giá tự động và đã xếp vừa; lỗi hay quá 35 MB thì bỏ, không báo khách
      let plate: Uint8Array | null = null
      // Số bản đã xếp phải khớp số lượng hiện tại; lệch (đang xếp lại) thì không dựng bàn in
      const placementsFresh = items.every((it) => arrangement?.placements[it.id]?.length === it.settings.quantity)
      if (quote.orderType === 'quote' && arrangement?.fits && placementsFresh) {
        try {
          const bytes = await buildPlate(
            items.map((it, i) => ({
              itemNo: i + 1,
              name: it.name,
              positions: it.positions,
              placements: arrangement.placements[it.id] ?? [],
            })),
            printerConfig.bed,
          )
          if (bytes.byteLength <= fileLimits.uploadMaxBytes) plate = bytes
        } catch {
          plate = null
        }
      }
      // Đánh số lại file 1..n và món 1..n theo thứ tự hiện tại
      const fileNoOf = new Map(files.map((f, i) => [f.fileNo, i + 1]))
      const metaFiles: OrderMetaFile[] = files.map((f, i) => ({
        fileNo: i + 1,
        role: 'source',
        fileName: f.file.name,
        fileSize: f.file.size,
        fileType: f.fileType,
        fileDelivery: zalo ? 'zalo' : 'upload',
      }))
      if (plate) {
        metaFiles.push({
          fileNo: 0,
          role: 'plate',
          fileName: 'ban-in.3mf',
          fileSize: plate.byteLength,
          fileType: '3mf',
          fileDelivery: 'upload',
        })
      }
      const metaItems: OrderMetaItem[] = items.map((it, i) => {
        const placed = arrangement?.placements[it.id]
        const hull = arrangement?.hulls[it.id]
        return {
          itemNo: i + 1,
          fileNo: fileNoOf.get(it.fileNo) ?? 1,
          name: it.name,
          dims: it.stats.dims,
          volume: it.stats.volume,
          surfaceArea: it.stats.surfaceArea,
          scale: it.scale,
          orient: it.orient,
          infillPercent: it.settings.infillPercent,
          wallLoops: it.settings.wallLoops,
          support: it.settings.support,
          quantity: it.settings.quantity,
          placements: placed && placed.length === it.settings.quantity ? placed : null,
          footprint: hull && hull.length > 0 ? decimate(hull) : null,
        }
      })
      const meta = buildOrderMeta({
        orderCode,
        quote,
        shared,
        customer,
        colorId: color.id,
        files: metaFiles,
        items: metaItems,
        turnstileToken,
      })
      // File đã đọc sẵn trong bộ nhớ lúc chọn: gửi đi mà không phải đọc lại từ đĩa
      const blobs = new Map<number, Blob>()
      if (!zalo) files.forEach((f, i) => blobs.set(i + 1, new Blob([f.buffer])))
      if (plate) blobs.set(0, new Blob([plate as BlobPart]))
      setStage('sending')
      const r = await submit(meta, blobs, { url: contactConfig.appsScriptUrl })
      const uploaded = new Set(r.files.filter((f) => f.uploaded).map((f) => f.fileNo))
      // Chỉ liệt kê file nguồn; file bàn in lỗi thì không nhắc
      const failed = metaFiles
        .filter((f) => f.role === 'source' && f.fileDelivery === 'upload' && !uploaded.has(f.fileNo))
        .map((f) => f.fileName)
      try {
        saveRecentOrder({ code: orderCode, createdAt: meta.createdAt, summary: recentSummary(items.map((it) => it.name)) })
      } catch {
        /* ghi nhớ trên máy lỗi không được làm hỏng đơn đã gửi */
      }
      setDone({ trackUrl: r.trackUrl, failed, preview: r.preview === true })
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

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(orderCode)
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      // Không chép được: chọn sẵn mã để khách tự chép
      const el = codeRef.current
      const sel = window.getSelection()
      if (el && sel) {
        const range = document.createRange()
        range.selectNodeContents(el)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }

  if (done) {
    // Chỉ nhận đường dẫn tuyệt đối http(s) từ máy chủ, còn lại dùng đường dẫn dự phòng cùng origin
    const trackHref = /^https?:\/\//.test(done.trackUrl) ? done.trackUrl : `/tra-cuu?ma=${orderCode}`
    return (
      <div
        ref={doneRef}
        tabIndex={-1}
        role="status"
        className="rounded-[22px] bg-solder-fill p-6 text-white outline-none focus-visible:ring-4 focus-visible:ring-white/60"
      >
        <div className="text-[14px] text-white/80">{`Đã gửi yêu cầu cho ${items.length} món. Mã đơn của bạn`}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <div ref={codeRef} className="font-display text-[34px] font-bold tracking-[0.02em] tnum">
            {orderCode}
          </div>
          <button
            type="button"
            onClick={() => void onCopy()}
            className="rounded-full border border-white/40 px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:border-white"
          >
            {copied ? 'Đã chép' : 'Sao chép mã'}
          </button>
        </div>
        <p className="mt-1 text-[13px] text-white/80">Chụp màn hình hoặc lưu mã này để tra cứu sau</p>
        <p className="mt-2 max-w-[40ch] text-[15px] text-white/90">
          {zalo
            ? 'Gửi file qua Zalo kèm mã này để mình bắt đầu xem.'
            : 'Nhắn mã này để chốt đơn. Mình xem file và trả lời bạn qua Zalo.'}
        </p>
        {!zalo && done.preview && (
          <p className="mt-2 max-w-[40ch] text-[15px] font-semibold text-white">Đây là bản thử, không lưu file.</p>
        )}
        {!zalo && !done.preview && done.failed.length > 0 && (
          <div className="mt-2 max-w-[48ch] text-[15px] text-white">
            <p className="font-semibold">Các file chưa gửi được, gửi qua Zalo kèm mã này:</p>
            <ul className="mt-1 list-disc pl-5 text-white/90">
              {done.failed.map((n, i) => (
                <li key={i} className="break-all">
                  {n}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ZaloButton light>{zalo ?'Gửi file qua Zalo' : 'Nhắn Zalo cho Trung'}</ZaloButton>
          <a
            href={trackHref}
            className="rounded-full border border-white/40 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:border-white"
          >
            Theo dõi tiến độ đơn
          </a>
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
            Mã đơn <span className="font-semibold text-ink tnum">{orderCode}</span>,{' '}
            {files.length === 1 ? `file ${files[0].file.name}` : `${files.length} file, ${items.length} món`}
          </p>
          <p className="mt-1 text-[13px] text-slate">{`Màu: ${color.name}`}</p>
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

      {zalo && (
        <div className="mt-5 rounded-[14px] bg-caution-tint p-4 text-[14px] text-caution">
          {tooBig
            ? `File lớn hơn ${Math.round(fileLimits.uploadMaxBytes / 1024 / 1024)} MB nên không gửi kèm qua web được. `
            : 'Đơn này cần tư vấn nên file không gửi kèm qua web. '}
          Bạn vẫn để lại thông tin để mình ghi đơn <strong className="tnum">{orderCode}</strong>, rồi gửi file qua Zalo
          kèm mã này.
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
        <Field id="of-email" label="Email" hint="không bắt buộc · để nhận email báo tiến độ" error={errors.email}>
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
