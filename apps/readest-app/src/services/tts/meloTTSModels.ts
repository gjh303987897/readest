import {
  BaseDirectory,
  exists as nativeExists,
  mkdir,
  open,
  remove,
  rename,
  stat,
} from '@tauri-apps/plugin-fs';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';

import { isTauriAppPlatform } from '@/services/environment';

export type MeloTTSModelCode = 'EN' | 'ES' | 'FR' | 'ZH' | 'JP' | 'KR';

export interface MeloTTSModelOption {
  code: MeloTTSModelCode;
  languageCode: string;
  label: string;
  checkpointUrl: string;
  configUrl: string;
  supportsMixedEnglish: boolean;
}

export interface MeloTTSDownloadProgress {
  loaded: number;
  total: number;
  progress: number;
}

const OFFICIAL_MODEL_BASE_URL = 'https://huggingface.co/myshell-ai';
const CACHE_NAME = 'readest-melotts-models-v1';
const NATIVE_MODEL_DIRECTORY = 'Readest/TTS/MeloTTS';

const MELO_TTS_MODEL_INFO: readonly Omit<MeloTTSModelOption, 'checkpointUrl' | 'configUrl'>[] = [
  { code: 'EN', languageCode: 'en', label: 'English', supportsMixedEnglish: false },
  { code: 'ES', languageCode: 'es', label: 'Spanish', supportsMixedEnglish: false },
  { code: 'FR', languageCode: 'fr', label: 'French', supportsMixedEnglish: false },
  { code: 'ZH', languageCode: 'zh', label: 'Chinese', supportsMixedEnglish: true },
  { code: 'JP', languageCode: 'ja', label: 'Japanese', supportsMixedEnglish: false },
  { code: 'KR', languageCode: 'ko', label: 'Korean', supportsMixedEnglish: false },
];

const MELO_TTS_MODELS: readonly MeloTTSModelOption[] = MELO_TTS_MODEL_INFO.map((model) => ({
  ...model,
  checkpointUrl: `${OFFICIAL_MODEL_BASE_URL}/MeloTTS-${model.label}/resolve/main/checkpoint.pth`,
  configUrl: `${OFFICIAL_MODEL_BASE_URL}/MeloTTS-${model.label}/resolve/main/config.json`,
}));

const modelByCode = new Map(MELO_TTS_MODELS.map((model) => [model.code, model]));
const modelByLanguage = new Map(MELO_TTS_MODELS.map((model) => [model.languageCode, model]));
const downloadTasks = new Map<MeloTTSModelCode, Promise<void>>();

const getPrimaryLanguageCode = (language: string | string[] | undefined): string | null => {
  const primaryLanguage = Array.isArray(language) ? language[0] : language;
  return primaryLanguage?.trim().toLowerCase().replace('_', '-').split('-')[0] || null;
};

const getModel = (code: MeloTTSModelCode): MeloTTSModelOption => {
  const model = modelByCode.get(code);
  if (!model) throw new Error(`Unsupported MeloTTS model: ${code}`);
  return model;
};

const openModelCache = async (): Promise<Cache> => {
  if (typeof caches === 'undefined') {
    throw new Error('Local model storage is unavailable on this device');
  }
  return caches.open(CACHE_NAME);
};

const getResourceUrls = (model: MeloTTSModelOption): string[] => [
  model.configUrl,
  model.checkpointUrl,
];

interface MeloTTSModelResource {
  fileName: 'config.json' | 'checkpoint.pth';
  url: string;
}

const getModelResources = (model: MeloTTSModelOption): MeloTTSModelResource[] => [
  { fileName: 'config.json', url: model.configUrl },
  { fileName: 'checkpoint.pth', url: model.checkpointUrl },
];

const getNativeModelPath = (model: MeloTTSModelOption, resource: MeloTTSModelResource): string =>
  `${NATIVE_MODEL_DIRECTORY}/${model.code}/${resource.fileName}`;

const fetchModelResource = async (url: string): Promise<Response> => {
  if (isTauriAppPlatform()) {
    return nativeFetch(url, { connectTimeout: 30_000, maxRedirections: 10 });
  }
  return fetch(url);
};

export const getMeloTTSModelCatalog = (): MeloTTSModelOption[] =>
  MELO_TTS_MODELS.map((model) => ({ ...model }));

/** Uses only the book's primary language. There is deliberately no fallback language. */
export const resolveMeloTTSModel = (
  language: string | string[] | undefined,
): MeloTTSModelOption | null => {
  const languageCode = getPrimaryLanguageCode(language);
  const model = languageCode ? modelByLanguage.get(languageCode) : undefined;
  return model ? { ...model } : null;
};

const getStoredWebModelCodes = async (): Promise<MeloTTSModelCode[]> => {
  const cache = await openModelCache();
  const stored = await Promise.all(
    MELO_TTS_MODELS.map(async (model) => {
      const resources = await Promise.all(getResourceUrls(model).map((url) => cache.match(url)));
      return resources.every(Boolean) ? model.code : null;
    }),
  );
  return stored.filter((code): code is MeloTTSModelCode => code !== null);
};

const isCompleteNativeFile = async (path: string): Promise<boolean> => {
  try {
    const fileInfo = await stat(path, { baseDir: BaseDirectory.AppCache });
    return fileInfo.isFile && fileInfo.size > 0;
  } catch {
    return false;
  }
};

const getStoredNativeModelCodes = async (): Promise<MeloTTSModelCode[]> => {
  const stored = await Promise.all(
    MELO_TTS_MODELS.map(async (model) => {
      const resources = await Promise.all(
        getModelResources(model).map((resource) =>
          isCompleteNativeFile(getNativeModelPath(model, resource)),
        ),
      );
      return resources.every(Boolean) ? model.code : null;
    }),
  );
  return stored.filter((code): code is MeloTTSModelCode => code !== null);
};

export const getStoredMeloTTSModelCodes = async (): Promise<MeloTTSModelCode[]> =>
  isTauriAppPlatform() ? getStoredNativeModelCodes() : getStoredWebModelCodes();

const cacheResponseWithProgress = async (
  cache: Cache,
  url: string,
  response: Response,
  total: number,
  state: { loaded: number },
  onProgress?: (progress: MeloTTSDownloadProgress) => void,
): Promise<void> => {
  const report = () => {
    onProgress?.({
      loaded: state.loaded,
      total,
      progress: total > 0 ? Math.min(1, state.loaded / total) : 0,
    });
  };

  if (!response.body) {
    const data = await response.arrayBuffer();
    state.loaded += data.byteLength;
    report();
    await cache.put(
      url,
      new Response(data, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    );
    return;
  }

  const reader = response.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await reader.read();
      if (result.done) {
        controller.close();
        return;
      }
      state.loaded += result.value.byteLength;
      report();
      controller.enqueue(result.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  await cache.put(
    url,
    new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  );
};

const removeNativeFileIfPresent = async (path: string): Promise<void> => {
  if (await nativeExists(path, { baseDir: BaseDirectory.AppCache })) {
    await remove(path, { baseDir: BaseDirectory.AppCache });
  }
};

const reportProgress = (
  state: { loaded: number },
  total: number,
  onProgress?: (progress: MeloTTSDownloadProgress) => void,
): void => {
  onProgress?.({
    loaded: state.loaded,
    total,
    progress: total > 0 ? Math.min(1, state.loaded / total) : 0,
  });
};

const writeNativeModelResource = async (
  model: MeloTTSModelOption,
  resource: MeloTTSModelResource,
  response: Response,
  total: number,
  state: { loaded: number },
  onProgress?: (progress: MeloTTSDownloadProgress) => void,
): Promise<void> => {
  const finalPath = getNativeModelPath(model, resource);
  const partialPath = `${finalPath}.part`;
  const expectedSize = Number(response.headers.get('content-length') || 0);
  let downloadedSize = 0;
  let file: Awaited<ReturnType<typeof open>> | null = null;
  let fileClosed = false;
  let completed = false;

  await removeNativeFileIfPresent(partialPath);

  try {
    file = await open(partialPath, {
      write: true,
      create: true,
      truncate: true,
      baseDir: BaseDirectory.AppCache,
    });

    const writeChunk = async (chunk: Uint8Array): Promise<void> => {
      const written = await file?.write(chunk);
      if (written !== chunk.byteLength) {
        throw new Error('MeloTTS model file could not be written completely');
      }
      downloadedSize += chunk.byteLength;
      state.loaded += chunk.byteLength;
      reportProgress(state, total, onProgress);
    };

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        await writeChunk(result.value);
      }
    } else {
      await writeChunk(new Uint8Array(await response.arrayBuffer()));
    }

    await file.close();
    fileClosed = true;

    if (downloadedSize === 0 || (expectedSize > 0 && downloadedSize !== expectedSize)) {
      throw new Error(
        `MeloTTS model download was incomplete (${downloadedSize}/${expectedSize || 'unknown'} bytes)`,
      );
    }

    const fileInfo = await stat(partialPath, { baseDir: BaseDirectory.AppCache });
    if (!fileInfo.isFile || fileInfo.size !== downloadedSize) {
      throw new Error('MeloTTS model file verification failed');
    }

    await removeNativeFileIfPresent(finalPath);
    await rename(partialPath, finalPath, {
      oldPathBaseDir: BaseDirectory.AppCache,
      newPathBaseDir: BaseDirectory.AppCache,
    });
    completed = true;
  } finally {
    if (file && !fileClosed) {
      await file.close().catch(() => undefined);
    }
    if (!completed) {
      await removeNativeFileIfPresent(partialPath);
    }
  }
};

const downloadWebModel = async (
  model: MeloTTSModelOption,
  onProgress?: (progress: MeloTTSDownloadProgress) => void,
): Promise<void> => {
  const cache = await openModelCache();
  const urls = getResourceUrls(model);
  const existingResources = await Promise.all(urls.map((url) => cache.match(url)));
  if (existingResources.every(Boolean)) {
    onProgress?.({ loaded: 0, total: 0, progress: 1 });
    return;
  }

  const responses = await Promise.all(
    urls.map(async (url) => {
      const response = await fetchModelResource(url);
      if (!response.ok) {
        throw new Error(`MeloTTS model download failed (${response.status})`);
      }
      return { url, response };
    }),
  );
  const total = responses.reduce(
    (sum, { response }) => sum + Number(response.headers.get('content-length') || 0),
    0,
  );
  const state = { loaded: 0 };

  try {
    for (const { url, response } of responses) {
      await cacheResponseWithProgress(cache, url, response, total, state, onProgress);
    }
    onProgress?.({ loaded: state.loaded, total: total || state.loaded, progress: 1 });
  } catch (error) {
    await Promise.all(urls.map((url) => cache.delete(url)));
    throw error;
  }
};

const downloadNativeModel = async (
  model: MeloTTSModelOption,
  onProgress?: (progress: MeloTTSDownloadProgress) => void,
): Promise<void> => {
  await mkdir(`${NATIVE_MODEL_DIRECTORY}/${model.code}`, {
    recursive: true,
    baseDir: BaseDirectory.AppCache,
  });

  const resourceStates = await Promise.all(
    getModelResources(model).map(async (resource) => ({
      resource,
      stored: await isCompleteNativeFile(getNativeModelPath(model, resource)),
    })),
  );
  const missingResources = resourceStates
    .filter(({ stored }) => !stored)
    .map(({ resource }) => resource);
  if (missingResources.length === 0) {
    onProgress?.({ loaded: 0, total: 0, progress: 1 });
    return;
  }

  const responses = await Promise.all(
    missingResources.map(async (resource) => {
      const response = await fetchModelResource(resource.url);
      if (!response.ok) {
        throw new Error(`MeloTTS model download failed (${response.status})`);
      }
      return { resource, response };
    }),
  );
  const total = responses.reduce(
    (sum, { response }) => sum + Number(response.headers.get('content-length') || 0),
    0,
  );
  const state = { loaded: 0 };

  for (const { resource, response } of responses) {
    await writeNativeModelResource(model, resource, response, total, state, onProgress);
  }
  onProgress?.({ loaded: state.loaded, total: total || state.loaded, progress: 1 });
};

export const downloadMeloTTSModel = async (
  code: MeloTTSModelCode,
  onProgress?: (progress: MeloTTSDownloadProgress) => void,
): Promise<void> => {
  const model = getModel(code);
  const existingTask = downloadTasks.get(code);
  if (existingTask) return existingTask;

  const task = (async () => {
    if (isTauriAppPlatform()) {
      await downloadNativeModel(model, onProgress);
    } else {
      await downloadWebModel(model, onProgress);
    }
  })();
  downloadTasks.set(code, task);

  try {
    await task;
  } finally {
    downloadTasks.delete(code);
  }
};

export const removeMeloTTSModel = async (code: MeloTTSModelCode): Promise<void> => {
  const model = getModel(code);
  if (isTauriAppPlatform()) {
    await Promise.all(
      getModelResources(model).flatMap((resource) => {
        const path = getNativeModelPath(model, resource);
        return [removeNativeFileIfPresent(path), removeNativeFileIfPresent(`${path}.part`)];
      }),
    );
    return;
  }

  const cache = await openModelCache();
  await Promise.all(getResourceUrls(model).map((url) => cache.delete(url)));
};
