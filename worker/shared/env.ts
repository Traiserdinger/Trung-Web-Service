export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  SHARED_SECRET: string
  APPS_SCRIPT_URL?: string
  PUBLIC_SITE_URL: string
  ADMIN_SITE_URL?: string
  TURNSTILE_SECRET?: string
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  ADMIN_SESSION_SECRET?: string
  ADMIN_EMAILS?: string
}
