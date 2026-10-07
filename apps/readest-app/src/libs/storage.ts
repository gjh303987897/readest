import { getAPIBaseUrl, isWebAppPlatform } from '@/services/environment';
import { AppService } from '@/types/system';
import { getUserID } from '@/utils/access';
import { fetchWithAuth } from '@/utils/fetch';
import {
  tauriUpload,
  tauriDownload,
  webUpload,
  webDownload,
  ProgressHandler,
  ProgressPayload,
} from '@/utils/transfer';

const getStorageEndpoint = (action: 'upload' | 'download' | 'delete') =>
  `${getAPIBaseUrl()}/storage/${action}`;

export const createProgressHandler = (
  totalFiles: number,
  completedFilesRef: { count: number },
  onProgress?: ProgressHandler,
) => {
  return (progress: ProgressPayload) => {
    const fileProgress =
      progress.total > 0 && Number.isFinite(progress.total) && Number.isFinite(progress.progress)
        ? Math.max(0, Math.min(1, progress.progress / progress.total))
        : 0;
    const completed = Number.isFinite(completedFilesRef.count) ? completedFilesRef.count : 0;
    const overallProgress =
      totalFiles > 0 && Number.isFinite(totalFiles)
        ? Math.max(0, Math.min(100, ((completed + fileProgress) / totalFiles) * 100))
        : 0;

    if (onProgress) {
      onProgress({
        progress: overallProgress,
        total: progress.total > 0 && Number.isFinite(progress.total) && totalFiles > 0 ? 100 : 0,
        transferSpeed: progress.transferSpeed,
      });
    }
  };
};

export const uploadFile = async (
  file: File,
  fileFullPath: string,
  onProgress?: ProgressHandler,
  bookHash?: string,
  signal?: AbortSignal,
) => {
  try {
    signal?.throwIfAborted();
    const response = await fetchWithAuth(getStorageEndpoint('upload'), {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        bookHash,
      }),
    });

    const { uploadUrl }: { uploadUrl: string } = await response.json();
    signal?.throwIfAborted();
    if (isWebAppPlatform()) {
      await webUpload(file, uploadUrl, onProgress, signal);
    } else {
      await tauriUpload(uploadUrl, fileFullPath, 'PUT', onProgress);
    }
    signal?.throwIfAborted();
  } catch (error) {
    if (signal?.aborted) throw error;
    console.error('File upload failed:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('File upload failed');
  }
};

export const batchGetDownloadUrls = async (
  files: { lfp: string; cfp: string }[],
  signal?: AbortSignal,
) => {
  try {
    signal?.throwIfAborted();
    const userId = await getUserID();
    if (!userId) {
      throw new Error('Not authenticated');
    }
    const filePaths = files.map((file) => file.cfp);
    const fileKeys = filePaths.map((path) => `${userId}/${path}`);
    const response = await fetchWithAuth(getStorageEndpoint('download'), {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileKeys }),
    });

    const { downloadUrls } = await response.json();
    return files.map((file) => {
      const fileKey = `${userId}/${file.cfp}`;
      return {
        lfp: file.lfp,
        cfp: file.cfp,
        downloadUrl: downloadUrls[fileKey],
      };
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    console.error('Batch get download URLs failed:', error);
    throw new Error('Batch get download URLs failed');
  }
};

type DownloadFileParams = {
  appService: AppService;
  dst: string;
  cfp: string;
  url?: string;
  headers?: Record<string, string>;
  singleThreaded?: boolean;
  skipSslVerification?: boolean;
  onProgress?: ProgressHandler;
  signal?: AbortSignal;
};

export const downloadFile = async ({
  appService,
  dst,
  cfp,
  url,
  headers,
  singleThreaded,
  skipSslVerification,
  onProgress,
  signal,
}: DownloadFileParams) => {
  try {
    signal?.throwIfAborted();
    let downloadUrl = url;
    if (!downloadUrl) {
      const userId = await getUserID();
      if (!userId) {
        throw new Error('Not authenticated');
      }
      const fileKey = `${userId}/${cfp}`;
      const response = await fetchWithAuth(
        `${getStorageEndpoint('download')}?fileKey=${encodeURIComponent(fileKey)}`,
        {
          method: 'GET',
          signal,
        },
      );

      const { downloadUrl: url } = await response.json();
      downloadUrl = url;
    }

    if (!downloadUrl) {
      throw new Error('No download URL available');
    }

    signal?.throwIfAborted();

    if (isWebAppPlatform()) {
      const { headers: responseHeaders, blob } = await webDownload(
        downloadUrl,
        onProgress,
        headers,
        signal,
      );
      signal?.throwIfAborted();
      await appService.writeFile(dst, 'None', await blob.arrayBuffer());
      return responseHeaders;
    } else {
      const responseHeaders = await tauriDownload(
        downloadUrl,
        dst,
        onProgress,
        headers,
        undefined,
        singleThreaded,
        skipSslVerification,
      );
      signal?.throwIfAborted();
      return responseHeaders;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    console.error(`File '${dst}' download failed:`, error);
    throw error;
  }
};

export const deleteFile = async (filePath: string, signal?: AbortSignal) => {
  try {
    signal?.throwIfAborted();
    const userId = await getUserID();
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const fileKey = `${userId}/${filePath}`;
    await fetchWithAuth(`${getStorageEndpoint('delete')}?fileKey=${encodeURIComponent(fileKey)}`, {
      method: 'DELETE',
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    // Best-effort cloud cleanup: removing the remote copy is non-critical and
    // callers dispatch this without awaiting, so throwing here surfaces as an
    // unhandled promise rejection (Sentry READEST-5). Log and swallow instead.
    console.warn('File deletion failed:', error);
  }
};
