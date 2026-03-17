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
