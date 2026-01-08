import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const CURRENT_VERSION = 1;

export interface EncryptedPayload {
  version: number;
  salt: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

export function createPassphrase(userEmail: string, deviceId: string): string {
  return `${userEmail}:${deviceId}:envsync-v${CURRENT_VERSION}`;
}

export function encrypt(content: string, passphrase: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(passphrase, salt);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(content, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag();
  
  const payload: EncryptedPayload = {
    version: CURRENT_VERSION,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    ciphertext,
    tag: tag.toString('hex')
  };
  
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

export function decrypt(encryptedData: string, passphrase: string): string {
  try {
    const payloadJson = Buffer.from(encryptedData, 'base64').toString('utf8');
    const payload: EncryptedPayload = JSON.parse(payloadJson);
    
    if (payload.version !== CURRENT_VERSION) {
      throw new Error(`Unsupported encryption version: ${payload.version}`);
    }
    
    const salt = Buffer.from(payload.salt, 'hex');
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');
    const key = deriveKey(passphrase, salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Unsupported state or unable to authenticate')) {
        throw new Error('Decryption failed: data may be corrupted or encrypted with different credentials');
      }
      throw error;
    }
    throw new Error('Decryption failed: unknown error');
  }
}

export function isModernFormat(encryptedData: string): boolean {
  try {
    const decoded = Buffer.from(encryptedData, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.version === 'number' &&
      typeof parsed.salt === 'string' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.ciphertext === 'string' &&
      typeof parsed.tag === 'string'
    );
  } catch {
    return false;
  }
}

export function isLegacyFormat(encryptedData: string): boolean {
  return !isModernFormat(encryptedData);
}

export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}
