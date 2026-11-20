// @vitest-environment node
// Chạy Code.gs trong vm của Node với các dịch vụ Google giả lập.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'

interface Fake {
  folders: string[]
  telegrams: string[]
  mails: string[]
  driveFails: boolean
  ctx: Record<string, unknown> & { doPost(e: unknown): string; doGet(): string }
}

function load(): Fake {
  const f = { folders: [] as string[], telegrams: [] as string[], mails: [] as string[], driveFails: false } as Fake
  const cache = new Map<string, string>()
  const ctx: Record<string, unknown> = {
    console: { error: () => {}, log: () => {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) =>
          ({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', DRIVE_FOLDER_ID: 'ROOT', OWNER_EMAIL: 'o@x' })[k] ?? null,
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => cache.get(k) ?? null,
        put: (k: string, v: string) => void cache.set(k, v),
      }),
    },
    DriveApp: {
      getFolderById: () => ({
        getFoldersByName: (n: string) => ({ hasNext: () => f.folders.includes(n) }),
        createFolder: (n: string) => {
          if (f.driveFails) throw new Error('drive down')
          f.folders.push(n)
          return { createFile: () => {}, getUrl: () => `https://drive/${n}` }
        },
      }),
    },
    Utilities: { base64Decode: (s: string) => Buffer.from(s, 'base64'), newBlob: (_b: unknown, _t: string, name: string) => ({ name }) },
    UrlFetchApp: {
      fetch: (_url: string, o: { payload: string }) => void f.telegrams.push(JSON.parse(o.payload).text),
    },
    MailApp: { sendEmail: (_to: string, subject: string) => void f.mails.push(subject) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => s }) },
  }
  vm.createContext(ctx)
  vm.runInContext(readFileSync(resolve(process.cwd(), 'apps-script/Code.gs'), 'utf8'), ctx)
  f.ctx = ctx as Fake['ctx']
  return f
}

const order = (code: string, phone = '0913014605') => ({
  orderCode: code,
  orderType: 'quote',
  consultReasons: [],
  customer: { name: 'An', phone, email: '', note: '' },
  settings: { material: 'PETG', layerHeight: 0.2, infillPercent: 15, wallLoops: 2, support: false, quantity: 1 },
  dims: { length: 62, width: 40, height: 26 },
  estimate: { grams: 27.3, timeSec: 3900, total: 32000, rangeLow: 26000, rangeHigh: 39000 },
  fileName: 'a.stl',
  fileSize: 3,
  fileBase64: 'AQID',
  turnstileToken: null,
  honeypot: '',
})

let f: Fake
const post = (p: unknown) => JSON.parse(f.ctx.doPost({ postData: { contents: JSON.stringify(p) } }))

beforeEach(() => {
  f = load()
})

describe('Apps Script doPost', () => {
  it('saves a quote order and notifies Telegram and email', () => {
    expect(post(order('P3D-261120-AAAA'))).toEqual({ ok: true, orderCode: 'P3D-261120-AAAA' })
    expect(f.folders).toEqual(['P3D-261120-AAAA'])
    expect(f.telegrams[0]).toMatch(/^🟢 ĐƠN IN 3D P3D-261120-AAAA/)
    expect(f.mails).toEqual(['[Đơn in 3D] P3D-261120-AAAA'])
  })

  it('treats a resend of the same order code as already received (no duplicate folder or message)', () => {
    post(order('P3D-261120-AAAA'))
    expect(post(order('P3D-261120-AAAA'))).toEqual({ ok: true, orderCode: 'P3D-261120-AAAA' })
    expect(f.folders).toEqual(['P3D-261120-AAAA'])
    expect(f.telegrams).toHaveLength(1)
  })

  it('does not count failed saves against the rate limit', () => {
    f.driveFails = true
    for (let i = 0; i < 3; i++) expect(post(order(`P3D-261120-AAA${i + 2}`)).ok).toBe(false)
    f.driveFails = false
    expect(post(order('P3D-261120-AAA9'))).toEqual({ ok: true, orderCode: 'P3D-261120-AAA9' })
  })

  it('still blocks a 4th successful order from the same phone within 10 minutes', () => {
    for (const c of ['P3D-261120-AAA2', 'P3D-261120-AAA3', 'P3D-261120-AAA4']) expect(post(order(c)).ok).toBe(true)
    expect(post(order('P3D-261120-AAA5'))).toEqual({
      ok: false,
      error: 'Bạn đã gửi quá nhiều đơn, vui lòng thử lại sau 10 phút',
    })
  })

  it('answers JSON and still notifies when the estimate is malformed after saving', () => {
    const p = order('P3D-261120-AAAA') as ReturnType<typeof order> & { estimate: { grams: unknown } }
    p.estimate.grams = null
    expect(post(p)).toEqual({ ok: true, orderCode: 'P3D-261120-AAAA' })
    expect(f.telegrams).toHaveLength(1)
  })

  it('rejects a resend under the same code with different content instead of silently dropping it', () => {
    post(order('P3D-261120-AAAA'))
    const changed = order('P3D-261120-AAAA')
    changed.settings = { ...changed.settings, quantity: 5 }
    expect(post(changed).ok).toBe(false)
  })

  it('records a Zalo hand-off order (file too big) without an STL', () => {
    const p = { ...order('P3D-261120-AAAB'), fileBase64: '', fileDelivery: 'zalo' }
    expect(post(p).ok).toBe(true)
    expect(f.telegrams[0]).toMatch(/khách sẽ gửi qua Zalo/)
  })

  it('flags inch-rescaled files and keeps customer notes from forging the Drive line', () => {
    const p = order('P3D-261120-AAAC')
    p.customer = { ...p.customer, note: 'xin chào\nDrive: https://evil.example' }
    post({ ...p, scale: 25.4 })
    const lines = f.telegrams[0].split('\n')
    expect(lines.filter((l) => l.startsWith('Drive: '))).toEqual(['Drive: https://drive/P3D-261120-AAAC'])
    expect(f.telegrams[0]).toMatch(/×25,4/)
  })
})
