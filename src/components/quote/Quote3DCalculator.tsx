import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { printerConfig, uiOptions } from '../../config/pricingConfig'
import { DEFAULT_COLORS, type ColorOption } from '../../config/colorConfig'
import { fetchColors } from '../../lib/colors'
import { useTheme } from '../../lib/theme'
import { formatDims } from '../../utils/format'
import { generateOrderCode } from '../../utils/orderCode'
import { exceedsBed, isSuspectedInches } from '../../utils/meshAnalysis'
import { computePlateState } from '../../utils/plateState'
import { shouldSuggestSupport, type PrintSettings, type SharedSettings } from '../../utils/slicerEstimator'
import { DropZone, type DropZoneHandle } from './DropZone'
import { ItemList } from './ItemList'
import { OptionsPanel } from './OptionsPanel'
import { OrderForm } from './OrderForm'
import { QuoteResult } from './QuoteResult'
import { StlViewer, type StlViewerHandle, type ViewerPart } from './StlViewer'
import { usePlateItems, type OrientMode, type PlateItem } from './usePlateItems'

const INCH = 25.4

function Notice({ tone, children }: { tone: 'alert' | 'caution'; children: ReactNode }) {
  const cls = tone === 'alert' ? 'bg-alert-tint text-alert' : 'bg-caution-tint text-caution'
  return <div className={`rounded-[14px] px-4 py-3 text-[14px] leading-[1.5] ${cls}`}>{children}</div>
}

const chipCls =
  'rounded-full bg-paper/90 px-3 py-1.5 text-[13px] font-semibold text-ink ring-1 ring-mist backdrop-blur transition-colors hover:ring-ink disabled:opacity-60'

export function Quote3DCalculator({ loadColors = fetchColors }: { loadColors?: () => Promise<ColorOption[]> }) {
  const viewerRef = useRef<StlViewerHandle>(null)
  const dropRef = useRef<DropZoneHandle>(null)
  const plate = usePlateItems()
  const { items, files, selectedId, arrangement } = plate
  const [showOrder, setShowOrder] = useState(false)
  const [sending, setSending] = useState(false)
  /** Đơn hiện tại đã gửi xong: đổi thông số hay bấm gửi lại nghĩa là bắt đầu một đơn mới */
  const [sent, setSent] = useState(false)
  /** Tăng để dựng lại form với mã đơn mới */
  const [formKey, setFormKey] = useState(0)
  const [orderCode, setOrderCode] = useState(generateOrderCode)
  const [shared, setShared] = useState<SharedSettings>({
    material: uiOptions.defaults.material,
    layerHeight: uiOptions.defaults.layerHeight,
  })
  const [picking, setPicking] = useState(false)
  const [colors, setColors] = useState<ColorOption[]>(DEFAULT_COLORS)
  const [colorId, setColorId] = useState(DEFAULT_COLORS[0].id)
  const [actionError, setActionError] = useState<string | null>(null)
  /** "Đổi file" (một món): lần chọn file kế tiếp thay hết món hiện có thay vì thêm */
  const replaceNext = useRef(false)
  const loadColorsRef = useRef(loadColors)
  useEffect(() => {
    let alive = true
    loadColorsRef
      .current()
      .then((list) => {
        if (!alive || list.length === 0) return
        setColors(list)
        setColorId((id) => (list.some((c) => c.id === id) ? id : list[0].id))
      })
      .catch(() => {}) // giữ màu mặc định
    return () => {
      alive = false
    }
    // chỉ tải một lần khi mở trang
  }, [])
  const selectedColor = colors.find((c) => c.id === colorId) ?? colors[0]
  const [theme] = useTheme()
  const sendingRef = useRef(false)
  const onBusyChange = useCallback((busy: boolean) => {
    sendingRef.current = busy
    setSending(busy)
  }, [])

  const startNewOrder = useCallback((open: boolean) => {
    setOrderCode(generateOrderCode())
    setSent(false)
    setFormKey((k) => k + 1)
    setShowOrder(open)
  }, [])

  // Đổi bộ file: form của đơn cũ đóng lại (trừ khi đang gửi dở: form giữ đúng file đã gửi);
  // nếu đơn cũ đã gửi xong thì bộ file mới là đơn mới, mã mới.
  const sentRef = useRef(sent)
  useEffect(() => {
    sentRef.current = sent
  }, [sent])
  const firstFiles = useRef(true)
  useEffect(() => {
    if (firstFiles.current) {
      firstFiles.current = false
      return
    }
    if (sendingRef.current) return
    if (sentRef.current) startNewOrder(false)
    else setShowOrder(false)
  }, [files, startNewOrder])

  const selected: PlateItem | null = items.find((it) => it.id === selectedId) ?? items[0] ?? null
  const many = items.length >= 2
  const busy = plate.busy
  const error = actionError ?? plate.error

  const onFiles = (list: File[]) => {
    const replace = replaceNext.current
    replaceNext.current = false
    if (sendingRef.current) {
      setActionError('Đang gửi đơn. Đợi gửi xong rồi hãy chọn file mới.')
      return
    }
    setActionError(null)
    setPicking(false)
    setShowOrder(false)
    void (replace ? plate.replaceFiles(list) : plate.addFiles(list))
  }

  /** Thay đổi món (hướng in, đổi inch, xoá): đơn đã gửi giữ nguyên, đơn mới có mã mới. */
  const itemChanging = () => {
    setPicking(false)
    if (sent) startNewOrder(false)
    else setShowOrder(false)
  }

  const reorient = (id: string, mode: OrientMode, down?: Parameters<typeof plate.reorient>[2]) => {
    if (sendingRef.current) return
    itemChanging()
    plate.select(id)
    void plate.reorient(id, mode, down)
  }

  const onSettingsChange = (s: PrintSettings) => {
    setShared({ material: s.material, layerHeight: s.layerHeight })
    if (selected) {
      plate.updateItem(selected.id, {
        infillPercent: s.infillPercent,
        wallLoops: s.wallLoops,
        support: s.support,
        quantity: s.quantity,
      })
    }
    if (sent) startNewOrder(false) // đơn đã gửi giữ nguyên; thông số mới là đơn mới
  }

  const totalSourceBytes = files.reduce((n, f) => n + f.file.size, 0)
  const quote = useMemo(
    () =>
      items.length === 0
        ? null
        : computePlateState({
            items: items.map((it) => ({ id: it.id, name: it.name, stats: it.stats, settings: it.settings })),
            shared,
            arrangement,
            totalSourceBytes,
          }),
    [items, shared, arrangement, totalSourceBytes],
  )
  const pending = many && arrangement === null && quote?.orderType === 'quote'

  const bed = printerConfig.bed
  const parts: ViewerPart[] = useMemo(() => {
    const fits = arrangement?.fits === true
    return items.map((it) => {
      const placed = arrangement?.placements[it.id] ?? []
      const oversize = exceedsBed(it.stats.dims, bed).exceeds
      // Một món, một bản: vẽ giữa bàn như trước. Một món không vừa: cũng giữa bàn.
      const solo = items.length === 1 && (it.settings.quantity === 1 || !fits)
      return {
        id: it.id,
        positions: it.positions,
        placements: !arrangement || solo || placed.length === 0 ? null : placed,
        overflow: oversize || (many && arrangement !== null && placed.length < it.settings.quantity),
        selected: many && it.id === selected?.id,
      }
    })
  }, [items, arrangement, bed, many, selected?.id])

  const stats = selected?.stats ?? null
  const overflow = stats ? exceedsBed(stats.dims, bed).exceeds : false
  const supportReason =
    stats && shouldSuggestSupport(stats) ? `Phát hiện khoảng ${(stats.overhangArea / 100).toFixed(1)} cm² mặt treo` : null
  const panelValue: PrintSettings = selected
    ? { ...shared, ...selected.settings }
    : { ...shared, infillPercent: uiOptions.defaults.infillPercent, wallLoops: uiOptions.defaults.wallLoops, quantity: 1, support: false }
  const prefix = (it: PlateItem) => (many ? `${it.name}: ` : '')
  const locked = busy || sending

  return (
    <div className="grid grid-cols-12 gap-x-8 gap-y-8">
      {/* Sân khấu 3D */}
      <div className="col-span-12 space-y-3 lg:col-span-7">
        <div onDragEnterCapture={() => (replaceNext.current = false)}>
          <DropZone ref={dropRef} onFiles={onFiles} disabled={locked} empty={items.length === 0 && !busy}>
            <div className="stage-dots relative h-[380px] overflow-hidden rounded-[28px] ring-1 ring-mist sm:h-[520px] lg:h-[600px]">
              <StlViewer
                ref={viewerRef}
                parts={parts}
                color={selectedColor.hex}
                bed={bed}
                dark={theme === 'dark'}
                pickFace={picking}
                onPickFace={(id, down) => reorient(id, 'face', down)}
                onCancelPick={() => setPicking(false)}
                onSelectPart={(id) => many && plate.select(id)}
              />

              {picking && (
                <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold whitespace-nowrap text-on-ink shadow-lg">
                  Bấm vào mặt muốn đặt xuống bàn. Esc để huỷ.
                </div>
              )}

              {/* Thanh trên: tên file + đổi file (một món) / thêm file + xếp lại (nhiều món) */}
              {selected && (
                <div className="absolute top-4 right-4 left-4 flex items-center justify-between gap-3">
                  <span className="max-w-[55%] truncate rounded-full bg-paper/90 px-3 py-1.5 text-[13px] font-medium text-ink ring-1 ring-mist backdrop-blur">
                    {many ? `${items.length} món · đang chọn: ${selected.name}` : files[0]?.file.name}
                  </span>
                  {many ? (
                    <span className="flex gap-2">
                      <button type="button" onClick={() => dropRef.current?.openPicker()} disabled={locked} className={chipCls}>
                        + Thêm file
                      </button>
                      <button type="button" onClick={plate.rearrange} disabled={locked || plate.arranging} className={chipCls}>
                        Xếp lại
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        replaceNext.current = true
                        dropRef.current?.openPicker()
                      }}
                      disabled={locked}
                      className={chipCls}
                    >
                      Đổi file
                    </button>
                  )}
                </div>
              )}

              {/* Thanh dưới: kích thước + hướng in + đặt lại góc nhìn */}
              <div className="absolute right-4 bottom-4 left-4 flex flex-wrap items-end justify-between gap-3">
                <div className="rounded-[14px] bg-paper/90 px-3.5 py-2 ring-1 ring-mist backdrop-blur">
                  <div className="text-[12px] text-slate">{stats ? 'Kích thước khi in' : `Bàn in ${printerConfig.name}`}</div>
                  <div className={`text-[15px] font-semibold tnum ${overflow ? 'text-alert' : 'text-ink'}`}>
                    {formatDims(stats ? stats.dims : { length: bed.x, width: bed.y, height: bed.z })}
                  </div>
                  {selected && selected.orient === 'auto' && selected.rotated && (
                    <div className="text-[12px] text-solder">Đã tự xoay sang hướng dễ in</div>
                  )}
                </div>
                {selected && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <div role="group" aria-label="Hướng in" className="flex rounded-full bg-paper/90 p-1 ring-1 ring-mist backdrop-blur">
                      {(
                        [
                          ['auto', 'Tự xoay', 'Tự chọn hướng in ít support, mặt đáy bám bàn rộng nhất'],
                          ['face', 'Chọn mặt đáy', 'Bấm vào một mặt của mô hình để đặt mặt đó xuống bàn'],
                          ['file', 'Như file', 'Giữ nguyên hướng trong file'],
                        ] as const
                      ).map(([mode, label, hint]) => {
                        const on = mode === 'face' ? picking || (selected.orient === 'face' && !picking) : !picking && selected.orient === mode
                        return (
                          <button
                            key={mode}
                            type="button"
                            title={hint}
                            aria-pressed={on}
                            disabled={locked}
                            onClick={() => {
                              if (mode === 'face') setPicking((v) => !v)
                              else if (selected.orient !== mode || picking) {
                                setPicking(false)
                                if (selected.orient !== mode) reorient(selected.id, mode)
                              }
                            }}
                            className={`rounded-full px-3 py-1.5 text-[13px] transition-colors disabled:opacity-60 ${
                              on ? 'bg-ink font-semibold text-on-ink' : 'text-ink hover:bg-fog'
                            }`}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => viewerRef.current?.resetView()}
                      aria-label="Đặt lại góc nhìn"
                      title="Đặt lại góc nhìn"
                      className="grid h-10 w-10 place-items-center rounded-full bg-paper/90 text-ink ring-1 ring-mist backdrop-blur transition-colors hover:ring-ink"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 10a6 6 0 1 0 1.8-4.3M4 3.5v3h3" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {busy && (
                <div className="absolute inset-0 flex items-center justify-center bg-paper/60 backdrop-blur-[2px]">
                  <div className="flex items-center gap-3 rounded-full bg-paper px-5 py-3 text-[14px] font-semibold text-ink shadow ring-1 ring-mist">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-mist border-t-solder" aria-hidden="true" />
                    Đang đọc file
                  </div>
                </div>
              )}
            </div>
          </DropZone>
        </div>

        {error && <Notice tone="alert">{error}</Notice>}
        {items.map((it) => {
          const oversize = exceedsBed(it.stats.dims, bed).exceeds
          const inch = it.scale === 1 && !it.inchDismissed && isSuspectedInches(it.stats.dims)
          return (
            <div key={it.id} className="space-y-3 empty:hidden">
              {oversize && (
                <Notice tone="alert">
                  {prefix(it)}
                  <strong className="font-semibold">Vượt khổ bàn in tiêu chuẩn.</strong> Cần chia mảnh hoặc liên hệ tư vấn,
                  bàn in tối đa {bed.x} × {bed.y} × {bed.z} mm.
                </Notice>
              )}
              {!it.stats.isWatertight && (
                <Notice tone="caution">
                  {prefix(it)}Mesh của file không kín, nên số gram và giá có thể lệch nhiều hơn bình thường.
                </Notice>
              )}
              {inch && !busy && !sending && (
                <Notice tone="caution">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span>{prefix(it)}Mô hình nhỏ bất thường. File có thể đang tính bằng inch, nhân ×25,4?</span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-full bg-caution px-3 py-1 text-[13px] font-semibold text-caution-tint"
                        onClick={() => {
                          itemChanging()
                          void plate.setScale(it.id, INCH)
                        }}
                      >
                        Đổi sang mm
                      </button>
                      <button type="button" className="px-2 py-1 text-[13px] font-semibold underline" onClick={() => plate.dismissInch(it.id)}>
                        Giữ nguyên
                      </button>
                    </span>
                  </div>
                </Notice>
              )}
            </div>
          )
        })}
      </div>

      {/* Danh sách món + tuỳ chọn + phiếu tạm tính */}
      <div className="col-span-12 space-y-7 lg:col-span-5">
        {many && (
          <ItemList
            items={items.map((it) => ({
              id: it.id,
              name: it.name,
              dims: it.stats.dims,
              settings: it.settings,
              warn: parts.find((p) => p.id === it.id)?.overflow,
            }))}
            selectedId={selected?.id ?? null}
            onSelect={plate.select}
            onRemove={(id) => {
              itemChanging()
              plate.removeItem(id)
            }}
            disabled={locked}
          />
        )}
        <OptionsPanel
          value={panelValue}
          onChange={onSettingsChange}
          supportReason={supportReason}
          disabled={sending}
          colors={colors}
          colorId={selectedColor.id}
          onColorChange={setColorId}
          itemCaption={many && selected ? `Áp dụng cho món đang chọn: ${selected.name}` : null}
        />
        <QuoteResult
          quote={quote}
          stats={many ? null : stats}
          savings={quote?.savings ?? null}
          separateTotal={quote?.separateTotal ?? null}
          pending={pending}
          onSubmit={() => (sent ? startNewOrder(true) : setShowOrder(true))}
        />
        {showOrder && quote && (
          <OrderForm
            key={formKey}
            quote={quote}
            files={files}
            items={items}
            shared={shared}
            arrangement={arrangement}
            orderCode={orderCode}
            color={selectedColor}
            onClose={() => setShowOrder(false)}
            onBusyChange={onBusyChange}
            onSent={() => setSent(true)}
            onNewOrder={() => startNewOrder(true)}
          />
        )}
      </div>
    </div>
  )
}
