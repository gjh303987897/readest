import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  isTauri: false,
  nativeFetch: vi.fn(),
  nativeFiles: new Map<string, Uint8Array>(),
  fsExists: vi.fn(),
  fsMkdir: vi.fn(),
  fsOpen: vi.fn(),
  fsRemove: vi.fn(),
  fsRename: vi.fn(),
  fsStat: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => h.isTauri,
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: h.nativeFetch,
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppCache: 'AppCache' },
  exists: h.fsExists,
  mkdir: h.fsMkdir,
  open: h.fsOpen,
  remove: h.fsRemove,
  rename: h.fsRename,
  stat: h.fsStat,
}));

import {
  downloadMeloTTSModel,
  getStoredMeloTTSModelCodes,
  removeMeloTTSModel,
} from '@/services/tts/meloTTSModels';

describe('MeloTTS model storage', () => {
  const modelDirectory = 'Readest/TTS/MeloTTS';
  const cached = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (url: string) => cached.get(url)),
    put: vi.fn(async (url: string, response: Response) => {
      cached.set(url, response.clone());
      await response.arrayBuffer();
    }),
    delete: vi.fn(async (url: string) => cached.delete(url)),
  };

  beforeEach(() => {
    cached.clear();
    h.nativeFiles.clear();
    vi.clearAllMocks();
    h.isTauri = false;
    h.nativeFetch.mockImplementation(
      async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-length': '4' },
        }),
    );
    h.fsExists.mockImplementation(async (path: string) => h.nativeFiles.has(path));
    h.fsMkdir.mockResolvedValue(undefined);
    h.fsOpen.mockImplementation(async (path: string) => ({
      write: vi.fn(async (chunk: Uint8Array) => {
        const existing = h.nativeFiles.get(path) ?? new Uint8Array();
        const contents = new Uint8Array(existing.byteLength + chunk.byteLength);
        contents.set(existing);
        contents.set(chunk, existing.byteLength);
        h.nativeFiles.set(path, contents);
        return chunk.byteLength;
      }),
      close: vi.fn(async () => undefined),
    }));
    h.fsRemove.mockImplementation(async (path: string) => {
      h.nativeFiles.delete(path);
    });
    h.fsRename.mockImplementation(async (oldPath: string, newPath: string) => {
      const contents = h.nativeFiles.get(oldPath);
      if (!contents) throw new Error(`Missing file: ${oldPath}`);
      h.nativeFiles.set(newPath, contents);
      h.nativeFiles.delete(oldPath);
    });
    h.fsStat.mockImplementation(async (path: string) => {
      const contents = h.nativeFiles.get(path);
      if (!contents) throw new Error(`Missing file: ${path}`);
      return { isFile: true, size: contents.byteLength };
    });
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3, 4]), {
            status: 200,
            headers: { 'content-length': '4' },
          }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('downloads both official model files and reports the completed model as stored', async () => {
    const onProgress = vi.fn();

    await downloadMeloTTSModel('ZH', onProgress);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cache.put).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 8, total: 8, progress: 1 });
    expect(await getStoredMeloTTSModelCodes()).toEqual(['ZH']);
  });

  it('streams Tauri downloads into App Cache files instead of WebView CacheStorage', async () => {
    h.isTauri = true;
    const onProgress = vi.fn();

    await downloadMeloTTSModel('ZH', onProgress);

    expect(h.nativeFetch).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(h.fsRename).toHaveBeenCalledTimes(2);
    expect(h.nativeFiles.has(`${modelDirectory}/ZH/config.json`)).toBe(true);
    expect(h.nativeFiles.has(`${modelDirectory}/ZH/checkpoint.pth`)).toBe(true);
    expect(h.nativeFiles.has(`${modelDirectory}/ZH/config.json.part`)).toBe(false);
    expect(h.nativeFiles.has(`${modelDirectory}/ZH/checkpoint.pth.part`)).toBe(false);
    expect(onProgress).toHaveBeenLastCalledWith({ loaded: 8, total: 8, progress: 1 });
    expect(await getStoredMeloTTSModelCodes()).toEqual(['ZH']);
  });

  it('removes the checkpoint and config together', async () => {
    await downloadMeloTTSModel('EN');
    await removeMeloTTSModel('EN');

    expect(cache.delete).toHaveBeenCalledTimes(2);
    expect(await getStoredMeloTTSModelCodes()).toEqual([]);
  });

  it('removes both App Cache files in Tauri', async () => {
    h.isTauri = true;
    await downloadMeloTTSModel('EN');

    await removeMeloTTSModel('EN');

    expect(h.nativeFiles.has(`${modelDirectory}/EN/config.json`)).toBe(false);
    expect(h.nativeFiles.has(`${modelDirectory}/EN/checkpoint.pth`)).toBe(false);
    expect(await getStoredMeloTTSModelCodes()).toEqual([]);
  });

  it('keeps completed files and removes only the partial file after a Tauri write failure', async () => {
    h.isTauri = true;
    const configPath = `${modelDirectory}/ZH/config.json`;
    const checkpointPartPath = `${modelDirectory}/ZH/checkpoint.pth.part`;
    h.nativeFiles.set(configPath, new Uint8Array([9, 9]));
    h.fsOpen.mockImplementationOnce(async (path: string) => {
      h.nativeFiles.set(path, new Uint8Array());
      return {
        write: vi.fn(async () => {
          throw new Error('Disk write failed');
        }),
        close: vi.fn(async () => undefined),
      };
    });

    await expect(downloadMeloTTSModel('ZH')).rejects.toThrow('Disk write failed');

    expect(h.nativeFetch).toHaveBeenCalledTimes(1);
    expect(h.nativeFiles.has(configPath)).toBe(true);
    expect(h.nativeFiles.has(checkpointPartPath)).toBe(false);
    expect(await getStoredMeloTTSModelCodes()).toEqual([]);
  });

  it('rejects unknown model codes', async () => {
    await expect(downloadMeloTTSModel('DE' as 'EN')).rejects.toThrow(
      'Unsupported MeloTTS model: DE',
    );
  });
});
