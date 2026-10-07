import { afterEach, expect, it, vi } from 'vitest';
import { webUpload, webDownload } from '@/utils/transfer';
import { uploadFile, downloadFile, batchGetDownloadUrls } from '@/libs/storage';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('does not report normal cancellation as a console error', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const controller = new AbortController();
  controller.abort();
  await expect(
    uploadFile(new File([], 'book'), '/book', undefined, undefined, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  await expect(batchGetDownloadUrls([], controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  await expect(
    downloadFile({ appService: {} as never, dst: '/book', cfp: 'book', signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(error).not.toHaveBeenCalled();
});
it('aborts an active browser upload and removes its signal listener', async () => {
  let xhr!: XMLHttpRequest;
  class FakeXHR {
    upload = {};
    onabort: (() => void) | null = null;
    open = vi.fn();
    send = vi.fn();
    abort = vi.fn(() => this.onabort?.());
    constructor() {
      xhr = this as unknown as XMLHttpRequest;
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  const upload = webUpload(
    new File(['data'], 'book.epub'),
    '/upload',
    undefined,
    controller.signal,
  );
  controller.abort();
  await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
  expect(xhr.abort).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});
it('does not start an upload that was already cancelled', async () => {
  const xhrConstructor = vi.fn();
  vi.stubGlobal('XMLHttpRequest', xhrConstructor);
  const controller = new AbortController();
  controller.abort();
  await expect(
    webUpload(new File([], 'book'), '/upload', undefined, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(xhrConstructor).not.toHaveBeenCalled();
});
it('forwards cancellation to the browser download request', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener('abort', () => reject(options.signal!.reason), {
          once: true,
        });
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const download = webDownload('/book', undefined, undefined, controller.signal);
  controller.abort();
  await expect(download).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher.mock.calls[0]![1].signal).toBe(controller.signal);
});
