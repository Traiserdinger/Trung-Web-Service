import { createFakeD1 } from './fakeD1.ts'
import type { Env } from '../shared/env.ts'

// Fetcher giả cho ASSETS: ghi lại mọi request để test kiểm tra.
export const fakeAssets = {
  calls: [] as Request[],
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    this.calls.push(new Request(input, init))
    return new Response('asset', { status: 200 })
  },
}

export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createFakeD1(),
    ASSETS: fakeAssets as unknown as Fetcher,
    SHARED_SECRET: 's',
    PUBLIC_SITE_URL: 'https://site',
    ...overrides,
  }
}

// ExecutionContext giả: gom các promise của waitUntil để test có thể await.
export function fakeCtx() {
  const pending: Promise<unknown>[] = []
  return {
    waitUntil(p: Promise<unknown>) {
      pending.push(p)
    },
    passThroughOnException() {},
    async flush() {
      await Promise.all(pending.splice(0))
    },
  } as unknown as ExecutionContext & { flush(): Promise<void> }
}
