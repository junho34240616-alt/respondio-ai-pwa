import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hash_password,
  sign_access_token,
  verify_access_token,
  verify_password
} from './auth.ts'

test('hash_password and verify_password round-trip', async () => {
  const password_hash = await hash_password('super-secret-password')

  assert.equal(await verify_password('owner@example.com', 'super-secret-password', password_hash), true)
  assert.equal(await verify_password('owner@example.com', 'wrong-password', password_hash), false)
})

test('verify_password keeps legacy demo credentials working', async () => {
  assert.equal(await verify_password('owner@test.com', 'password', 'hashed_password_123'), true)
  assert.equal(await verify_password('admin@respondio.com', 'admin123', 'hashed_admin_123'), true)
  assert.equal(await verify_password('owner@test.com', 'wrong', 'hashed_password_123'), false)
})

test('sign_access_token and verify_access_token validate signed tokens', async () => {
  const token = await sign_access_token({
    user_id: 1,
    email: 'owner@test.com',
    role: 'owner',
    store_id: 7
  }, 'test-secret', 60)

  const payload = await verify_access_token(token, 'test-secret')

  assert.ok(payload)
  assert.equal(payload?.user_id, 1)
  assert.equal(payload?.store_id, 7)
  assert.equal(payload?.email, 'owner@test.com')
})

test('verify_access_token rejects expired or tampered tokens', async () => {
  const expired_token = await sign_access_token({
    user_id: 1,
    email: 'owner@test.com',
    role: 'owner',
    store_id: 1
  }, 'test-secret', -1)

  assert.equal(await verify_access_token(expired_token, 'test-secret'), null)

  const valid_token = await sign_access_token({
    user_id: 1,
    email: 'owner@test.com',
    role: 'owner',
    store_id: 1
  }, 'test-secret', 60)

  const [header, payload, signature] = valid_token.split('.')
  const tampered_token = `${header}.${payload}.x${signature.slice(1)}`

  assert.equal(await verify_access_token(tampered_token, 'test-secret'), null)
})
