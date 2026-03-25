import test from 'node:test'
import assert from 'node:assert/strict'
import { apiRoutes } from './api.ts'

const minimalEnv = {
  OPENAI_API_KEY: '',
  OPENAI_BASE_URL: '',
  JWT_SECRET: 'test-jwt-secret',
  CRAWLER_API_BASE: 'http://localhost:4000',
  CRAWLER_SHARED_SECRET: '',
  CREDENTIALS_ENCRYPTION_KEY: 'test-credentials-key',
  PORTONE_API_SECRET: '',
  PORTONE_STORE_ID: '',
  PORTONE_CHANNEL_KEY: '',
  PORTONE_WEBHOOK_SECRET: '',
  APP_BASE_URL: 'https://respondio.test'
} as any

test('protected reviews API rejects unauthenticated requests', async () => {
  const response = await apiRoutes.request('/reviews', undefined, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'auth_required')
})

test('login validates payload before hitting storage', async () => {
  const response = await apiRoutes.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 400)
  assert.equal(body.error.code, 'auth_invalid_payload')
})

test('refresh endpoint rejects missing refresh cookie', async () => {
  const response = await apiRoutes.request('/auth/refresh', { method: 'POST' }, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'refresh_token_missing')
})

test('portone webhook endpoint reports missing configuration without auth', async () => {
  const response = await apiRoutes.request('/webhooks/portone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  }, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 503)
  assert.equal(body.error.code, 'webhook_not_configured')
})

test('billing config endpoint requires auth', async () => {
  const response = await apiRoutes.request('/billing/config', undefined, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'auth_required')
})

test('mobile session config endpoint requires auth', async () => {
  const response = await apiRoutes.request('/platform_connections/baemin/mobile-session-config', undefined, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'auth_required')
})

test('crawler session state endpoint fails closed when shared secret is missing', async () => {
  const response = await apiRoutes.request('/crawler/platform-session-state?store_id=1&platform=baemin', undefined, minimalEnv)
  const body = await response.json()

  assert.equal(response.status, 503)
  assert.equal(body.error.code, 'crawler_secret_not_configured')
})

test('crawler session state endpoint requires matching shared secret header', async () => {
  const response = await apiRoutes.request('/crawler/platform-session-state?store_id=1&platform=baemin', undefined, {
    ...minimalEnv,
    CRAWLER_SHARED_SECRET: 'topsecret'
  } as any)
  const body = await response.json()

  assert.equal(response.status, 401)
  assert.equal(body.error.code, 'crawler_unauthorized')
})

test('public health endpoint degrades when crawler health fetch times out', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url

    if (url === 'http://localhost:4000/health') {
      const error = new Error('aborted')
      ;(error as Error & { name: string }).name = 'AbortError'
      throw error
    }

    return originalFetch(input, init)
  }) as typeof fetch

  try {
    const response = await apiRoutes.request('/health/public', undefined, minimalEnv)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.status, 'degraded')
    assert.equal(body.crawler.reachable, false)
    assert.equal(body.crawler.error, 'crawler_timeout')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('public health endpoint trims crawler base URL before probing', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch

  try {
    const response = await apiRoutes.request('/health/public', undefined, {
      ...minimalEnv,
      CRAWLER_API_BASE: 'http://localhost:4000/\n'
    } as any)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(requestedUrl, 'http://localhost:4000/health')
    assert.equal(body.crawler.reachable, true)
    assert.deepEqual(body.crawler.status, { ok: true })
  } finally {
    globalThis.fetch = originalFetch
  }
})
