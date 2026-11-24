import { useState } from 'react'
import { requestCode, verifyCode } from './adminApi.ts'
import { Brand } from './Shell.tsx'
import { IsoSlab } from './ui/IsoSlab.tsx'
import { btnPrimary, inputCls } from './ui/styles.ts'

/** Tấm mạch nhỏ trên mặt khối: một con chip và vài chân mạ vàng. */
function Chip() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
      <g fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="2" strokeLinecap="round">
        <path d="M12 20h22M12 80h30l8-8M88 30v40" />
      </g>
      <rect x="34" y="34" width="32" height="32" rx="3" fill="#1b2420" />
      <g fill="var(--color-enig)">
        {[40, 48, 56].map((y) => (
          <g key={y}>
            <rect x="27" y={y} width="6" height="3" rx="1" />
            <rect x="67" y={y} width="6" height="3" rx="1" />
          </g>
        ))}
      </g>
    </svg>
  )
}

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    setError('')
    try {
      setMessage(await requestCode())
      setSent(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await verifyCode(code.replace(/\D/g, ''))
      onLoggedIn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-studio px-4 text-ink sm:px-6">
      <header className="mx-auto flex h-16 w-full max-w-[1200px] items-center">
        <Brand />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center pb-16">
        <IsoSlab size={120} height={18} color="var(--color-solder-fill)" enig className="mb-2">
          <Chip />
        </IsoSlab>
        <form onSubmit={submit} className="w-full max-w-[400px] space-y-5 rounded-[16px] bg-paper p-6 ring-1 ring-mist sm:p-8">
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.03em] [font-variation-settings:'opsz'_96]">Đăng nhập quản trị</h1>
            <p className="mt-2 text-[15px] text-slate">
              {sent ? 'Mã có hiệu lực trong vài phút. Kiểm tra cả thư rác nếu chưa thấy.' : 'Mã đăng nhập gửi tới email quản trị đã cài sẵn, không cần mật khẩu.'}
            </p>
          </div>
          {!sent && (
            <button type="button" disabled={busy} onClick={send} className={`${btnPrimary} w-full`}>
              Gửi mã tới email
            </button>
          )}
          {sent && (
            <>
              {message && <p className="rounded-[10px] bg-solder-tint px-3.5 py-2.5 text-[14px] text-solder">{message}</p>}
              <label className="block">
                <span className="text-[14px] font-semibold">Mã 6 số</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  className={`${inputCls} tnum mt-1.5 text-[21px] tracking-[0.2em]`}
                />
              </label>
              <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
                Đăng nhập
              </button>
              <button type="button" disabled={busy} onClick={send} className="w-full text-[14px] text-slate underline-offset-2 hover:text-ink hover:underline disabled:opacity-40">
                Gửi lại mã
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-[10px] bg-alert-tint px-3.5 py-2.5 text-[14px] text-alert">
              {error}
            </p>
          )}
        </form>
      </main>
    </div>
  )
}
