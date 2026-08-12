import type { Book } from '@/types/book';

export interface PrivacyCredential {
  version: 1;
  algorithm: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  verifier: string;
}

const ITERATIONS = 210_000;

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
