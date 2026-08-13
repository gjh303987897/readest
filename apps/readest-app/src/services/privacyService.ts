import type { Book } from '@/types/book';

export interface PrivacyCredential {
  version: 1;
  algorithm: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  verifier: string;
}

export interface PrivacyEncryptionKdf {
  algorithm: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
}

export interface EncryptedPrivacyEnvelope {
  version: 1;
  algorithm: 'AES-GCM';
  kdf: PrivacyEncryptionKdf;
  iv: string;
  ciphertext: string;
}

export interface PrivacyPayload {
  credential: PrivacyCredential;
  hiddenBookHashes: string[];
}

const ITERATIONS = 210_000;
const ENCRYPTION_ITERATIONS = 600_000;

export const isPrivacyCredential = (value: unknown): value is PrivacyCredential => {
  if (!value || typeof value !== 'object') return false;
  const credential = value as Partial<PrivacyCredential>;
  return (
    credential.version === 1 &&
    credential.algorithm === 'PBKDF2-SHA-256' &&
    credential.iterations === ITERATIONS &&
    typeof credential.salt === 'string' &&
    credential.salt.length > 0 &&
    typeof credential.verifier === 'string' &&
    credential.verifier.length > 0
  );
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const deriveVerifier = async (pin: string, salt: Uint8Array, iterations: number) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
};

const isBase64 = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    return bytesToBase64(base64ToBytes(value)).replace(/=+$/, '') === value.replace(/=+$/, '');
  } catch {
    return false;
  }
};

export const isEncryptedPrivacyEnvelope = (value: unknown): value is EncryptedPrivacyEnvelope => {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<EncryptedPrivacyEnvelope>;
  const kdf = envelope.kdf as Partial<PrivacyEncryptionKdf> | undefined;
  return (
    envelope.version === 1 &&
    envelope.algorithm === 'AES-GCM' &&
    kdf?.algorithm === 'PBKDF2-SHA-256' &&
    kdf.iterations === ENCRYPTION_ITERATIONS &&
    isBase64(kdf.salt) &&
    base64ToBytes(kdf.salt).length === 16 &&
    isBase64(envelope.iv) &&
    base64ToBytes(envelope.iv).length === 12 &&
    isBase64(envelope.ciphertext) &&
    base64ToBytes(envelope.ciphertext).length >= 16
  );
};

export const isPrivacyPayload = (value: unknown): value is PrivacyPayload => {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<PrivacyPayload>;
  return (
    isPrivacyCredential(payload.credential) &&
    Array.isArray(payload.hiddenBookHashes) &&
    payload.hiddenBookHashes.every((hash) => typeof hash === 'string' && hash.length > 0)
  );
};

const deriveEncryptionKey = async (pin: string, kdf: PrivacyEncryptionKdf): Promise<CryptoKey> => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(base64ToBytes(kdf.salt)),
      iterations: kdf.iterations,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

export const encryptPrivacyPayload = async (
  payload: PrivacyPayload,
  key: CryptoKey,
  kdf: PrivacyEncryptionKdf,
): Promise<EncryptedPrivacyEnvelope> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    version: 1,
    algorithm: 'AES-GCM',
    kdf,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
};

export const createEncryptedPrivacyEnvelope = async (
  pin: string,
  payload: PrivacyPayload,
): Promise<EncryptedPrivacyEnvelope> => {
  return (await createUnlockedPrivacyEnvelope(pin, payload)).envelope;
};

export const createUnlockedPrivacyEnvelope = async (
  pin: string,
  payload: PrivacyPayload,
): Promise<{ envelope: EncryptedPrivacyEnvelope; key: CryptoKey }> => {
  if (!isValidPrivacyPin(pin) || !isPrivacyPayload(payload)) {
    throw new Error('Invalid privacy payload');
  }
  const kdf: PrivacyEncryptionKdf = {
    algorithm: 'PBKDF2-SHA-256',
    iterations: ENCRYPTION_ITERATIONS,
    salt: bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),
  };
  const key = await deriveEncryptionKey(pin, kdf);
  return { envelope: await encryptPrivacyPayload(payload, key, kdf), key };
};

export const decryptPrivacyEnvelope = async (
  pin: string,
  envelope: EncryptedPrivacyEnvelope,
): Promise<PrivacyPayload> => {
  if (!isValidPrivacyPin(pin) || !isEncryptedPrivacyEnvelope(envelope)) {
    throw new Error('Invalid privacy envelope');
  }
  const key = await deriveEncryptionKey(pin, envelope.kdf);
  return decryptPrivacyEnvelopeWithKey(envelope, key);
};

export const decryptPrivacyEnvelopeWithKey = async (
  envelope: EncryptedPrivacyEnvelope,
  key: CryptoKey,
): Promise<PrivacyPayload> => {
  if (!isEncryptedPrivacyEnvelope(envelope)) throw new Error('Invalid privacy envelope');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64ToBytes(envelope.iv)) },
    key,
    toArrayBuffer(base64ToBytes(envelope.ciphertext)),
  );
  const payload = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  if (!isPrivacyPayload(payload)) throw new Error('Invalid privacy payload');
  return {
    credential: payload.credential,
    hiddenBookHashes: [...new Set(payload.hiddenBookHashes)],
  };
};

export const unlockPrivacyEnvelope = async (
  pin: string,
  envelope: EncryptedPrivacyEnvelope,
): Promise<{ payload: PrivacyPayload; key: CryptoKey }> => {
  if (!isValidPrivacyPin(pin) || !isEncryptedPrivacyEnvelope(envelope)) {
    throw new Error('Invalid privacy envelope');
  }
  const key = await deriveEncryptionKey(pin, envelope.kdf);
  const payload = await decryptPrivacyEnvelopeWithKey(envelope, key);
  if (!(await verifyPrivacyPin(pin, payload.credential))) throw new Error('Incorrect PIN');
  return { payload, key };
};

export const isValidPrivacyPin = (pin: string): boolean => /^\d{4,12}$/.test(pin);

export const createPrivacyCredential = async (pin: string): Promise<PrivacyCredential> => {
  if (!isValidPrivacyPin(pin)) throw new Error('PIN must contain 4 to 12 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier = await deriveVerifier(pin, salt, ITERATIONS);
  return {
    version: 1,
    algorithm: 'PBKDF2-SHA-256',
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    verifier: bytesToBase64(verifier),
  };
};

export const verifyPrivacyPin = async (
  pin: string,
  credential: PrivacyCredential,
): Promise<boolean> => {
  if (!isValidPrivacyPin(pin) || !isPrivacyCredential(credential)) return false;
  try {
    const actual = await deriveVerifier(pin, base64ToBytes(credential.salt), credential.iterations);
    return constantTimeEqual(actual, base64ToBytes(credential.verifier));
  } catch {
    return false;
  }
};

export const filterAccessibleBooks = (
  books: Book[],
  hiddenBookHashes: Iterable<string>,
  isUnlocked: boolean,
): Book[] => {
  if (isUnlocked) return books;
  const hidden = new Set(hiddenBookHashes);
  return books.filter((book) => !hidden.has(book.hash));
};
