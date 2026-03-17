const encoder = new TextEncoder()
const decoder = new TextDecoder()

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

async function import_encryption_key(secret: string) {
  if (!secret) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured')
  }

  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export async function encrypt_secret(plaintext: string, secret: string): Promise<string> {
  const key = await import_encryption_key(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  )

  return `${bytes_to_base64url(iv)}.${bytes_to_base64url(new Uint8Array(encrypted))}`
}

export async function decrypt_secret(payload: string, secret: string): Promise<string> {
  const [iv_text, data_text] = payload.split('.')
  if (!iv_text || !data_text) {
    throw new Error('Encrypted secret payload is invalid')
  }

  const key = await import_encryption_key(secret)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64url_to_bytes(iv_text) },
    key,
    base64url_to_bytes(data_text)
  )

  return decoder.decode(decrypted)
}
