import { nowIso } from "~src/lib/dates"
import type { EncryptedSecret } from "~src/types"

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const PBKDF2_ITERATIONS = 310_000

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const base64ToBytes = (base64: string) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export const createRandomBase64 = (byteLength = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return bytesToBase64(bytes)
}

const asBufferSource = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(0) as ArrayBuffer

const deriveAesKey = async (installationId: string, salt: Uint8Array, iterations: number) => {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(installationId),
    "PBKDF2",
    false,
    ["deriveKey"]
  )

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: asBufferSource(salt),
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  )
}

export const encryptString = async (
  plaintext: string,
  installationId: string,
  existing?: EncryptedSecret
): Promise<EncryptedSecret> => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(installationId, salt, PBKDF2_ITERATIONS)
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(iv) },
    key,
    encoder.encode(plaintext)
  )
  const timestamp = nowIso()

  return {
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2",
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  }
}

export const decryptString = async (secret: EncryptedSecret, installationId: string) => {
  const salt = base64ToBytes(secret.salt)
  const iv = base64ToBytes(secret.iv)
  const ciphertext = base64ToBytes(secret.ciphertext)
  const key = await deriveAesKey(installationId, salt, secret.iterations)
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(iv) },
    key,
    asBufferSource(ciphertext)
  )
  return decoder.decode(plaintext)
}
