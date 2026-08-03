import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { AppService } from '@/types/system';

const basenameMock = vi.fn(async (path: string = '') => path.split('/').pop() || path);

vi.mock('@tauri-apps/api/path', () => ({ basename: (path: string) => basenameMock(path) }));
vi.mock('@/services/environment', () => ({ isTauriAppPlatform: () => true }));

import { useFileSelector } from '@/hooks/useFileSelector';

beforeEach(() => basenameMock.mockClear());

describe('useFileSelector book selection', () => {
  test('resolves opaque mobile names and filters unsupported files', async () => {
    basenameMock.mockResolvedValueOnce('book.epub').mockResolvedValueOnce('notes.exe');
    const selectFiles = vi.fn(async () => ['content://provider/1', 'content://provider/2']);
    const appService = {
      isIOSApp: false,
      isAndroidApp: true,
      selectFiles,
    } as unknown as AppService;

    const result = await useFileSelector(appService, (value) => value).selectFiles({
      type: 'books',
      multiple: true,
    });

    expect(selectFiles).toHaveBeenCalledWith('Select Books', []);
    expect(basenameMock).toHaveBeenNthCalledWith(1, 'content://provider/1');
    expect(basenameMock).toHaveBeenNthCalledWith(2, 'content://provider/2');
    expect(result.files).toEqual([{ path: 'content://provider/1', name: 'book.epub' }]);
  });
});
