import type { Env } from './env.ts'
import { signEnvelope } from './hmac.ts'

// Gọi Apps Script (Drive/Gmail). Rỗng APPS_SCRIPT_URL = bản preview, không gọi gì.
export async function callAppsScript(
  env: Env,
  action: 'notifyOwner' | 'notifyStatus',
  data: unknown,
): Promise<boolean> {
  if (!env.APPS_SCRIPT_URL) return false
  const envelope = await signEnvelope(env.SHARED_SECRET, action, data)
  const res = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(envelope),
    redirect: 'follow',
  })
  try {
    return ((await res.json()) as { ok?: unknown }).ok === true
  } catch {
    return false
  }
}
