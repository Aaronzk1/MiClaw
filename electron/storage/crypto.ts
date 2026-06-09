import { safeStorage, app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { logger } from '../ipc/logger'

const KEY_FILE = join(app.getPath('userData'), '.master-key')

function getMasterKey(): Buffer {
  if (existsSync(KEY_FILE)) {
    return readFileSync(KEY_FILE)
  }
  const { randomBytes } = require('crypto')
  const key = randomBytes(32)
  writeFileSync(KEY_FILE, key)
  return key
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(plaintext).toString('base64')
    }
    const { createCipheriv, randomBytes } = require('crypto')
    const key = getMasterKey()
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    let encrypted = cipher.update(plaintext, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    const tag = cipher.getAuthTag().toString('base64')
    return `aes:${iv.toString('base64')}:${tag}:${encrypted}`
  } catch (e) {
    logger.warn('Crypto', 'Encryption failed, storing plaintext')
    return plaintext
  }
}

export function decryptSecret(encrypted: string): string {
  if (!encrypted || (!encrypted.startsWith('enc:') && !encrypted.startsWith('aes:'))) {
    return encrypted
  }
  try {
    if (encrypted.startsWith('enc:')) {
      const data = Buffer.from(encrypted.slice(4), 'base64')
      return safeStorage.decryptString(data)
    }
    if (encrypted.startsWith('aes:')) {
      const { createDecipheriv } = require('crypto')
      const parts = encrypted.split(':')
      const iv = Buffer.from(parts[1], 'base64')
      const tag = Buffer.from(parts[2], 'base64')
      const data = parts[3]
      const key = getMasterKey()
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      let decrypted = decipher.update(data, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    }
    return encrypted
  } catch (e) {
    logger.warn('Crypto', 'Decryption failed, returning as-is')
    return encrypted
  }
}

export function encryptProvider(p: any): any {
  if (p.apiKey && !p.apiKey.startsWith('enc:') && !p.apiKey.startsWith('aes:')) {
    return { ...p, apiKey: encryptSecret(p.apiKey) }
  }
  return p
}

export function decryptProvider(p: any): any {
  if (p.apiKey) {
    return { ...p, apiKey: decryptSecret(p.apiKey) }
  }
  return p
}