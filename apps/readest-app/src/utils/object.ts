import { s3Storage } from './s3';
import { r2Storage } from './r2';
import { getStorageType } from './storage';

/**
 * Validate the only cloud object shape this app supports: a book or its cover.
 * Both raw and decoded forms are checked because the R2 URL parser normalizes
 * encoded path separators before signing.
 */
export const isSafeObjectKeyName = (fileName: string, expectedBookHash?: string): boolean => {
  if (typeof fileName !== 'string' || fileName.length === 0) return false;

  const forms = [fileName];
  try {
    const decoded = decodeURIComponent(fileName);
    if (decoded !== fileName) forms.push(decoded);
  } catch {
    return false; // malformed percent-encoding
  }

  for (const form of forms) {
    if (form.includes('\\') || form.includes('\0')) return false;
    const parts = form.split('/');
    if (parts.length !== 4 || parts[0] !== 'Readest' || parts[1] !== 'Books') return false;
    const hash = parts[2]!;
    const name = parts[3]!;
    if (!/^[a-f0-9]{32}$/i.test(hash)) return false;
    if (expectedBookHash && hash.toLowerCase() !== expectedBookHash.toLowerCase()) return false;
    if (!name || name === '.' || name === '..') return false;
    if (name !== 'cover.png' && !/\.(epub|mobi|azw|azw3|fb2|fbz|cbz|pdf|txt|md)$/i.test(name)) {
      return false;
    }
  }
  return true;
};

export const isUserBookObjectKey = (fileKey: string, userId: string): boolean => {
  if (typeof fileKey !== 'string' || typeof userId !== 'string') return false;
  const prefix = `${userId}/`;
  return fileKey.startsWith(prefix) && isSafeObjectKeyName(fileKey.slice(prefix.length));
};

export const getDownloadSignedUrl = async (
  fileKey: string,
  expiresIn: number,
  bucketName?: string,
) => {
  const storageType = getStorageType();
  if (storageType === 'r2') {
    bucketName = bucketName || process.env['R2_BUCKET_NAME'] || '';
    return await r2Storage.getDownloadSignedUrl(bucketName, fileKey, expiresIn);
  } else {
    bucketName = bucketName || process.env['S3_BUCKET_NAME'] || '';
    return await s3Storage.getDownloadSignedUrl(bucketName, fileKey, expiresIn);
  }
};

export const getUploadSignedUrl = async (
  fileKey: string,
  contentLength: number,
  expiresIn: number,
  bucketName?: string,
) => {
  const storageType = getStorageType();
  if (storageType === 'r2') {
    bucketName = bucketName || process.env['R2_BUCKET_NAME'] || '';
    return await r2Storage.getUploadSignedUrl(bucketName, fileKey, contentLength, expiresIn);
  } else {
    bucketName = bucketName || process.env['S3_BUCKET_NAME'] || '';
    return await s3Storage.getUploadSignedUrl(bucketName, fileKey, contentLength, expiresIn);
  }
};

export const deleteObject = async (fileKey: string, bucketName?: string) => {
  const storageType = getStorageType();
  if (storageType === 'r2') {
    bucketName = bucketName || process.env['R2_BUCKET_NAME'] || '';
    return await r2Storage.deleteObject(bucketName, fileKey);
  } else {
    bucketName = bucketName || process.env['S3_BUCKET_NAME'] || '';
    return await s3Storage.deleteObject(bucketName, fileKey);
  }
};
