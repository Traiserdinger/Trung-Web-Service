import { useState } from 'react'
import { requestCode, verifyCode } from './adminApi.ts'

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
      await verifyCode(code.trim())
      onLoggedIn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const btn = 'rounded-md bg-ink px-4 py-2 text-sm font-medium text-on-ink disabled:opacity-40'
  return (
    <div className="flex min-h-screen items-center justify-center bg-studio p-4 text-ink">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-md bg-paper p-6 ring-1 ring-mist">
        <h1 className="font-display text-lg font-bold">Đăng nhập quản trị</h1>
        <button type="button" disabled={busy} onClick={send} className={btn}>Gửi mã tới email</button>
        {sent && (
          <>
            {message && <p className="text-sm text-slate">{message}</p>}
            <label className="block space-y-1 text-sm">
              <span>Mã 6 số</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="tnum w-full rounded-md bg-paper px-3 py-2 ring-1 ring-mist"
              />
            </label>
            <button type="submit" disabled={busy} className={btn}>Đăng nhập</button>
          </>
        )}
        {error && <p role="alert" className="text-alert">{error}</p>}
      </form>
    </div>
  )
}
