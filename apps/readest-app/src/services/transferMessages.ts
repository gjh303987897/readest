import type { TransferItem } from '@/store/transferStore';
import type { TranslationFunc } from '@/hooks/useTranslation';

export interface TransferMessages {
  success: { upload: string; download: string; delete: string };
  failure: { upload: string; download: string; delete: string };
}

export const getTransferMessages = (
  transfer: TransferItem,
  _: TranslationFunc,
): TransferMessages => {
  const title = transfer.bookTitle;

  return {
    success: {
      upload: _('Book uploaded: {{title}}', { title }),
      download: _('Book downloaded: {{title}}', { title }),
      delete: _('Deleted cloud backup of the book: {{title}}', { title }),
    },
    failure: {
      upload: _('Failed to upload book: {{title}}', { title }),
      download: _('Failed to download book: {{title}}', { title }),
      delete: _('Failed to delete cloud backup of the book: {{title}}', { title }),
    },
  };
};
