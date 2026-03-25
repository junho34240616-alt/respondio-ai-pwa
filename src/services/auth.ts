const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const password_prefix = 'pbkdf2_sha256'
const password_iterations = 100_000

export type AuthTokenPayload = {
  user_id: number
  email: string
  role: string
  store_id: number | null
  exp: number
}

function bytes_to_base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64url_to_bytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

function secure_equals(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false

  let diff = 0
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i]
  }

  return diff === 0
}

async function import_signing_key(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

async function sign_payload(input: string, secret: string): Promise<string> {
  const key = await import_signing_key(secret)
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(input))
  return bytes_to_base64url(new Uint8Array(signature))
}

async function sha256_bytes(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(input))
  return new Uint8Array(digest)
}

async function derive_password_hash(password: string, salt: Uint8Array, iterations = password_iterations): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations
    },
    key,
    256
  )

  return new Uint8Array(derived)
}

function demo_password_matches(email: string, password: string, stored_hash: string): boolean {
  if (stored_hash === `hashed_${password}`) return true

  const demo_credentials: Record<string, { password: string; legacy_hash: string }> = {
    'owner@test.com': { password: 'password', legacy_hash: 'hashed_password_123' },
    'admin@respondio.com': { password: 'admin123', legacy_hash: 'hashed_admin_123' }
  }

  const candidate = demo_credentials[email]
  return !!candidate && candidate.password === password && candidate.legacy_hash === stored_hash
}

export async function hash_password(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const derived = await derive_password_hash(password, salt)
  return `${password_prefix}$${password_iterations}$${bytes_to_base64url(salt)}$${bytes_to_base64url(derived)}`
}

export async function verify_password(email: string, password: string, stored_hash: string): Promise<boolean> {
  if (!stored_hash) return false
  if (demo_password_matches(email, password, stored_hash)) return true

  const [prefix, iteration_text, salt_text, hash_text] = stored_hash.split('$')
  if (prefix !== password_prefix || !iteration_text || !salt_text || !hash_text) {
    return false
  }

  const iterations = Number(iteration_text)
  if (!Number.isFinite(iterations) || iterations <= 0) return false

  const salt = base64url_to_bytes(salt_text)
  const expected_hash = base64url_to_bytes(hash_text)
  const derived_hash = await derive_password_hash(password, salt, iterations)
  return secure_equals(derived_hash, expected_hash)
}

export async function sign_access_token(payload: Omit<AuthTokenPayload, 'exp'>, secret: string, expires_in_seconds = 60 * 60 * 8): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const full_payload: AuthTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expires_in_seconds
  }

  const encoded_header = bytes_to_base64url(textEncoder.encode(JSON.stringify(header)))
  const encoded_payload = bytes_to_base64url(textEncoder.encode(JSON.stringify(full_payload)))
  const signing_input = `${encoded_header}.${encoded_payload}`
  const signature = await sign_payload(signing_input, secret)

  return `${signing_input}.${signature}`
}

export async function verify_access_token(token: string, secret: string): Promise<AuthTokenPayload | null> {
  const [encoded_header, encoded_payload, signature] = token.split('.')
  if (!encoded_header || !encoded_payload || !signature) return null

  const signing_input = `${encoded_header}.${encoded_payload}`
  const expected_signature = await sign_payload(signing_input, secret)
  const expected_bytes = textEncoder.encode(expected_signature)
  const received_bytes = textEncoder.encode(signature)

  if (!secure_equals(expected_bytes, received_bytes)) {
    return null
  }

  try {
    const payload = JSON.parse(textDecoder.decode(base64url_to_bytes(encoded_payload))) as AuthTokenPayload
    if (!payload?.user_id || !payload?.email || !payload?.role || !payload?.exp) return null
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function generate_session_token(byte_length = 32): string {
  return bytes_to_base64url(crypto.getRandomValues(new Uint8Array(byte_length)))
}

export async function hash_session_token(token: string): Promise<string> {
  return bytes_to_base64url(await sha256_bytes(token))
}
