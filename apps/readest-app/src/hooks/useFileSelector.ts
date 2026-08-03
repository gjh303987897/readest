import { basename } from '@tauri-apps/api/path';
import { BOOK_ACCEPT_FORMATS, SUPPORTED_BOOK_EXTS } from '@/services/constants';
import { isTauriAppPlatform } from '@/services/environment';
import { AppService } from '@/types/system';
import { isContentURI, isFileURI } from '@/utils/misc';
import { getFilename } from '@/utils/path';

export interface FileSelectorOptions {
  type: 'books';
  multiple?: boolean;
}

export interface SelectedFile {
  file?: File;
  path?: string;
  basePath?: string;
  name?: string;
}

const resolveTauriFileName = async (path: string, appService: AppService): Promise<string> => {
  if (isContentURI(path) || (isFileURI(path) && appService.isIOSApp)) {
    try {
      return await basename(path);
    } catch {
      // Fall through to parsing ordinary filesystem paths.
    }
  }
  return getFilename(path);
};

export const useFileSelector = (appService: AppService | null, _: (key: string) => string) => {
  const selectFiles = async (options: FileSelectorOptions) => {
    if (!appService) {
      return { files: [] as SelectedFile[], error: 'App service is not available' };
    }

    try {
      if (isTauriAppPlatform()) {
        const paths = await appService.selectFiles(_('Select Books'), []);
        const selected = await Promise.all(
          paths
            .filter((path): path is string => typeof path === 'string' && path.length > 0)
            .map(async (path) => ({ path, name: await resolveTauriFileName(path, appService) })),
        );
        const files = selected.filter(({ name }) => {
          const extension = name?.split('.').pop()?.toLowerCase();
          return !!extension && SUPPORTED_BOOK_EXTS.includes(extension);
        });
        return { files };
      }

      const files = await new Promise<File[]>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = BOOK_ACCEPT_FORMATS;
        input.multiple = options.multiple ?? false;
        input.onchange = () => resolve(Array.from(input.files ?? []));
        input.click();
      });
      return { files: files.map((file) => ({ file })) };
    } catch (error) {
      return {
        files: [] as SelectedFile[],
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  };

  return { selectFiles };
};
