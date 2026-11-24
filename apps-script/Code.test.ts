// @vitest-environment node
// Chạy Code.gs trong vm của Node với các dịch vụ Google giả lập.
// Vé và phong bì được tạo bằng chính worker/shared/hmac.ts để chắc chắn hai bên tương thích.
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import { makeTicket, signEnvelope, verifyEnvelope } from '../worker/shared/hmac.ts'

const SECRET = 'test-shared-secret'
const CODE = 'P3D-261120-AAAA'

interface Fetched {
  url: string
  options: { method?: string; contentType?: string; payload: string; muteHttpExceptions?: boolean }
}

interface Fake {
  folders: Map<string, string[]> // tên thư mục → tên các file
  fetches: Fetched[]
  mails: { to: string; subject: string; text: string }[]
  driveFails: boolean
  fetchFails: boolean
  props: Record<string, string>
  ctx: Record<string, unknown> & { doPost(e: unknown): string; doGet(): string }
}

function load(): Fake {
  const f = {
    folders: new Map<string, string[]>(),
    fetches: [],
    mails: [],
    driveFails: false,
    fetchFails: false,
    props: { DRIVE_FOLDER_ID: 'ROOT', OWNER_EMAIL: 'o@x', SHARED_SECRET: SECRET, WORKER_URL: 'https://w.example' },
  } as unknown as Fake
  const folderObj = (n: string) => ({
    getUrl: () => `https://drive/${n}`,
    getFilesByName: (name: string) => ({ hasNext: () => f.folders.get(n)!.includes(name) }),
    createFile: (blob: { name: string }) => void f.folders.get(n)!.push(blob.name),
  })
  const ctx: Record<string, unknown> = {
    console: { error: () => {}, log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => f.props[k] ?? null }) },
    DriveApp: {
      getFolderById: () => ({
        getFoldersByName: (n: string) => ({
          hasNext: () => f.folders.has(n),
          next: () => folderObj(n),
        }),
        createFolder: (n: string) => {
          if (f.driveFails) throw new Error('drive down')
          f.folders.set(n, [])
          return folderObj(n)
        },
      }),
    },
    Utilities: {
      base64Decode: (s: string) => Buffer.from(s, 'base64'),
      newBlob: (_b: unknown, _t: string, name: string) => ({ name }),
      Charset: { UTF_8: 'UTF_8' },
      // Giống Apps Script: trả mảng byte có dấu (-128..127). Không truyền charset thì Apps Script
      // không mã hoá chuỗi theo UTF-8 (chữ có dấu ra chữ ký khác Worker) — giả lập bằng latin1.
      computeHmacSha256Signature: (value: string, key: string, charset?: string) =>
        Array.from(
          createHmac('sha256', Buffer.from(key, charset === 'UTF_8' ? 'utf8' : 'latin1'))
            .update(Buffer.from(value, charset === 'UTF_8' ? 'utf8' : 'latin1'))
            .digest(),
          (b) => (b > 127 ? b - 256 : b),
        ),
    },
    UrlFetchApp: {
      fetch: (url: string, options: Fetched['options']) => {
        f.fetches.push({ url, options })
        if (f.fetchFails) throw new Error('worker down')
        return {}
      },
    },
    MailApp: { sendEmail: (to: string, subject: string, text: string) => void f.mails.push({ to, subject, text }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s: string) => ({ setMimeType: () => s }) },
  }
  vm.createContext(ctx)
  vm.runInContext(readFileSync(resolve(process.cwd(), 'apps-script/Code.gs'), 'utf8'), ctx)
  f.ctx = ctx as Fake['ctx']
  return f
}

let f: Fake
const post = (p: unknown) => JSON.parse(f.ctx.doPost({ postData: { contents: JSON.stringify(p) } }))

const upload = async (over: Record<string, unknown> = {}) => ({
  orderCode: CODE,
  uploadTicket: await makeTicket(SECRET, CODE, 3),
  fileName: 'a.stl',
  fileSize: 3,
  fileBase64: 'AQID',
  ...over,
})

beforeEach(() => {
  f = load()
})

describe('Apps Script upload', () => {
  it('valid ticket → 1 folder, callback to WORKER_URL/api/internal/file with a verifiable envelope', async () => {
    expect(post(await upload())).toEqual({ ok: true, orderCode: CODE })
    expect([...f.folders.keys()]).toEqual([CODE])
    expect(f.folders.get(CODE)).toEqual(['a.stl'])
    expect(f.fetches).toHaveLength(1)
    const { url, options } = f.fetches[0]
    expect(url).toBe('https://w.example/api/internal/file')
    expect(options.method).toBe('post')
    expect(options.contentType).toBe('application/json')
    expect(options.muteHttpExceptions).toBe(true)
    const verified = await verifyEnvelope(SECRET, JSON.parse(options.payload))
    expect(verified).toEqual({ action: 'fileSaved', data: { orderCode: CODE, driveUrl: `https://drive/${CODE}` } })
  })

  it('bad or expired ticket → ok:false, no folder', async () => {
    const msg = 'Phiên gửi file đã hết hạn, vui lòng gửi lại đơn'
    expect(post(await upload({ uploadTicket: 'junk' }))).toEqual({ ok: false, error: msg })
    expect(post(await upload({ fileSize: 4 }))).toEqual({ ok: false, error: msg }) // vé cấp cho size khác
    const old = await makeTicket(SECRET, CODE, 3, Date.now() - 1000 * 1000)
    expect(post(await upload({ uploadTicket: old }))).toEqual({ ok: false, error: msg })
    expect(f.folders.size).toBe(0)
    expect(f.fetches).toHaveLength(0)
  })

  it('missing SHARED_SECRET rejects uploads', async () => {
    const p = await upload()
    delete f.props.SHARED_SECRET
    expect(post(p).ok).toBe(false)
    expect(f.folders.size).toBe(0)
  })

  it('same ticket twice → still 1 folder, 1 file', async () => {
    const p = await upload()
    expect(post(p).ok).toBe(true)
    expect(post(p).ok).toBe(true)
    expect([...f.folders.keys()]).toEqual([CODE])
    expect(f.folders.get(CODE)).toEqual(['a.stl'])
  })

  it('oversize base64 → 35MB error', async () => {
    const big = 'A'.repeat(Math.ceil((35 * 1024 * 1024 * 4) / 3) + 8)
    expect(post(await upload({ fileBase64: big }))).toEqual({
      ok: false,
      error: 'File lớn hơn 35MB, vui lòng gửi qua Zalo',
    })
    expect(f.folders.size).toBe(0)
  })

  it('valid ticket but payload size differs from ticket fileSize → rejected, no folder', async () => {
    const res = post(await upload({ fileBase64: Buffer.alloc(10).toString('base64') }))
    expect(res).toEqual({ ok: false, error: 'File không khớp với đơn, vui lòng gửi lại đơn' })
    expect(f.folders.size).toBe(0)
    expect(f.fetches).toHaveLength(0)
  })

  it('Drive failure → ok:false with Zalo message', async () => {
    f.driveFails = true
    expect(post(await upload())).toEqual({
      ok: false,
      error: 'Không lưu được file, vui lòng gửi qua Zalo kèm mã đơn',
    })
  })

  it('callback failure is only logged, upload still succeeds', async () => {
    f.fetchFails = true
    expect(post(await upload())).toEqual({ ok: true, orderCode: CODE })
  })

  it('sanitizes file names', async () => {
    post(await upload({ fileName: 'a/b:c.stl' }))
    expect(f.folders.get(CODE)).toEqual(['a_b_c.stl'])
  })
})

describe('Apps Script envelopes', () => {
  it('notifyStatus with valid envelope → mail to data.to', async () => {
    const env = await signEnvelope(SECRET, 'notifyStatus', { to: 'k@x', subject: 'S', text: 'T' })
    expect(post(env).ok).toBe(true)
    expect(f.mails).toEqual([{ to: 'k@x', subject: 'S', text: 'T' }])
  })

  it('notifyStatus có chữ tiếng Việt → chữ ký khớp Worker (UTF-8), mail được gửi', async () => {
    const data = { to: 'k@x', subject: '[In 3D Trung] Mã đăng nhập quản trị: 123456', text: 'Đơn đang in → xong' }
    const env = await signEnvelope(SECRET, 'notifyStatus', data)
    expect(post(env).ok).toBe(true)
    expect(f.mails).toEqual([data])
  })

  it('notifyOwner → mail to OWNER_EMAIL', async () => {
    const env = await signEnvelope(SECRET, 'notifyOwner', { subject: 'S', text: 'T' })
    expect(post(env).ok).toBe(true)
    expect(f.mails).toEqual([{ to: 'o@x', subject: 'S', text: 'T' }])
  })

  it('envelope ts 301 s old → unauthorized, no mail', async () => {
    const env = await signEnvelope(SECRET, 'notifyStatus', { to: 'k@x', subject: 'S', text: 'T' }, Date.now() - 301_000)
    expect(post(env)).toEqual({ ok: false, error: 'unauthorized' })
    expect(f.mails).toHaveLength(0)
  })

  it('tampered data or wrong secret → unauthorized', async () => {
    const env = await signEnvelope(SECRET, 'notifyStatus', { to: 'k@x', subject: 'S', text: 'T' })
    expect(post({ ...env, data: { to: 'evil@x', subject: 'S', text: 'T' } }).error).toBe('unauthorized')
    expect(post(await signEnvelope('other', 'notifyStatus', { to: 'k@x', subject: 'S', text: 'T' })).error).toBe('unauthorized')
    expect(f.mails).toHaveLength(0)
  })

  it('missing SHARED_SECRET → unauthorized', async () => {
    const env = await signEnvelope(SECRET, 'notifyOwner', { subject: 'S', text: 'T' })
    delete f.props.SHARED_SECRET
    expect(post(env).error).toBe('unauthorized')
    expect(f.mails).toHaveLength(0)
  })

  it('unknown action with valid signature → error, no mail', async () => {
    const env = await signEnvelope(SECRET, 'bogus', {})
    expect(post(env).ok).toBe(false)
    expect(f.mails).toHaveLength(0)
  })
})
