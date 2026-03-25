import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { PaymentClient, Webhook } from '@portone/server-sdk'
import { analyzeSentiment, batchAnalyzeSentiments, generateReply } from '../services/ai.ts'
import { generate_session_token, hash_password, hash_session_token, sign_access_token, verify_access_token, verify_password } from '../services/auth.ts'
import { decrypt_secret, encrypt_secret } from '../services/secrets.ts'

type Bindings = {
  DB: D1Database
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
  JWT_SECRET: string
  CRAWLER_API_BASE: string
  CRAWLER_SHARED_SECRET: string
  CREDENTIALS_ENCRYPTION_KEY: string
  PORTONE_API_SECRET: string
  PORTONE_STORE_ID: string
  PORTONE_CHANNEL_KEY: string
  PORTONE_WEBHOOK_SECRET: string
  APP_BASE_URL: string
}

type AuthUser = {
  id: number
  email: string
  name: string
  role: string
  store_id: number | null
}

type Variables = {
  auth_user: AuthUser
}

type ReviewRecord = Record<string, unknown>

const supported_platforms = new Set(['baemin', 'coupang_eats', 'yogiyo'])
const direct_session_platform_meta: Record<string, {
  label: string
  login_url: string
  review_url: string
}> = {
  baemin: {
    label: '배달의민족',
    login_url: 'https://self.baemin.com/bridge',
    review_url: 'https://self.baemin.com/'
  },
  coupang_eats: {
    label: '쿠팡이츠',
    login_url: 'https://store.coupangeats.com/login',
    review_url: 'https://store.coupangeats.com/reviews'
  },
  yogiyo: {
    label: '요기요',
    login_url: 'https://ceo.yogiyo.co.kr/login',
    review_url: 'https://ceo.yogiyo.co.kr/reviews'
  }
}
const allowed_statuses = new Set(['pending', 'generated', 'approved', 'posted', 'failed'])
const allowed_sentiments = new Set(['positive', 'neutral', 'negative'])
const access_token_ttl_seconds = 60 * 60 * 8
const refresh_token_ttl_days = 30
const refresh_cookie_name = 'respondio_refresh_token'
const subscription_cycle_days = 30
const public_health_crawler_timeout_ms = 2500

export const apiRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

function get_ai_config(c: any) {
  return {
    apiKey: c.env.OPENAI_API_KEY || '',
    baseUrl: c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  }
}

function get_jwt_secret(c: any) {
  return c.env.JWT_SECRET || 'respondio-local-jwt-secret'
}

function get_crawler_base(c: any) {
  return String(c.env.CRAWLER_API_BASE || 'http://localhost:4000').trim().replace(/\/$/, '')
}

function get_crawler_secret(c: any) {
  return c.env.CRAWLER_SHARED_SECRET || 'respondio-local-crawler-secret'
}

function get_credentials_encryption_key(c: any) {
  return c.env.CREDENTIALS_ENCRYPTION_KEY || ''
}

function get_app_base_url(c: any) {
  return (c.env.APP_BASE_URL || new URL(c.req.url).origin).replace(/\/$/, '')
}

function is_secure_request(c: any) {
  const forwarded_proto = c.req.header('x-forwarded-proto')
  return forwarded_proto === 'https' || c.req.url.startsWith('https://')
}

function get_crawler_headers(c: any, include_json = false) {
  return {
    ...(include_json ? { 'Content-Type': 'application/json' } : {}),
    ...(c.env.CRAWLER_SHARED_SECRET ? { 'X-Crawler-Secret': get_crawler_secret(c) } : {})
  }
}

async function fetch_crawler(
  c: any,
  path: string,
  options: RequestInit = {},
  timeout_ms = 15000,
  timeout_message = '크롤러 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout_ms)

  try {
    return await fetch(`${get_crawler_base(c)}${path}`, {
      ...options,
      signal: controller.signal
    })
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(timeout_message)
    }

    throw error
  } finally {
    clearTimeout(timer)
  }
}

function is_admin_role(role: string) {
  return role === 'admin' || role === 'super_admin'
}

function get_direct_session_platform_meta(platform: string) {
  return direct_session_platform_meta[platform] || {
    label: platform,
    login_url: '',
    review_url: ''
  }
}

function get_portone_public_config(c: any) {
  return {
    store_id: c.env.PORTONE_STORE_ID || '',
    channel_key: c.env.PORTONE_CHANNEL_KEY || ''
  }
}

function is_portone_client_configured(c: any) {
  const config = get_portone_public_config(c)
  return !!config.store_id && !!config.channel_key
}

function is_portone_server_configured(c: any) {
  return is_portone_client_configured(c) && !!c.env.PORTONE_API_SECRET
}

function get_portone_payment_client(c: any) {
  if (!c.env.PORTONE_API_SECRET) {
    throw new Error('PORTONE_API_SECRET is not configured')
  }

  return PaymentClient({ secret: c.env.PORTONE_API_SECRET })
}

function as_number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function json_error(c: any, status: number, code: string, message: string, retryable = false) {
  return c.json({
    error: {
      code,
      message,
      retryable
    }
  }, status)
}

function parse_menu_items(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((item) => String(item)).filter(Boolean)

  try {
    const parsed = JSON.parse(String(raw))
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item)).filter(Boolean)
    }
  } catch {
    return String(raw)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

async function read_json_body<T>(c: any): Promise<T> {
  return c.req.json().catch(() => ({} as T))
}

async function read_json_or_text(response: Response) {
  const text = await response.text().catch(() => '')
  if (!text) {
    return { data: null as any, text: '' }
  }

  try {
    return { data: JSON.parse(text) as any, text }
  } catch {
    return { data: null as any, text }
  }
}

async function load_auth_user(db: D1Database, user_id: number): Promise<AuthUser | null> {
  const user = await db.prepare('SELECT id, email, name, role, status FROM users WHERE id = ?').bind(user_id).first<any>()
  if (!user || (user.status && user.status !== 'active')) return null

  const store = await db.prepare('SELECT id FROM stores WHERE user_id = ? ORDER BY id ASC LIMIT 1').bind(user_id).first<any>()

  return {
    id: as_number(user.id),
    email: String(user.email || ''),
    name: String(user.name || ''),
    role: String(user.role || 'owner'),
    store_id: store ? as_number(store.id) : null
  }
}

async function require_admin(c: any) {
  const auth_user = c.get('auth_user')
  if (!auth_user || !is_admin_role(auth_user.role)) {
    return json_error(c, 403, 'forbidden_admin_only', '관리자만 접근할 수 있습니다.')
  }

  return null
}

function resolve_store_id(auth_user: AuthUser, requested_store_id?: number | null) {
  if (requested_store_id && requested_store_id > 0 && is_admin_role(auth_user.role)) {
    return requested_store_id
  }

  return auth_user.store_id
}

async function load_store_scoped_review(db: D1Database, review_id: string, store_id: number | null) {
  let query = `
    SELECT r.*, s.store_name, s.reply_style, s.reply_tone_sample
    FROM reviews r
    JOIN stores s ON s.id = r.store_id
    WHERE r.id = ?
  `
  const params: unknown[] = [review_id]

  if (store_id) {
    query += ' AND r.store_id = ?'
    params.push(store_id)
  }

  return db.prepare(query).bind(...params).first<any>()
}

async function load_selected_candidate(db: D1Database, review_id: string) {
  return db.prepare('SELECT * FROM reply_candidates WHERE review_id = ? AND is_selected = 1 ORDER BY id DESC LIMIT 1').bind(review_id).first<any>()
}

async function load_store_settings(db: D1Database, store_id: number) {
  return db.prepare(
    'SELECT id, user_id, store_name, business_number_masked, reply_style, reply_tone_sample FROM stores WHERE id = ?'
  ).bind(store_id).first<any>()
}

async function load_platform_connection(db: D1Database, store_id: number, platform: string) {
  return db.prepare(
    `
      SELECT id, store_id, platform, connection_status, platform_store_id, last_sync_at, login_email,
             login_password_encrypted, auth_mode, session_status, session_connected_at,
             session_last_validated_at, last_error, created_at, updated_at
      FROM store_platform_connections
      WHERE store_id = ? AND platform = ?
    `
  ).bind(store_id, platform).first<any>()
}

async function load_platform_session_state_encrypted(db: D1Database, store_id: number, platform: string) {
  const record = await db.prepare(
    'SELECT session_state_encrypted FROM store_platform_connections WHERE store_id = ? AND platform = ?'
  ).bind(store_id, platform).first<any>()

  return record?.session_state_encrypted ? String(record.session_state_encrypted) : null
}

async function write_platform_session_state_encrypted(
  db: D1Database,
  store_id: number,
  platform: string,
  session_state_encrypted: string | null
) {
  const existing = await load_platform_connection(db, store_id, platform)
  if (existing) {
    await db.prepare(
      'UPDATE store_platform_connections SET session_state_encrypted = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(session_state_encrypted, existing.id).run()

    return true
  }

  await db.prepare(`
    INSERT INTO store_platform_connections (
      store_id, platform, connection_status, platform_store_id, login_email,
      login_password_encrypted, auth_mode, session_status, session_connected_at,
      session_last_validated_at, last_error, last_sync_at, session_state_encrypted, updated_at
    )
    VALUES (?, ?, 'disconnected', NULL, NULL, NULL, 'credentials', 'inactive', NULL, NULL, NULL, NULL, ?, datetime('now'))
  `).bind(
    store_id,
    platform,
    session_state_encrypted
  ).run()

  return true
}

function sanitize_platform_connection(connection: any) {
  if (!connection) return null

  return {
    id: as_number(connection.id),
    store_id: as_number(connection.store_id),
    platform: String(connection.platform || ''),
    connection_status: String(connection.connection_status || 'disconnected'),
    platform_store_id: connection.platform_store_id ? String(connection.platform_store_id) : null,
    login_email: connection.login_email ? String(connection.login_email) : null,
    has_credentials: !!connection.login_password_encrypted,
    auth_mode: String(connection.auth_mode || 'credentials'),
    session_status: String(connection.session_status || 'inactive'),
    session_connected_at: connection.session_connected_at || null,
    session_last_validated_at: connection.session_last_validated_at || null,
    last_sync_at: connection.last_sync_at || null,
    last_error: connection.last_error || null,
    created_at: connection.created_at || null,
    updated_at: connection.updated_at || null
  }
}

async function sync_platform_connection_record(
  db: D1Database,
  store_id: number,
  platform: string,
  payload: {
    connection_status: string
    platform_store_id?: string | null
    login_email?: string | null
    login_password_encrypted?: string | null
    auth_mode?: string | null
    session_status?: string | null
    session_connected_at?: string | null
    session_last_validated_at?: string | null
    last_error?: string | null
    touch_sync_time?: boolean
  }
) {
  const existing = await load_platform_connection(db, store_id, platform)
  const next_platform_store_id = Object.prototype.hasOwnProperty.call(payload, 'platform_store_id')
    ? payload.platform_store_id ?? null
    : existing?.platform_store_id ?? null
  const next_login_email = Object.prototype.hasOwnProperty.call(payload, 'login_email')
    ? payload.login_email ?? null
    : existing?.login_email ?? null
  const next_encrypted_password = Object.prototype.hasOwnProperty.call(payload, 'login_password_encrypted')
    ? payload.login_password_encrypted ?? null
    : existing?.login_password_encrypted ?? null
  const next_auth_mode = Object.prototype.hasOwnProperty.call(payload, 'auth_mode')
    ? payload.auth_mode ?? 'credentials'
    : existing?.auth_mode ?? 'credentials'
  const next_session_status = Object.prototype.hasOwnProperty.call(payload, 'session_status')
    ? payload.session_status ?? 'inactive'
    : existing?.session_status ?? 'inactive'
  const next_session_connected_at = Object.prototype.hasOwnProperty.call(payload, 'session_connected_at')
    ? payload.session_connected_at ?? null
    : existing?.session_connected_at ?? null
  const next_session_last_validated_at = Object.prototype.hasOwnProperty.call(payload, 'session_last_validated_at')
    ? payload.session_last_validated_at ?? null
    : existing?.session_last_validated_at ?? null

  if (existing) {
    await db.prepare(`
      UPDATE store_platform_connections
      SET connection_status = ?,
          platform_store_id = ?,
          login_email = ?,
          login_password_encrypted = ?,
          auth_mode = ?,
          session_status = ?,
          session_connected_at = ?,
          session_last_validated_at = ?,
          last_error = ?,
          last_sync_at = CASE WHEN ? THEN datetime('now') ELSE last_sync_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      payload.connection_status,
      next_platform_store_id,
      next_login_email,
      next_encrypted_password,
      next_auth_mode,
      next_session_status,
      next_session_connected_at,
      next_session_last_validated_at,
      payload.last_error ?? null,
      payload.touch_sync_time ? 1 : 0,
      existing.id
    ).run()
  } else {
    await db.prepare(`
      INSERT INTO store_platform_connections (
        store_id, platform, connection_status, platform_store_id, login_email,
        login_password_encrypted, auth_mode, session_status, session_connected_at,
        session_last_validated_at, last_error, last_sync_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END, datetime('now'))
    `).bind(
      store_id,
      platform,
      payload.connection_status,
      next_platform_store_id,
      next_login_email,
      next_encrypted_password,
      next_auth_mode,
      next_session_status,
      next_session_connected_at,
      next_session_last_validated_at,
      payload.last_error ?? null,
      payload.touch_sync_time ? 1 : 0
    ).run()
  }

  return load_platform_connection(db, store_id, platform)
}

async function issue_access_token(c: any, auth_user: AuthUser) {
  return sign_access_token({
    user_id: auth_user.id,
    email: auth_user.email,
    role: auth_user.role,
    store_id: auth_user.store_id
  }, get_jwt_secret(c), access_token_ttl_seconds)
}

async function create_refresh_session(c: any, auth_user: AuthUser) {
  const session_token = generate_session_token()
  const token_hash = await hash_session_token(session_token)

  await c.env.DB.prepare(
    'INSERT INTO auth_sessions (user_id, token_hash, expires_at, user_agent, ip_address) VALUES (?, ?, datetime("now", ?), ?, ?)'
  ).bind(
    auth_user.id,
    token_hash,
    `+${refresh_token_ttl_days} days`,
    c.req.header('user-agent') || null,
    c.req.header('cf-connecting-ip') || null
  ).run()

  setCookie(c, refresh_cookie_name, session_token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: is_secure_request(c),
    path: '/',
    maxAge: refresh_token_ttl_days * 24 * 60 * 60
  })
}

async function revoke_refresh_session(db: D1Database, token_hash: string) {
  await db.prepare(
    'UPDATE auth_sessions SET revoked_at = datetime("now") WHERE token_hash = ? AND revoked_at IS NULL'
  ).bind(token_hash).run()
}

function clear_refresh_session_cookie(c: any) {
  deleteCookie(c, refresh_cookie_name, {
    path: '/',
    secure: is_secure_request(c),
    sameSite: 'Lax'
  })
}

function connection_uses_direct_session(connection: any) {
  return String(connection?.auth_mode || 'credentials') === 'direct_session'
}

async function login_platform_via_crawler(c: any, platform: string, store_id: number, credentials: { email: string; password: string }) {
  try {
    const response = await fetch_crawler(c, '/login', {
      method: 'POST',
      headers: get_crawler_headers(c, true),
      body: JSON.stringify({
        platform,
        store_id,
        email: credentials.email,
        password: credentials.password
      })
    }, 20000, '크롤러 로그인 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.')

    const { data: result, text } = await read_json_or_text(response)
    if (!result) {
      return {
        success: false,
        message: text
          ? `크롤러 응답을 해석하지 못했습니다: ${text.slice(0, 180)}`
          : '크롤러 서버가 빈 응답을 반환했습니다. CRAWLER_API_BASE와 크롤러 상태를 확인해주세요.'
      }
    }

    return {
      success: response.ok && !!result.success,
      message: result.message || result.error || '플랫폼 로그인에 실패했습니다.'
    }
  } catch (error: any) {
    return {
      success: false,
      message: `크롤러 서버 연결에 실패했습니다: ${error.message}`
    }
  }
}

async function get_live_session_state_from_crawler(c: any, platform: string, store_id: number) {
  const url = new URL(`${get_crawler_base(c)}/sessions`)
  url.searchParams.set('platform', platform)
  url.searchParams.set('store_id', String(store_id))
  url.searchParams.set('restore', '1')

  const response = await fetch_crawler(c, `${url.pathname}${url.search}`, {
    headers: get_crawler_headers(c)
  }, 10000, '플랫폼 세션 확인이 지연되고 있습니다. 잠시 후 다시 시도해주세요.')

  const result = await response.json().catch(() => ({})) as any
  const session = result?.session || null
  const active = response.ok && !!session?.loggedIn

  return {
    success: active,
    session,
    message: active
      ? '플랫폼 운영 세션이 활성 상태입니다.'
      : result?.message || '현재 활성 운영 세션이 없습니다.'
  }
}

async function clear_live_platform_session(c: any, platform: string, store_id: number) {
  const response = await fetch_crawler(c, '/sessions/clear', {
    method: 'POST',
    headers: get_crawler_headers(c, true),
    body: JSON.stringify({
      platform,
      store_id
    })
  }, 10000, '크롤러 세션 정리가 지연되고 있습니다. 잠시 후 다시 시도해주세요.')

  const { data, text } = await read_json_or_text(response)
  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || text || '크롤러 세션 정리에 실패했습니다.')
  }

  return data
}

async function start_remote_platform_auth(c: any, platform: string, store_id: number) {
  const response = await fetch_crawler(c, '/remote-auth/start', {
    method: 'POST',
    headers: get_crawler_headers(c, true),
    body: JSON.stringify({
      platform,
      store_id
    })
  }, 12000, '원격 브라우저 준비가 지연되고 있습니다. 다시 시도하면 새 세션을 빠르게 만들 수 있습니다.')

  const { data, text } = await read_json_or_text(response)
  if (!data) {
    throw new Error(text || '크롤러가 원격 인증 세션을 시작하지 못했습니다.')
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || '원격 인증 세션 시작에 실패했습니다.')
  }

  return data
}

function build_remote_auth_scoped_path(session_id: string, suffix: string, platform: string, store_id: number) {
  const params = new URLSearchParams({
    platform,
    store_id: String(store_id)
  })
  return `/remote-auth/${session_id}/${suffix}?${params.toString()}`
}

async function read_remote_platform_auth_status(c: any, session_id: string, platform: string, store_id: number) {
  const response = await fetch_crawler(c, build_remote_auth_scoped_path(session_id, 'status', platform, store_id), {
    headers: get_crawler_headers(c)
  }, 8000, '원격 인증 상태 확인이 지연되고 있습니다. 잠시 후 자동으로 다시 시도해주세요.')
  const { data, text } = await read_json_or_text(response)
  if (!data) {
    throw new Error(text || '크롤러가 원격 인증 상태를 반환하지 않았습니다.')
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || '원격 인증 상태 조회에 실패했습니다.')
  }

  return data
}

async function send_remote_platform_auth_action(
  c: any,
  session_id: string,
  platform: string,
  store_id: number,
  payload: Record<string, unknown>
) {
  const response = await fetch_crawler(c, `/remote-auth/${session_id}/action`, {
    method: 'POST',
    headers: get_crawler_headers(c, true),
    body: JSON.stringify({
      ...payload,
      platform,
      store_id
    })
  }, 9000, '원격 브라우저 조작 응답이 지연되고 있습니다. 다시 한 번 입력하거나 잠시 후 재시도해주세요.')
  const { data, text } = await read_json_or_text(response)
  if (!data) {
    throw new Error(text || '크롤러가 원격 인증 액션 결과를 반환하지 않았습니다.')
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || '원격 인증 액션 수행에 실패했습니다.')
  }

  return data
}

async function complete_remote_platform_auth(c: any, session_id: string, platform: string, store_id: number) {
  const response = await fetch_crawler(c, `/remote-auth/${session_id}/complete`, {
    method: 'POST',
    headers: get_crawler_headers(c, true),
    body: JSON.stringify({ platform, store_id })
  }, 10000, '원격 인증 완료 처리가 지연되고 있습니다. 잠시 후 다시 시도해주세요.')
  const { data, text } = await read_json_or_text(response)
  if (!data) {
    throw new Error(text || '크롤러가 원격 인증 완료 결과를 반환하지 않았습니다.')
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || '원격 인증 완료 처리에 실패했습니다.')
  }

  return data
}

async function cancel_remote_platform_auth(c: any, session_id: string, platform: string, store_id: number) {
  const response = await fetch_crawler(c, `/remote-auth/${session_id}/cancel`, {
    method: 'POST',
    headers: get_crawler_headers(c, true),
    body: JSON.stringify({ platform, store_id })
  }, 8000, '원격 인증 종료 처리가 지연되고 있습니다. 잠시 후 다시 시도해주세요.')
  const { data, text } = await read_json_or_text(response)
  if (!data) {
    throw new Error(text || '크롤러가 원격 인증 종료 결과를 반환하지 않았습니다.')
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || data.message || '원격 인증 종료에 실패했습니다.')
  }

  return data
}

async function ensure_live_platform_session(c: any, store_id: number, platform: string) {
  const connection = await load_platform_connection(c.env.DB, store_id, platform)
  if (!connection) {
    return { success: false, error: '플랫폼 계정이 연결되어 있지 않습니다.' }
  }

  if (connection_uses_direct_session(connection)) {
    try {
      const session_state = await get_live_session_state_from_crawler(c, platform, store_id)
      const updated_connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
        connection_status: session_state.success ? 'connected' : 'disconnected',
        auth_mode: 'direct_session',
        session_status: session_state.success ? 'connected' : 'inactive',
        session_connected_at: session_state.success ? (connection.session_connected_at || new Date().toISOString()) : null,
        session_last_validated_at: session_state.success ? new Date().toISOString() : null,
        last_error: session_state.success ? null : session_state.message,
        touch_sync_time: session_state.success
      })

      return {
        success: session_state.success,
        error: session_state.success ? null : session_state.message,
        connection: sanitize_platform_connection(updated_connection)
      }
    } catch (error: any) {
      const updated_connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
        connection_status: 'error',
        auth_mode: 'direct_session',
        session_status: 'error',
        session_last_validated_at: new Date().toISOString(),
        last_error: error.message
      })

      return {
        success: false,
        error: error.message,
        connection: sanitize_platform_connection(updated_connection)
      }
    }
  }

  if (!connection?.login_email || !connection?.login_password_encrypted) {
    return { success: false, error: '플랫폼 계정이 연결되어 있지 않습니다.' }
  }

  try {
    const session_state = await get_live_session_state_from_crawler(c, platform, store_id)
    if (session_state.success) {
      const updated_connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
        connection_status: 'connected',
        auth_mode: 'credentials',
        session_status: 'connected',
        session_connected_at: connection.session_connected_at || new Date().toISOString(),
        session_last_validated_at: new Date().toISOString(),
        last_error: null,
        touch_sync_time: true
      })

      return {
        success: true,
        error: null,
        connection: sanitize_platform_connection(updated_connection)
      }
    }
  } catch (error: any) {
    // 세션 상태 조회 실패 시에는 저장된 자격증명으로 재로그인을 시도한다.
  }

  const encryption_key = get_credentials_encryption_key(c)
  if (!encryption_key) {
    return { success: false, error: 'CREDENTIALS_ENCRYPTION_KEY가 설정되지 않았습니다.' }
  }

  try {
    const password = await decrypt_secret(String(connection.login_password_encrypted), encryption_key)
    const login_result = await login_platform_via_crawler(c, platform, store_id, {
      email: String(connection.login_email),
      password
    })

    const updated_connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
      connection_status: login_result.success ? 'connected' : 'error',
      auth_mode: 'credentials',
      session_status: login_result.success ? 'connected' : 'error',
      session_connected_at: login_result.success ? new Date().toISOString() : null,
      session_last_validated_at: login_result.success ? new Date().toISOString() : null,
      last_error: login_result.success ? null : login_result.message,
      touch_sync_time: login_result.success
    })

    return {
      success: login_result.success,
      error: login_result.success ? null : login_result.message,
      connection: sanitize_platform_connection(updated_connection)
    }
  } catch (error: any) {
    const updated_connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
      connection_status: 'error',
      session_status: 'error',
      session_last_validated_at: new Date().toISOString(),
      last_error: error.message
    })

    return {
      success: false,
      error: error.message,
      connection: sanitize_platform_connection(updated_connection)
    }
  }
}

async function upsert_reply_record(db: D1Database, review_id: string, candidate_id: number | null, reply_text: string) {
  const existing_reply = await db.prepare('SELECT id FROM replies WHERE review_id = ? ORDER BY id DESC LIMIT 1').bind(review_id).first<any>()

  if (existing_reply) {
    await db.prepare(
      'UPDATE replies SET candidate_id = ?, final_reply_text = ?, posted_at = NULL, post_status = ? WHERE id = ?'
    ).bind(candidate_id, reply_text, 'pending', existing_reply.id).run()
    return as_number(existing_reply.id)
  }

  const inserted = await db.prepare(
    'INSERT INTO replies (review_id, candidate_id, final_reply_text, post_status) VALUES (?, ?, ?, ?)'
  ).bind(review_id, candidate_id, reply_text, 'pending').run()

  return as_number(inserted.meta.last_row_id)
}

async function write_job_log(db: D1Database, job_type: string, status: string, payload: unknown, error_message?: string) {
  await db.prepare(
    'INSERT INTO job_logs (job_type, status, payload, error_message, created_at) VALUES (?, ?, ?, ?, datetime("now"))'
  ).bind(job_type, status, JSON.stringify(payload ?? {}), error_message || null).run()
}

async function post_reply_to_platform(c: any, review_id: string, store_id: number | null) {
  const db = c.env.DB as D1Database

  let query = `
    SELECT r.id, r.platform, r.platform_review_id, rep.id as reply_id, rep.final_reply_text
    FROM reviews r
    JOIN replies rep ON rep.review_id = r.id
    WHERE r.id = ?
  `
  const params: unknown[] = [review_id]

  if (store_id) {
    query += ' AND r.store_id = ?'
    params.push(store_id)
  }

  const record = await db.prepare(query).bind(...params).first<any>()
  if (!record) {
    return { success: false, error: '등록할 승인 답변이 없습니다.' }
  }

  if (!record.platform_review_id) {
    await db.prepare('UPDATE replies SET post_status = ? WHERE id = ?').bind('failed', record.reply_id).run()
    await write_job_log(db, 'reply_post', 'failed', { review_id }, 'platform_review_id missing')
    return { success: false, error: '플랫폼 리뷰 ID가 없어 등록할 수 없습니다.' }
  }

  try {
    const response = await fetch(`${get_crawler_base(c)}/post-reply`, {
      method: 'POST',
      headers: get_crawler_headers(c, true),
      body: JSON.stringify({
        platform: record.platform,
        store_id,
        review_id: record.platform_review_id,
        reply_text: record.final_reply_text
      })
    })

    const result = await response.json() as any
    if (!response.ok || !result.success) {
      await db.prepare('UPDATE replies SET post_status = ? WHERE id = ?').bind('failed', record.reply_id).run()
      await write_job_log(db, 'reply_post', 'failed', { review_id, platform: record.platform }, result.error || result.message || 'crawler post failed')
      return { success: false, error: result.error || result.message || '답변 등록에 실패했습니다.' }
    }

    await db.prepare('UPDATE replies SET post_status = ?, posted_at = datetime("now") WHERE id = ?').bind('posted', record.reply_id).run()
    await db.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind('posted', review_id).run()
    await write_job_log(db, 'reply_post', 'completed', { review_id, platform: record.platform })

    return { success: true }
  } catch (error: any) {
    await db.prepare('UPDATE replies SET post_status = ? WHERE id = ?').bind('failed', record.reply_id).run()
    await write_job_log(db, 'reply_post', 'failed', { review_id, platform: record.platform }, error.message)
    return { success: false, error: error.message }
  }
}

async function ingest_reviews(db: D1Database, reviews: ReviewRecord[], store_id: number) {
  let inserted_count = 0
  let skipped_count = 0

  for (const review of reviews) {
    try {
      if (review.platform_review_id) {
        const existing = await db.prepare(
          'SELECT id FROM reviews WHERE platform_review_id = ? AND store_id = ?'
        ).bind(review.platform_review_id, store_id).first<any>()

        if (existing) {
          skipped_count += 1
          continue
        }
      }

      await db.prepare(`
        INSERT INTO reviews (
          store_id,
          platform,
          platform_review_id,
          customer_name,
          rating,
          review_text,
          menu_items,
          sentiment,
          status,
          customer_type,
          is_repeat_customer,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'))
      `).bind(
        store_id,
        String(review.platform || 'baemin'),
        review.platform_review_id ? String(review.platform_review_id) : null,
        String(review.customer_name || '고객'),
        Number(review.rating || 4),
        String(review.review_text || ''),
        JSON.stringify(parse_menu_items(review.menu_items)),
        review.sentiment ? String(review.sentiment) : null,
        String(review.customer_type || 'new'),
        as_number(review.is_repeat_customer || 0)
      ).run()

      inserted_count += 1

      if (review.customer_name) {
        const customer_key = `${review.platform || 'baemin'}-${review.customer_name}`
        const existing_customer = await db.prepare(
          'SELECT id, order_count FROM customers WHERE store_id = ? AND customer_key = ?'
        ).bind(store_id, customer_key).first<any>()

        if (existing_customer) {
          const new_count = as_number(existing_customer.order_count) + 1
          const customer_type = new_count >= 5 ? 'loyal' : new_count >= 2 ? 'repeat' : 'new'
          await db.prepare(
            'UPDATE customers SET order_count = ?, customer_type = ?, last_order_at = datetime("now") WHERE id = ?'
          ).bind(new_count, customer_type, existing_customer.id).run()
        } else {
          await db.prepare(
            'INSERT INTO customers (store_id, customer_key, customer_name, customer_type, order_count, last_order_at) VALUES (?, ?, ?, ?, 1, datetime("now"))'
          ).bind(store_id, customer_key, review.customer_name, 'new').run()
        }
      }
    } catch (error: any) {
      await write_job_log(db, 'review_sync', 'failed', { store_id, platform: review.platform }, error.message)
    }
  }

  await write_job_log(db, 'review_sync', 'completed', { store_id, inserted_count, skipped_count })

  return { inserted_count, skipped_count }
}

apiRoutes.use('*', async (c, next) => {
  const path = c.req.path

  if (
    path.endsWith('/health/public') ||
    path.endsWith('/auth/login') ||
    path.endsWith('/auth/signup') ||
    path.endsWith('/auth/refresh') ||
    path.endsWith('/auth/logout') ||
    path.endsWith('/webhooks/portone')
  ) {
    await next()
    return
  }

  if (path.endsWith('/crawler/reviews') || path.endsWith('/crawler/platform-session-state')) {
    if (!c.env.CRAWLER_SHARED_SECRET) {
      return json_error(c, 503, 'crawler_secret_not_configured', 'CRAWLER_SHARED_SECRET가 설정되지 않았습니다.')
    }

    const provided_secret = c.req.header('x-crawler-secret')
    if (provided_secret === get_crawler_secret(c)) {
      await next()
      return
    }

    return json_error(c, 401, 'crawler_unauthorized', '크롤러 인증에 실패했습니다.')
  }

  const authorization = c.req.header('Authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) {
    return json_error(c, 401, 'auth_required', '로그인이 필요합니다.')
  }

  const payload = await verify_access_token(token, get_jwt_secret(c))
  if (!payload) {
    return json_error(c, 401, 'auth_invalid_token', '인증 토큰이 유효하지 않습니다.')
  }

  const auth_user = await load_auth_user(c.env.DB, payload.user_id)
  if (!auth_user) {
    return json_error(c, 401, 'auth_user_not_found', '사용자를 찾을 수 없습니다.')
  }

  c.set('auth_user', auth_user)
  await next()
})

apiRoutes.get('/health/public', async (c) => {
  let db_ready = false
  let db_error: string | null = null

  try {
    const table = await c.env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1"
    ).first<any>()
    db_ready = !!table?.name
  } catch (error: any) {
    db_error = error?.message || 'db_check_failed'
  }

  let crawler_reachable = false
  let crawler_status = null
  let crawler_error: string | null = null

  try {
    const response = await fetch_crawler(
      c,
      '/health',
      {},
      public_health_crawler_timeout_ms,
      'crawler_timeout'
    )
    if (response.ok) {
      crawler_reachable = true
      crawler_status = await response.json().catch(() => null)
    } else {
      crawler_error = `crawler_http_${response.status}`
    }
  } catch (error: any) {
    crawler_error = error?.message || 'crawler_check_failed'
  }

  return c.json({
    status: db_ready && crawler_reachable ? 'ok' : 'degraded',
    app_base_url: get_app_base_url(c),
    billing_mode: is_portone_server_configured(c) ? 'self_serve' : 'beta',
    db: {
      ready: db_ready,
      error: db_error
    },
    crawler: {
      base_url: get_crawler_base(c),
      reachable: crawler_reachable,
      error: crawler_error,
      status: crawler_status
    }
  })
})

// ============ AUTH ============
apiRoutes.post('/auth/login', async (c) => {
  const { email, password } = await read_json_body<{ email?: string; password?: string }>(c)
  if (!email || !password) {
    return json_error(c, 400, 'auth_invalid_payload', '이메일과 비밀번호를 입력해주세요.')
  }

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role, status, password_hash FROM users WHERE email = ?'
  ).bind(email).first<any>()

  if (!user || user.status === 'deleted') {
    return json_error(c, 401, 'auth_invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.')
  }

  const password_matches = await verify_password(String(email), String(password), String(user.password_hash || ''))
  if (!password_matches) {
    return json_error(c, 401, 'auth_invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.')
  }

  const auth_user = await load_auth_user(c.env.DB, as_number(user.id))
  if (!auth_user) {
    return json_error(c, 401, 'auth_user_not_found', '사용자를 찾을 수 없습니다.')
  }

  const access_token = await issue_access_token(c, auth_user)
  await create_refresh_session(c, auth_user)

  return c.json({
    access_token,
    expires_in: access_token_ttl_seconds,
    user: auth_user
  })
})

apiRoutes.post('/auth/signup', async (c) => {
  const { email, password, name, store_name } = await read_json_body<{
    email?: string
    password?: string
    name?: string
    store_name?: string
  }>(c)

  if (!email || !password || !name) {
    return json_error(c, 400, 'signup_invalid_payload', '이름, 이메일, 비밀번호를 모두 입력해주세요.')
  }

  if (password.length < 8) {
    return json_error(c, 400, 'signup_weak_password', '비밀번호는 8자 이상이어야 합니다.')
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<any>()
  if (existing) {
    return json_error(c, 409, 'signup_email_exists', '이미 가입된 이메일입니다.')
  }

  const password_hash = await hash_password(password)
  const inserted_user = await c.env.DB.prepare(
    'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
  ).bind(email, password_hash, name, 'owner').run()

  const user_id = as_number(inserted_user.meta.last_row_id)
  const inserted_store = await c.env.DB.prepare(
    'INSERT INTO stores (user_id, store_name, reply_style) VALUES (?, ?, ?)'
  ).bind(user_id, store_name || `${name}님의 매장`, 'friendly').run()

  const store_id = as_number(inserted_store.meta.last_row_id)
  const auth_user = await load_auth_user(c.env.DB, user_id)
  if (!auth_user) {
    return json_error(c, 500, 'signup_store_create_failed', '회원가입 후 계정 정보를 불러오지 못했습니다.')
  }

  const access_token = await issue_access_token(c, auth_user)
  await create_refresh_session(c, auth_user)

  return c.json({
    success: true,
    access_token,
    expires_in: access_token_ttl_seconds,
    user: auth_user
  }, 201)
})

apiRoutes.post('/auth/refresh', async (c) => {
  const refresh_token = getCookie(c, refresh_cookie_name)
  if (!refresh_token) {
    clear_refresh_session_cookie(c)
    return json_error(c, 401, 'refresh_token_missing', '세션이 만료되었습니다.')
  }

  const token_hash = await hash_session_token(refresh_token)
  const session = await c.env.DB.prepare(
    'SELECT user_id FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > datetime("now")'
  ).bind(token_hash).first<any>()

  if (!session) {
    clear_refresh_session_cookie(c)
    return json_error(c, 401, 'refresh_token_invalid', '세션을 갱신할 수 없습니다.')
  }

  const auth_user = await load_auth_user(c.env.DB, as_number(session.user_id))
  if (!auth_user) {
    await revoke_refresh_session(c.env.DB, token_hash)
    clear_refresh_session_cookie(c)
    return json_error(c, 401, 'auth_user_not_found', '사용자를 찾을 수 없습니다.')
  }

  await create_refresh_session(c, auth_user)
  await revoke_refresh_session(c.env.DB, token_hash)

  return c.json({
    access_token: await issue_access_token(c, auth_user),
    expires_in: access_token_ttl_seconds,
    user: auth_user
  })
})

apiRoutes.post('/auth/logout', async (c) => {
  const refresh_token = getCookie(c, refresh_cookie_name)
  if (refresh_token) {
    const token_hash = await hash_session_token(refresh_token)
    await revoke_refresh_session(c.env.DB, token_hash)
  }

  clear_refresh_session_cookie(c)
  return c.json({ success: true })
})

apiRoutes.get('/auth/me', async (c) => {
  return c.json({ user: c.get('auth_user') })
})

// ============ REVIEWS ============
apiRoutes.get('/reviews', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '조회할 매장을 찾을 수 없습니다.')
  }

  const limit = Math.min(Math.max(as_number(c.req.query('limit') || 50), 1), 100)
  const status = c.req.query('status')
  const platform = c.req.query('platform')
  const sentiment = c.req.query('sentiment')

  if (status && !allowed_statuses.has(status)) {
    return json_error(c, 400, 'invalid_status', '허용되지 않은 상태값입니다.')
  }
  if (platform && !supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '허용되지 않은 플랫폼입니다.')
  }
  if (sentiment && !allowed_sentiments.has(sentiment)) {
    return json_error(c, 400, 'invalid_sentiment', '허용되지 않은 감정값입니다.')
  }

  let query = `
    SELECT
      r.*,
      rc.reply_text as candidate_text,
      rc.quality_score,
      rep.final_reply_text as reply_text,
      rep.post_status
    FROM reviews r
    LEFT JOIN reply_candidates rc ON rc.review_id = r.id AND rc.is_selected = 1
    LEFT JOIN replies rep ON rep.review_id = r.id
    WHERE r.store_id = ?
  `
  const params: unknown[] = [store_id]

  if (status) {
    query += ' AND r.status = ?'
    params.push(status)
  }
  if (platform) {
    query += ' AND r.platform = ?'
    params.push(platform)
  }
  if (sentiment) {
    query += ' AND r.sentiment = ?'
    params.push(sentiment)
  }

  query += ' ORDER BY r.created_at DESC LIMIT ?'
  params.push(limit)

  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json({ reviews: result.results })
})

apiRoutes.post('/reviews/:id/generate', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const review_id = c.req.param('id')
  const review = await load_store_scoped_review(c.env.DB, review_id, store_id)
  if (!review) {
    return json_error(c, 404, 'review_not_found', '리뷰를 찾을 수 없습니다.')
  }

  const existing_candidates = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM reply_candidates WHERE review_id = ?'
  ).bind(review_id).first<any>()

  const current_count = as_number(existing_candidates?.count)
  if (current_count >= 3) {
    return json_error(c, 400, 'review_regen_limit_exceeded', '재생성 횟수를 초과했습니다.')
  }

  const banned_words_result = await c.env.DB.prepare('SELECT word FROM banned_words').all()
  const banned_words = banned_words_result.results.map((item: any) => String(item.word))
  const ai_config = get_ai_config(c)

  let sentiment = String(review.sentiment || '')
  if (!sentiment && ai_config.apiKey) {
    try {
      const analysis = await analyzeSentiment(ai_config, String(review.review_text || ''))
      sentiment = analysis.sentiment
      await c.env.DB.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').bind(sentiment, review_id).run()
    } catch {
      sentiment = 'neutral'
    }
  }

  let reply_text = ''
  let quality_score = 0
  let style_used = String(review.reply_style || 'friendly')

  if (ai_config.apiKey) {
    try {
      const generated = await generateReply(ai_config, {
        review_text: String(review.review_text || ''),
        rating: Number(review.rating || 0),
        customer_name: String(review.customer_name || '고객'),
        menu_items: parse_menu_items(review.menu_items),
        platform: String(review.platform || 'baemin'),
        customer_type: (String(review.customer_type || 'new') as 'new' | 'repeat' | 'loyal'),
        sentiment: sentiment || undefined,
        store_name: String(review.store_name || ''),
        reply_style: (String(review.reply_style || 'friendly') as any),
        reply_tone_sample: String(review.reply_tone_sample || ''),
        banned_words
      })

      reply_text = generated.reply_text
      quality_score = generated.quality_score
      style_used = generated.style_used
      sentiment = generated.sentiment
    } catch (error: any) {
      const fallback = get_template_fallback(sentiment || 'neutral', String(review.customer_name || '고객'))
      reply_text = fallback.text
      quality_score = fallback.score
      style_used = 'template_fallback'
      await write_job_log(c.env.DB, 'ai_generate', 'failed', { review_id }, error.message)
    }
  } else {
    const fallback = get_template_fallback(sentiment || 'neutral', String(review.customer_name || '고객'))
    reply_text = fallback.text
    quality_score = fallback.score
    style_used = 'template'
  }

  await c.env.DB.prepare('UPDATE reply_candidates SET is_selected = 0 WHERE review_id = ?').bind(review_id).run()
  await c.env.DB.prepare(
    'INSERT INTO reply_candidates (review_id, reply_text, style_type, quality_score, is_selected, regenerate_count) VALUES (?, ?, ?, ?, 1, ?)'
  ).bind(review_id, reply_text, style_used, quality_score, current_count + 1).run()
  await c.env.DB.prepare('UPDATE reviews SET status = ?, sentiment = ? WHERE id = ?').bind('generated', sentiment || null, review_id).run()
  await write_job_log(c.env.DB, 'ai_generate', 'completed', { review_id, quality_score, style_used })

  return c.json({
    reply_text,
    quality_score,
    sentiment,
    style_used,
    regeneration_count: current_count + 1,
    max_regenerations: 3,
    ai_powered: !!ai_config.apiKey
  })
})

apiRoutes.post('/reviews/:id/analyze', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  const review_id = c.req.param('id')
  const review = await load_store_scoped_review(c.env.DB, review_id, store_id)

  if (!review) {
    return json_error(c, 404, 'review_not_found', '리뷰를 찾을 수 없습니다.')
  }

  const ai_config = get_ai_config(c)
  if (!ai_config.apiKey) {
    return json_error(c, 500, 'ai_not_configured', 'AI API 키가 설정되지 않았습니다.')
  }

  const result = await analyzeSentiment(ai_config, String(review.review_text || ''))
  await c.env.DB.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').bind(result.sentiment, review_id).run()

  return c.json({
    review_id,
    ...result
  })
})

apiRoutes.post('/reviews/batch-analyze', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const ai_config = get_ai_config(c)
  if (!ai_config.apiKey) {
    return json_error(c, 500, 'ai_not_configured', 'AI API 키가 설정되지 않았습니다.')
  }

  const pending = await c.env.DB.prepare(
    'SELECT id, review_text FROM reviews WHERE store_id = ? AND sentiment IS NULL LIMIT 20'
  ).bind(store_id).all()

  if (!pending.results.length) {
    return c.json({ analyzed_count: 0, results: [] })
  }

  const results = await batchAnalyzeSentiments(
    ai_config,
    pending.results.map((item: any) => ({ id: as_number(item.id), review_text: String(item.review_text || '') }))
  )

  for (const item of results) {
    await c.env.DB.prepare('UPDATE reviews SET sentiment = ? WHERE id = ?').bind(item.sentiment, item.id).run()
  }

  return c.json({ analyzed_count: results.length, results })
})

apiRoutes.post('/reviews/batch-generate', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const ai_config = get_ai_config(c)
  if (!ai_config.apiKey) {
    return json_error(c, 500, 'ai_not_configured', 'AI API 키가 설정되지 않았습니다.')
  }

  const pending_reviews = await c.env.DB.prepare(
    `
      SELECT r.*, s.store_name, s.reply_style, s.reply_tone_sample
      FROM reviews r
      JOIN stores s ON s.id = r.store_id
      WHERE r.store_id = ? AND r.status = 'pending'
      LIMIT 10
    `
  ).bind(store_id).all()

  const banned_words_result = await c.env.DB.prepare('SELECT word FROM banned_words').all()
  const banned_words = banned_words_result.results.map((item: any) => String(item.word))
  const generated: unknown[] = []

  for (const review of pending_reviews.results as any[]) {
    try {
      const result = await generateReply(ai_config, {
        review_text: String(review.review_text || ''),
        rating: Number(review.rating || 0),
        customer_name: String(review.customer_name || '고객'),
        menu_items: parse_menu_items(review.menu_items),
        platform: String(review.platform || 'baemin'),
        customer_type: (String(review.customer_type || 'new') as 'new' | 'repeat' | 'loyal'),
        sentiment: review.sentiment ? String(review.sentiment) : undefined,
        store_name: String(review.store_name || ''),
        reply_style: (String(review.reply_style || 'friendly') as any),
        reply_tone_sample: String(review.reply_tone_sample || ''),
        banned_words
      })

      await c.env.DB.prepare('UPDATE reply_candidates SET is_selected = 0 WHERE review_id = ?').bind(review.id).run()
      await c.env.DB.prepare(
        'INSERT INTO reply_candidates (review_id, reply_text, style_type, quality_score, is_selected, regenerate_count) VALUES (?, ?, ?, ?, 1, 1)'
      ).bind(review.id, result.reply_text, result.style_used, result.quality_score).run()
      await c.env.DB.prepare('UPDATE reviews SET status = ?, sentiment = ? WHERE id = ?')
        .bind('generated', result.sentiment, review.id).run()

      generated.push({
        review_id: review.id,
        reply_text: result.reply_text,
        quality_score: result.quality_score,
        sentiment: result.sentiment
      })
    } catch (error: any) {
      await write_job_log(c.env.DB, 'ai_generate', 'failed', { review_id: review.id }, error.message)
    }
  }

  return c.json({ generated_count: generated.length, generated })
})

apiRoutes.post('/reviews/approve', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const { review_ids, auto_post } = await read_json_body<{ review_ids?: Array<number | string>; auto_post?: boolean }>(c)
  if (!Array.isArray(review_ids) || review_ids.length === 0) {
    return json_error(c, 400, 'reviews_missing', '승인할 리뷰 ID 목록이 필요합니다.')
  }

  let approved_count = 0
  let posted_count = 0
  const failures: Array<{ review_id: number | string; message: string }> = []

  for (const review_id of review_ids) {
    const review = await load_store_scoped_review(c.env.DB, String(review_id), store_id)
    if (!review) {
      failures.push({ review_id, message: '리뷰를 찾을 수 없습니다.' })
      continue
    }

    const candidate = await load_selected_candidate(c.env.DB, String(review_id))
    if (!candidate) {
      failures.push({ review_id, message: '선택된 답변 후보가 없습니다.' })
      continue
    }

    await upsert_reply_record(c.env.DB, String(review_id), as_number(candidate.id), String(candidate.reply_text || ''))
    await c.env.DB.prepare('UPDATE reviews SET status = ? WHERE id = ?').bind('approved', review_id).run()
    approved_count += 1

    if (auto_post !== false) {
      const post_result = await post_reply_to_platform(c, String(review_id), store_id)
      if (post_result.success) {
        posted_count += 1
      } else {
        failures.push({ review_id, message: post_result.error })
      }
    }
  }

  return c.json({
    success: true,
    approved_count,
    posted_count,
    pending_post_count: Math.max(approved_count - posted_count, 0),
    failures
  })
})

apiRoutes.post('/reviews/:id/post', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const review_id = c.req.param('id')
  const review = await load_store_scoped_review(c.env.DB, review_id, store_id)
  if (!review) {
    return json_error(c, 404, 'review_not_found', '리뷰를 찾을 수 없습니다.')
  }

  const result = await post_reply_to_platform(c, review_id, store_id)
  if (!result.success) {
    return json_error(c, 502, 'reply_post_failed', result.error)
  }

  return c.json({ success: true, review_id })
})

apiRoutes.patch('/reviews/:id/reply', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  const review_id = c.req.param('id')
  const { reply_text } = await read_json_body<{ reply_text?: string }>(c)

  if (!reply_text || !reply_text.trim()) {
    return json_error(c, 400, 'reply_empty', '수정할 답변 텍스트가 필요합니다.')
  }

  const review = await load_store_scoped_review(c.env.DB, review_id, store_id)
  if (!review) {
    return json_error(c, 404, 'review_not_found', '리뷰를 찾을 수 없습니다.')
  }

  await c.env.DB.prepare(
    'UPDATE reply_candidates SET reply_text = ? WHERE review_id = ? AND is_selected = 1'
  ).bind(reply_text.trim(), review_id).run()
  await c.env.DB.prepare(
    'UPDATE replies SET final_reply_text = ? WHERE review_id = ?'
  ).bind(reply_text.trim(), review_id).run()

  return c.json({ success: true, review_id })
})

// ============ DASHBOARD ============
apiRoutes.get('/dashboard/summary', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const total_reviews = await c.env.DB.prepare('SELECT COUNT(*) as count FROM reviews WHERE store_id = ?').bind(store_id).first<any>()
  const pending_reviews = await c.env.DB.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND status = 'pending'").bind(store_id).first<any>()
  const avg_rating = await c.env.DB.prepare('SELECT AVG(rating) as avg FROM reviews WHERE store_id = ?').bind(store_id).first<any>()
  const positive_count = await c.env.DB.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND sentiment = 'positive'").bind(store_id).first<any>()
  const negative_count = await c.env.DB.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND sentiment = 'negative'").bind(store_id).first<any>()
  const approved_count = await c.env.DB.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND status IN ('approved', 'posted')").bind(store_id).first<any>()
  const responded_count = await c.env.DB.prepare("SELECT COUNT(*) as count FROM reviews WHERE store_id = ? AND status IN ('generated', 'approved', 'posted')").bind(store_id).first<any>()
  const repeat_customers = await c.env.DB.prepare("SELECT COUNT(*) as count FROM customers WHERE store_id = ? AND customer_type IN ('repeat', 'loyal')").bind(store_id).first<any>()
  const total_customers = await c.env.DB.prepare('SELECT COUNT(*) as count FROM customers WHERE store_id = ?').bind(store_id).first<any>()
  const avg_quality = await c.env.DB.prepare(
    'SELECT AVG(quality_score) as avg FROM reply_candidates WHERE is_selected = 1 AND review_id IN (SELECT id FROM reviews WHERE store_id = ?)'
  ).bind(store_id).first<any>()

  const total_count = as_number(total_reviews?.count)
  const responded_total = Math.max(as_number(responded_count?.count), 1)
  const customer_total = Math.max(as_number(total_customers?.count), 1)

  return c.json({
    total_reviews: total_count,
    pending_reviews: as_number(pending_reviews?.count),
    avg_rating: Number(Number(avg_rating?.avg || 0).toFixed(1)),
    positive_ratio: total_count ? Math.round((as_number(positive_count?.count) / total_count) * 100) : 0,
    negative_ratio: total_count ? Math.round((as_number(negative_count?.count) / total_count) * 100) : 0,
    approval_rate: Math.round((as_number(approved_count?.count) / responded_total) * 100),
    repeat_customer_ratio: Math.round((as_number(repeat_customers?.count) / customer_total) * 100),
    ai_quality_score: avg_quality?.avg ? Number(Number(avg_quality.avg).toFixed(1)) : 0
  })
})

apiRoutes.get('/dashboard/menus', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const reviews = await c.env.DB.prepare(
    'SELECT menu_items, rating, sentiment FROM reviews WHERE store_id = ? AND menu_items IS NOT NULL'
  ).bind(store_id).all()

  const menu_stats: Record<string, { total: number; count: number; positive: number; negative: number }> = {}

  for (const review of reviews.results as any[]) {
    for (const menu of parse_menu_items(review.menu_items)) {
      if (!menu_stats[menu]) {
        menu_stats[menu] = { total: 0, count: 0, positive: 0, negative: 0 }
      }

      menu_stats[menu].total += Number(review.rating || 0)
      menu_stats[menu].count += 1
      if (review.sentiment === 'positive') menu_stats[menu].positive += 1
      if (review.sentiment === 'negative') menu_stats[menu].negative += 1
    }
  }

  const menus = Object.entries(menu_stats)
    .map(([name, stat]) => ({
      name,
      avg_rating: Number((stat.total / Math.max(stat.count, 1)).toFixed(1)),
      review_count: stat.count,
      positive_ratio: Math.round((stat.positive / Math.max(stat.count, 1)) * 100),
      negative_ratio: Math.round((stat.negative / Math.max(stat.count, 1)) * 100)
    }))
    .sort((left, right) => right.review_count - left.review_count)
    .slice(0, 10)

  return c.json({ menus })
})

apiRoutes.get('/dashboard/repeat_customers', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const customers = await c.env.DB.prepare(
    "SELECT * FROM customers WHERE store_id = ? AND customer_type IN ('repeat', 'loyal') ORDER BY order_count DESC LIMIT 10"
  ).bind(store_id).all()

  return c.json({ customers: customers.results })
})

apiRoutes.get('/dashboard/daily_trend', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const summaries = await c.env.DB.prepare(
    'SELECT * FROM dashboard_daily_summaries WHERE store_id = ? ORDER BY summary_date DESC LIMIT 7'
  ).bind(store_id).all()

  return c.json({ summaries: summaries.results })
})

// ============ BILLING ============
function format_order_name(plan_name: string) {
  return `Respondio ${plan_name} 구독`
}

async function load_plan_or_throw(db: D1Database, plan_id: number) {
  const plan = await db.prepare('SELECT * FROM plans WHERE id = ? AND is_active = 1').bind(plan_id).first<any>()
  if (!plan) {
    throw new Error('선택한 요금제를 찾을 수 없습니다.')
  }

  return plan
}

async function upsert_subscription_for_payment(db: D1Database, user_id: number, plan_id: number) {
  const existing_subscription = await db.prepare(
    "SELECT id FROM subscriptions WHERE user_id = ? AND status IN ('active', 'past_due', 'cancelled') ORDER BY id DESC LIMIT 1"
  ).bind(user_id).first<any>()

  if (existing_subscription) {
    await db.prepare(`
      UPDATE subscriptions
      SET plan_id = ?,
          status = 'active',
          cancel_at_period_end = 0,
          current_period_start = datetime('now'),
          current_period_end = datetime('now', ?),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(plan_id, `+${subscription_cycle_days} days`, existing_subscription.id).run()

    return as_number(existing_subscription.id)
  }

  const inserted = await db.prepare(`
    INSERT INTO subscriptions (
      user_id, plan_id, status, cancel_at_period_end, current_period_start, current_period_end, updated_at
    )
    VALUES (?, ?, 'active', 0, datetime('now'), datetime('now', ?), datetime('now'))
  `).bind(user_id, plan_id, `+${subscription_cycle_days} days`).run()

  return as_number(inserted.meta.last_row_id)
}

async function complete_portone_payment(
  c: any,
  auth_user: AuthUser,
  payment_id: string,
  expected_plan_id?: number | null
) {
  const pending_payment = await c.env.DB.prepare(
    `
      SELECT id, plan_id, amount, status
      FROM payments
      WHERE user_id = ? AND payment_id = ?
      ORDER BY id DESC
      LIMIT 1
    `
  ).bind(auth_user.id, payment_id).first<any>()

  if (!pending_payment) {
    throw new Error('결제 준비 정보가 없습니다. 다시 시도해주세요.')
  }

  const plan_id = expected_plan_id || as_number(pending_payment.plan_id)
  if (!plan_id) {
    throw new Error('결제할 요금제 정보가 없습니다.')
  }

  const plan = await load_plan_or_throw(c.env.DB, plan_id)
  const payment_client = get_portone_payment_client(c)
  const portone_payment = await payment_client.getPayment({ paymentId: payment_id }) as any

  const payment_status = String(portone_payment?.status || '')
  const paid_amount = as_number(portone_payment?.amount?.total)
  if (paid_amount !== as_number(plan.price)) {
    await c.env.DB.prepare(
      'UPDATE payments SET status = ?, raw_payload = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind('failed', JSON.stringify(portone_payment), pending_payment.id).run()

    throw new Error('결제 금액 검증에 실패했습니다.')
  }

  if (payment_status !== 'PAID') {
    const mapped_status = payment_status === 'VIRTUAL_ACCOUNT_ISSUED' ? 'pending' : 'failed'
    await c.env.DB.prepare(
      'UPDATE payments SET status = ?, raw_payload = ?, updated_at = datetime("now") WHERE id = ?'
    ).bind(mapped_status, JSON.stringify(portone_payment), pending_payment.id).run()

    throw new Error(`결제 상태가 완료가 아닙니다: ${payment_status}`)
  }

  const subscription_id = await upsert_subscription_for_payment(c.env.DB, auth_user.id, plan_id)

  await c.env.DB.prepare(`
    UPDATE payments
    SET status = 'completed',
        provider = 'portone',
        subscription_id = ?,
        amount = ?,
        payment_method = ?,
        transaction_id = ?,
        raw_payload = ?,
        paid_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(
    subscription_id,
    paid_amount,
    portone_payment?.method?.type || portone_payment?.method || 'CARD',
    payment_id,
    JSON.stringify(portone_payment),
    pending_payment.id
  ).run()

  return {
    payment_id,
    plan_id,
    plan_name: String(plan.name || ''),
    amount: paid_amount,
    subscription_id,
    payment_status
  }
}

apiRoutes.get('/billing/config', async (c) => {
  const config = get_portone_public_config(c)
  const billing_enabled = is_portone_server_configured(c)

  return c.json({
    payment_provider: billing_enabled ? 'portone' : null,
    billing_mode: billing_enabled ? 'self_serve' : 'beta',
    billing_enabled,
    configured: billing_enabled,
    store_id: config.store_id || null,
    channel_key: config.channel_key || null,
    app_base_url: get_app_base_url(c)
  })
})

apiRoutes.get('/plans', async (c) => {
  const plans = await c.env.DB.prepare('SELECT * FROM plans WHERE is_active = 1 ORDER BY price ASC').all()
  return c.json({ plans: plans.results })
})

apiRoutes.get('/subscriptions', async (c) => {
  const auth_user = c.get('auth_user')
  const subscription = await c.env.DB.prepare(`
    SELECT s.*, p.name as plan_name, p.price, p.review_limit
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.user_id = ?
    ORDER BY s.id DESC
    LIMIT 1
  `).bind(auth_user.id).first()

  return c.json({ subscription })
})

apiRoutes.get('/payments', async (c) => {
  const auth_user = c.get('auth_user')
  const payments = await c.env.DB.prepare(
    'SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
  ).bind(auth_user.id).all()

  return c.json({ payments: payments.results })
})

apiRoutes.get('/payment_methods', async (c) => {
  const auth_user = c.get('auth_user')
  const payment_methods = await c.env.DB.prepare(
    'SELECT * FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, id DESC'
  ).bind(auth_user.id).all()

  return c.json({ payment_methods: payment_methods.results })
})

apiRoutes.post('/billing/checkout', async (c) => {
  const auth_user = c.get('auth_user')
  const { plan_id } = await read_json_body<{ plan_id?: number }>(c)
  const resolved_plan_id = as_number(plan_id)

  if (!resolved_plan_id) {
    return json_error(c, 400, 'plan_required', '결제할 요금제를 선택해주세요.')
  }

  if (!is_portone_server_configured(c)) {
    return json_error(c, 503, 'payment_not_configured', 'PortOne 결제 설정이 아직 완료되지 않았습니다.')
  }

  const plan = await load_plan_or_throw(c.env.DB, resolved_plan_id)
  const payment_id = `respondio-${auth_user.id}-${crypto.randomUUID()}`
  await c.env.DB.prepare(`
    INSERT INTO payments (
      user_id, amount, currency, status, payment_method, transaction_id, provider, plan_id, payment_id, updated_at
    )
    VALUES (?, ?, 'KRW', 'pending', 'CARD', ?, 'portone', ?, ?, datetime('now'))
  `).bind(
    auth_user.id,
    as_number(plan.price),
    payment_id,
    resolved_plan_id,
    payment_id
  ).run()

  const public_config = get_portone_public_config(c)
  return c.json({
    payment_provider: 'portone',
    store_id: public_config.store_id,
    channel_key: public_config.channel_key,
    payment_id,
    order_name: format_order_name(String(plan.name || '구독')),
    amount: as_number(plan.price),
    currency: 'KRW',
    pay_method: 'CARD',
    redirect_url: `${get_app_base_url(c)}/billing?paymentId=${encodeURIComponent(payment_id)}`
  })
})

apiRoutes.post('/billing/complete', async (c) => {
  const auth_user = c.get('auth_user')
  const { payment_id, plan_id } = await read_json_body<{ payment_id?: string; plan_id?: number }>(c)

  if (!payment_id) {
    return json_error(c, 400, 'payment_id_required', '검증할 paymentId가 필요합니다.')
  }

  if (!is_portone_server_configured(c)) {
    return json_error(c, 503, 'payment_not_configured', 'PortOne 서버 검증 설정이 아직 완료되지 않았습니다.')
  }

  try {
    const result = await complete_portone_payment(c, auth_user, payment_id, as_number(plan_id) || null)
    return c.json({ success: true, ...result })
  } catch (error: any) {
    return json_error(c, 400, 'payment_complete_failed', error.message)
  }
})

apiRoutes.post('/subscriptions/cancel', async (c) => {
  const auth_user = c.get('auth_user')
  const subscription = await c.env.DB.prepare(
    "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1"
  ).bind(auth_user.id).first<any>()

  if (!subscription) {
    return json_error(c, 404, 'subscription_not_found', '활성 구독을 찾을 수 없습니다.')
  }

  await c.env.DB.prepare(`
    UPDATE subscriptions
    SET cancel_at_period_end = 1,
        status = 'cancelled',
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(subscription.id).run()

  return c.json({ success: true, subscription_id: as_number(subscription.id) })
})

apiRoutes.post('/webhooks/portone', async (c) => {
  if (!c.env.PORTONE_WEBHOOK_SECRET) {
    return json_error(c, 503, 'webhook_not_configured', 'PortOne webhook secret이 설정되지 않았습니다.')
  }

  const raw_body = await c.req.text()

  try {
    const webhook = await Webhook.verify(
      c.env.PORTONE_WEBHOOK_SECRET,
      raw_body,
      Object.fromEntries(c.req.raw.headers.entries())
    ) as any

    const event_id = String(webhook?.id || webhook?.paymentId || crypto.randomUUID())
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO payment_webhook_events (provider, event_id, event_type, payload) VALUES (?, ?, ?, ?)'
    ).bind(
      'portone',
      event_id,
      webhook?.type || 'unknown',
      raw_body
    ).run()

    if (webhook?.paymentId && is_portone_server_configured(c)) {
      const payment = await c.env.DB.prepare(
        'SELECT user_id FROM payments WHERE payment_id = ? ORDER BY id DESC LIMIT 1'
      ).bind(String(webhook.paymentId)).first<any>()

      if (payment?.user_id) {
        const auth_user = await load_auth_user(c.env.DB, as_number(payment.user_id))
        if (auth_user) {
          await complete_portone_payment(c, auth_user, String(webhook.paymentId))
        }
      }
    }

    return c.json({ success: true })
  } catch (error: any) {
    return json_error(c, 400, 'webhook_verification_failed', error.message)
  }
})

apiRoutes.get('/platform_connections', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const connections = await c.env.DB.prepare(
    `
      SELECT id, store_id, platform, connection_status, platform_store_id, last_sync_at,
             login_email, login_password_encrypted, auth_mode, session_status,
             session_connected_at, session_last_validated_at, last_error, created_at, updated_at
      FROM store_platform_connections
      WHERE store_id = ?
      ORDER BY id ASC
    `
  ).bind(store_id).all()

  return c.json({ connections: connections.results.map((connection: any) => sanitize_platform_connection(connection)) })
})

apiRoutes.get('/store/settings', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, as_number(c.req.query('store_id')) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const store = await load_store_settings(c.env.DB, store_id)
  if (!store) {
    return json_error(c, 404, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  return c.json({ store })
})

apiRoutes.patch('/store/settings', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const { store_name, business_number_masked, reply_style, reply_tone_sample } = await read_json_body<{
    store_name?: string
    business_number_masked?: string
    reply_style?: string
    reply_tone_sample?: string
  }>(c)

  const allowed_reply_styles = new Set(['friendly', 'polite', 'casual', 'custom'])
  if (reply_style && !allowed_reply_styles.has(reply_style)) {
    return json_error(c, 400, 'invalid_reply_style', '허용되지 않은 답변 스타일입니다.')
  }

  await c.env.DB.prepare(`
    UPDATE stores
    SET store_name = COALESCE(?, store_name),
        business_number_masked = COALESCE(?, business_number_masked),
        reply_style = COALESCE(?, reply_style),
        reply_tone_sample = COALESCE(?, reply_tone_sample)
    WHERE id = ?
  `).bind(
    store_name?.trim() || null,
    business_number_masked?.trim() || null,
    reply_style || null,
    reply_tone_sample?.trim() || null,
    store_id
  ).run()

  const updated_store = await load_store_settings(c.env.DB, store_id)
  return c.json({ success: true, store: updated_store })
})

apiRoutes.post('/platform_connections/:platform/connect', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  const { login_email, login_password, platform_store_id, auth_mode } = await read_json_body<{
    login_email?: string
    login_password?: string
    platform_store_id?: string
    auth_mode?: string
  }>(c)
  const next_auth_mode = auth_mode === 'direct_session' ? 'direct_session' : 'credentials'

  if (next_auth_mode === 'direct_session') {
    const connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
      connection_status: 'disconnected',
      platform_store_id: platform_store_id?.trim() || null,
      login_email: null,
      login_password_encrypted: null,
      auth_mode: 'direct_session',
      session_status: 'pending',
      session_connected_at: null,
      session_last_validated_at: null,
      last_error: '원격 브라우저 직접 인증을 기다리는 중입니다. 원격 인증 화면에서 로그인 후 이용해주세요.'
    })

    return c.json({
      success: true,
      connection: sanitize_platform_connection(connection),
      message: '직접 로그인 세션 모드로 전환되었습니다. 원격 인증 화면에서 로그인 후 이용해주세요.',
      requires_direct_session: true
    })
  }

  const existing_connection = await load_platform_connection(c.env.DB, store_id, platform)
  const normalized_login_email = login_email?.trim() || String(existing_connection?.login_email || '').trim()
  const provided_login_password = login_password || ''

  const encryption_key = get_credentials_encryption_key(c)
  if (!encryption_key) {
    return json_error(c, 503, 'credentials_key_missing', 'CREDENTIALS_ENCRYPTION_KEY가 설정되지 않았습니다.')
  }

  try {
    if (!normalized_login_email) {
      return json_error(c, 400, 'credentials_required', '플랫폼 로그인 이메일이 필요합니다.')
    }

    if (!provided_login_password && !existing_connection?.login_password_encrypted) {
      return json_error(c, 400, 'credentials_required', '최초 연결 시에는 플랫폼 비밀번호 입력이 필요합니다.')
    }

    if (!provided_login_password && login_email?.trim() && login_email.trim() !== String(existing_connection?.login_email || '').trim()) {
      return json_error(c, 400, 'password_required_for_email_change', '로그인 이메일을 바꾸려면 비밀번호를 다시 입력해주세요.')
    }

    const decrypted_password = provided_login_password
      ? provided_login_password
      : await decrypt_secret(String(existing_connection?.login_password_encrypted || ''), encryption_key)

    const encrypted_password = provided_login_password
      ? await encrypt_secret(provided_login_password, encryption_key)
      : String(existing_connection?.login_password_encrypted || '')

    const login_result = await login_platform_via_crawler(c, platform, store_id, {
      email: normalized_login_email,
      password: decrypted_password
    })

    const connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
      connection_status: login_result.success ? 'connected' : 'error',
      platform_store_id: platform_store_id?.trim() || null,
      login_email: normalized_login_email,
      login_password_encrypted: encrypted_password,
      auth_mode: 'credentials',
      session_status: login_result.success ? 'connected' : 'error',
      session_connected_at: login_result.success ? new Date().toISOString() : null,
      session_last_validated_at: login_result.success ? new Date().toISOString() : null,
      last_error: login_result.success ? null : login_result.message,
      touch_sync_time: login_result.success
    })

    return c.json({
      success: login_result.success,
      connection: sanitize_platform_connection(connection),
      message: login_result.message
    }, login_result.success ? 200 : 400)
  } catch (error: any) {
    return json_error(c, 400, 'platform_connect_failed', error.message)
  }
})

apiRoutes.post('/platform_connections/:platform/refresh-session', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  const result = await ensure_live_platform_session(c, store_id, platform)
  return c.json({
    success: result.success,
    connection: result.connection || null,
    message: result.success
      ? '플랫폼 세션을 다시 확인했습니다.'
      : result.error || '플랫폼 세션 갱신에 실패했습니다.'
  }, result.success ? 200 : 400)
})

apiRoutes.post('/platform_connections/:platform/auth-mode', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  const { auth_mode } = await read_json_body<{ auth_mode?: string }>(c)
  if (!auth_mode || !new Set(['credentials', 'direct_session']).has(auth_mode)) {
    return json_error(c, 400, 'invalid_auth_mode', '지원하지 않는 연결 방식입니다.')
  }

  if (auth_mode !== 'direct_session') {
    await clear_live_platform_session(c, platform, store_id).catch(() => null)
  }

  const connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
    connection_status: auth_mode === 'direct_session' ? 'disconnected' : 'disconnected',
    auth_mode,
    session_status: auth_mode === 'direct_session' ? 'pending' : 'inactive',
    session_connected_at: null,
    session_last_validated_at: null,
    login_email: auth_mode === 'direct_session' ? null : undefined,
    login_password_encrypted: auth_mode === 'direct_session' ? null : undefined,
    last_error: auth_mode === 'direct_session'
      ? '직접 로그인 세션 모드가 선택되었습니다. 원격 인증 화면에서 로그인 후 이용해주세요.'
      : null
  })

  return c.json({
    success: true,
    connection: sanitize_platform_connection(connection),
    message: auth_mode === 'direct_session'
      ? '직접 로그인 세션 모드로 전환되었습니다. 원격 인증을 진행해주세요.'
      : '자동 로그인 모드로 전환되었습니다.'
  })
})

apiRoutes.post('/platform_connections/:platform/remote-auth/start', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  const { platform_store_id } = await read_json_body<{ platform_store_id?: string | null }>(c)

  try {
    const result = await start_remote_platform_auth(c, platform, store_id)
    const connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
      connection_status: 'disconnected',
      platform_store_id: platform_store_id?.trim() || undefined,
      auth_mode: 'direct_session',
      session_status: 'pending',
      session_connected_at: null,
      session_last_validated_at: new Date().toISOString(),
      last_error: result.message || '원격 인증 세션이 준비되었습니다. 로그인과 추가 인증을 진행해주세요.'
    })

    return c.json({
      success: true,
      session_id: result.session_id,
      platform,
      connection: sanitize_platform_connection(connection),
      remote_auth: result
    })
  } catch (error: any) {
    return json_error(c, 400, 'remote_auth_start_failed', error.message)
  }
})

apiRoutes.get('/platform_connections/:platform/remote-auth/:session_id/status', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  try {
    const result = await read_remote_platform_auth_status(c, c.req.param('session_id'), platform, store_id)
    return c.json({ success: true, platform, remote_auth: result })
  } catch (error: any) {
    return json_error(c, 400, 'remote_auth_status_failed', error.message)
  }
})

apiRoutes.get('/platform_connections/:platform/remote-auth/:session_id/screenshot', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  try {
    const response = await fetch_crawler(c, build_remote_auth_scoped_path(c.req.param('session_id'), 'screenshot', platform, store_id), {
      headers: get_crawler_headers(c)
    }, 10000, '원격 브라우저 화면을 불러오는 데 시간이 오래 걸리고 있습니다. 잠시 후 자동으로 다시 시도해주세요.')

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return json_error(c, 400, 'remote_auth_screenshot_failed', text || '원격 인증 스크린샷을 가져오지 못했습니다.')
    }

    const image = await response.arrayBuffer()
    return new Response(image, {
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    })
  } catch (error: any) {
    return json_error(c, 400, 'remote_auth_screenshot_failed', error.message)
  }
})

apiRoutes.post('/platform_connections/:platform/remote-auth/:session_id/action', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  try {
    const payload = await read_json_body<Record<string, unknown>>(c)
    const result = await send_remote_platform_auth_action(c, c.req.param('session_id'), platform, store_id, payload)
    return c.json({ success: true, platform, remote_auth: result })
  } catch (error: any) {
    return json_error(c, 400, 'remote_auth_action_failed', error.message)
  }
})

apiRoutes.post('/platform_connections/:platform/remote-auth/:session_id/complete', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  try {
    const result = await complete_remote_platform_auth(c, c.req.param('session_id'), platform, store_id)
    const connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
      connection_status: 'connected',
      auth_mode: 'direct_session',
      session_status: 'connected',
      session_connected_at: new Date().toISOString(),
      session_last_validated_at: new Date().toISOString(),
      last_error: null,
      touch_sync_time: true
    })

    return c.json({
      success: true,
      platform,
      connection: sanitize_platform_connection(connection),
      remote_auth: result
    })
  } catch (error: any) {
    return json_error(c, 400, 'remote_auth_complete_failed', error.message)
  }
})

apiRoutes.post('/platform_connections/:platform/remote-auth/:session_id/cancel', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  try {
    const result = await cancel_remote_platform_auth(c, c.req.param('session_id'), platform, store_id)
    const connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
      connection_status: 'disconnected',
      auth_mode: 'direct_session',
      session_status: 'inactive',
      session_connected_at: null,
      session_last_validated_at: new Date().toISOString(),
      last_error: '원격 인증 세션이 종료되었습니다.'
    })

    return c.json({
      success: true,
      platform,
      connection: sanitize_platform_connection(connection),
      remote_auth: result
    })
  } catch (error: any) {
    return json_error(c, 400, 'remote_auth_cancel_failed', error.message)
  }
})

apiRoutes.get('/platform_connections/:platform/mobile-session-config', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  const connection = await load_platform_connection(c.env.DB, store_id, platform)
  const meta = get_direct_session_platform_meta(platform)

  return c.json({
    success: true,
    platform,
    meta,
    connection: connection ? sanitize_platform_connection(connection) : null,
    bridge_message: {
      type: 'open_platform_login',
      platform,
      platformStoreId: connection?.platform_store_id ? String(connection.platform_store_id) : null,
      loginUrl: meta.login_url,
      reviewUrl: meta.review_url,
      callbackPath: `/api/v1/platform_connections/${platform}/session-state`
    }
  })
})

apiRoutes.post('/platform_connections/:platform/session-state', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  const { session_status, last_error, platform_store_id } = await read_json_body<{
    session_status?: string
    last_error?: string | null
    platform_store_id?: string | null
  }>(c)

  const allowed_session_statuses = new Set(['inactive', 'pending', 'connected', 'expired', 'error'])
  if (!session_status || !allowed_session_statuses.has(session_status)) {
    return json_error(c, 400, 'invalid_session_status', '지원하지 않는 세션 상태입니다.')
  }

  const connected = session_status === 'connected'
  const connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
    connection_status: connected ? 'connected' : session_status === 'error' ? 'error' : 'disconnected',
    platform_store_id: platform_store_id?.trim() || undefined,
    auth_mode: 'direct_session',
    session_status,
    session_connected_at: connected ? new Date().toISOString() : null,
    session_last_validated_at: new Date().toISOString(),
    last_error: connected ? null : last_error ?? null
  })

  return c.json({ success: true, connection: sanitize_platform_connection(connection) })
})

apiRoutes.post('/platform_connections/:platform/disconnect', async (c) => {
  const auth_user = c.get('auth_user')
  const store_id = resolve_store_id(auth_user, null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '매장을 찾을 수 없습니다.')
  }

  const platform = c.req.param('platform')
  if (!supported_platforms.has(platform)) {
    return json_error(c, 400, 'invalid_platform', '지원하지 않는 플랫폼입니다.')
  }

  await clear_live_platform_session(c, platform, store_id).catch(() => null)

  const connection = await sync_platform_connection_record(c.env.DB, store_id, platform, {
    connection_status: 'disconnected',
    login_email: null,
    login_password_encrypted: null,
    auth_mode: 'credentials',
    session_status: 'inactive',
    session_connected_at: null,
    session_last_validated_at: null,
    last_error: null
  })

  return c.json({ success: true, connection: sanitize_platform_connection(connection) })
})

// ============ ADMIN ============
apiRoutes.get('/admin/users', async (c) => {
  const forbidden = await require_admin(c)
  if (forbidden) return forbidden

  const users = await c.env.DB.prepare(
    'SELECT id, email, name, role, status, created_at FROM users ORDER BY created_at DESC'
  ).all()

  return c.json({ users: users.results })
})

apiRoutes.get('/admin/logs', async (c) => {
  const forbidden = await require_admin(c)
  if (forbidden) return forbidden

  const logs = await c.env.DB.prepare('SELECT * FROM job_logs ORDER BY created_at DESC LIMIT 100').all()
  return c.json({ logs: logs.results })
})

apiRoutes.get('/admin/stats', async (c) => {
  const forbidden = await require_admin(c)
  if (forbidden) return forbidden

  const total_users = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<any>()
  const active_subscriptions = await c.env.DB.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'").first<any>()
  const failed_jobs = await c.env.DB.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'failed'").first<any>()
  const dlq_jobs = await c.env.DB.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'dlq'").first<any>()
  const processing_jobs = await c.env.DB.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'processing'").first<any>()
  const completed_jobs = await c.env.DB.prepare("SELECT COUNT(*) as count FROM job_logs WHERE status = 'completed'").first<any>()
  const total_job_count = Math.max(as_number(completed_jobs?.count) + as_number(failed_jobs?.count) + as_number(dlq_jobs?.count), 1)

  return c.json({
    total_users: as_number(total_users?.count),
    active_subscriptions: as_number(active_subscriptions?.count),
    failed_jobs: as_number(failed_jobs?.count),
    dlq_jobs: as_number(dlq_jobs?.count),
    processing_jobs: as_number(processing_jobs?.count),
    completed_jobs: as_number(completed_jobs?.count),
    error_rate: Number((((as_number(failed_jobs?.count) + as_number(dlq_jobs?.count)) / total_job_count) * 100).toFixed(1))
  })
})

apiRoutes.post('/admin/jobs/:id/retry', async (c) => {
  const forbidden = await require_admin(c)
  if (forbidden) return forbidden

  const job_id = c.req.param('id')
  await c.env.DB.prepare(
    "UPDATE job_logs SET status = 'pending', retry_count = retry_count + 1 WHERE id = ?"
  ).bind(job_id).run()

  return c.json({ success: true, job_id })
})

// ============ CRAWLER INTEGRATION ============
apiRoutes.post('/crawler/reviews', async (c) => {
  const { reviews, store_id } = await read_json_body<{ reviews?: ReviewRecord[]; store_id?: number }>(c)
  if (!Array.isArray(reviews) || !store_id) {
    return json_error(c, 400, 'crawler_payload_invalid', 'reviews 배열과 store_id가 필요합니다.')
  }

  const result = await ingest_reviews(c.env.DB, reviews, as_number(store_id))
  return c.json({
    success: true,
    inserted: result.inserted_count,
    skipped: result.skipped_count,
    total: reviews.length
  })
})

apiRoutes.get('/crawler/platform-session-state', async (c) => {
  const store_id = as_number(c.req.query('store_id'))
  const platform = String(c.req.query('platform') || '')

  if (!store_id || !supported_platforms.has(platform)) {
    return json_error(c, 400, 'crawler_session_state_invalid', 'store_id와 platform이 필요합니다.')
  }

  const encrypted = await load_platform_session_state_encrypted(c.env.DB, store_id, platform)
  if (!encrypted) {
    return c.json({ success: true, session_state: null })
  }

  const encryption_key = get_credentials_encryption_key(c)
  if (!encryption_key) {
    return json_error(c, 500, 'crawler_session_state_key_missing', 'CREDENTIALS_ENCRYPTION_KEY가 설정되지 않았습니다.')
  }

  try {
    const decrypted = await decrypt_secret(encrypted, encryption_key)
    return c.json({
      success: true,
      session_state: JSON.parse(decrypted)
    })
  } catch (error: any) {
    return json_error(c, 500, 'crawler_session_state_read_failed', error.message || '세션 상태 복호화에 실패했습니다.')
  }
})

apiRoutes.post('/crawler/platform-session-state', async (c) => {
  const { store_id, platform, session_state, clear } = await read_json_body<{
    store_id?: number
    platform?: string
    session_state?: unknown
    clear?: boolean
  }>(c)

  const normalized_store_id = as_number(store_id)
  const normalized_platform = String(platform || '')
  if (!normalized_store_id || !supported_platforms.has(normalized_platform)) {
    return json_error(c, 400, 'crawler_session_state_invalid', 'store_id와 platform이 필요합니다.')
  }

  if (clear) {
    await write_platform_session_state_encrypted(c.env.DB, normalized_store_id, normalized_platform, null)
    return c.json({ success: true, session_state: null })
  }

  if (!session_state || typeof session_state !== 'object') {
    return json_error(c, 400, 'crawler_session_state_invalid_payload', 'session_state 객체가 필요합니다.')
  }

  const encryption_key = get_credentials_encryption_key(c)
  if (!encryption_key) {
    return json_error(c, 500, 'crawler_session_state_key_missing', 'CREDENTIALS_ENCRYPTION_KEY가 설정되지 않았습니다.')
  }

  try {
    const encrypted = await encrypt_secret(JSON.stringify(session_state), encryption_key)
    await write_platform_session_state_encrypted(c.env.DB, normalized_store_id, normalized_platform, encrypted)
    return c.json({ success: true })
  } catch (error: any) {
    return json_error(c, 500, 'crawler_session_state_write_failed', error.message || '세션 상태 저장에 실패했습니다.')
  }
})

apiRoutes.get('/crawler/status', async (c) => {
  try {
    const response = await fetch(`${get_crawler_base(c)}/health`, {
      headers: get_crawler_headers(c)
    })
    const data = await response.json()
    return c.json({ crawler_status: response.ok ? 'online' : 'offline', ...data })
  } catch (error: any) {
    return c.json({ crawler_status: 'offline', message: error.message || '크롤러 서버에 연결할 수 없습니다.' })
  }
})

apiRoutes.post('/reviews/sync', async (c) => {
  const auth_user = c.get('auth_user')
  const body = await read_json_body<{ platform?: string; platforms?: string[]; store_id?: number }>(c)
  const store_id = resolve_store_id(auth_user, as_number(body.store_id) || null)
  if (!store_id) {
    return json_error(c, 400, 'store_not_found', '동기화할 매장을 찾을 수 없습니다.')
  }

  const requested_platforms = Array.isArray(body.platforms)
    ? body.platforms
    : body.platform
      ? [body.platform]
      : ['baemin']

  const platforms = requested_platforms.filter((platform) => supported_platforms.has(platform))
  if (!platforms.length) {
    return json_error(c, 400, 'invalid_platform', '지원하는 플랫폼을 선택해주세요.')
  }

  const results: unknown[] = []
  let fetched = 0
  let inserted = 0
  let skipped = 0

  for (const platform of platforms) {
    try {
      const login_result = await ensure_live_platform_session(c, store_id, platform)
      if (!login_result.success) {
        results.push({ platform, success: false, error: login_result.error || '플랫폼 세션 연결에 실패했습니다.' })
        continue
      }

      const response = await fetch(`${get_crawler_base(c)}/fetch-reviews`, {
        method: 'POST',
        headers: get_crawler_headers(c, true),
        body: JSON.stringify({ platform, store_id })
      })

      const crawl_result = await response.json() as any
      if (!response.ok || !crawl_result.success) {
        results.push({ platform, success: false, error: crawl_result.error || crawl_result.message || 'crawl failed' })
        continue
      }

      const ingest_result = await ingest_reviews(c.env.DB, (crawl_result.reviews || []) as ReviewRecord[], store_id)
      fetched += as_number(crawl_result.count)
      inserted += ingest_result.inserted_count
      skipped += ingest_result.skipped_count
      results.push({
        platform,
        success: true,
        fetched: as_number(crawl_result.count),
        inserted: ingest_result.inserted_count,
        skipped: ingest_result.skipped_count,
        mode: crawl_result.mode || 'live'
      })
    } catch (error: any) {
      results.push({ platform, success: false, error: error.message })
    }
  }

  const has_failure = results.some((item: any) => item.success === false)
  return c.json({
    success: !has_failure,
    fetched,
    inserted,
    skipped,
    results
  })
})

apiRoutes.onError((error, c) => {
  console.error('API error:', error)
  return json_error(c, 500, 'internal_server_error', '서버 내부 오류가 발생했습니다.', true)
})

// ============ TEMPLATE FALLBACK ============
function get_template_fallback(sentiment: string, customer_name: string) {
  const templates: Record<string, { text: string; score: number }[]> = {
    positive: [
      { text: `${customer_name}님, 리뷰 남겨주셔서 감사합니다! 맛있게 드셨다니 정말 기쁘네요. 다음에도 맛있는 음식으로 보답하겠습니다 😊`, score: 7.5 },
      { text: `${customer_name}님 감사합니다! 만족하셨다니 보람차네요. 앞으로도 변함없는 맛으로 찾아뵙겠습니다!`, score: 7.3 }
    ],
    negative: [
      { text: `${customer_name}님, 불편을 드려 정말 죄송합니다. 말씀해주신 부분 꼭 개선하겠습니다. 다음엔 더 좋은 모습 보여드리겠습니다.`, score: 7.0 },
      { text: `${customer_name}님, 기대에 못 미쳐 죄송합니다. 소중한 의견 감사합니다. 더 나은 서비스를 위해 노력하겠습니다.`, score: 7.0 }
    ],
    neutral: [
      { text: `${customer_name}님, 리뷰 감사합니다! 더 나은 맛과 서비스로 찾아뵙겠습니다. 다음에도 찾아주세요!`, score: 7.2 }
    ]
  }

  const options = templates[sentiment] || templates.neutral
  return options[Math.floor(Math.random() * options.length)]
}
