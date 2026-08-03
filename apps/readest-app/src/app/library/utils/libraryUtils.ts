import type { Book } from '@/types/book';
import { SIZE_PER_LOC, SIZE_PER_TIME_UNIT } from '@/services/constants';

export const convertPagesToTimeRemainingMinutes = (
  pagesLeft: number,
  medianPageDurationSecs?: number,
): number => {
  const minutesPerPage = medianPageDurationSecs
    ? medianPageDurationSecs / 60
    : SIZE_PER_LOC / SIZE_PER_TIME_UNIT;
  return Math.max(1, Math.round(pagesLeft * minutesPerPage));
};

type CoverFields = Pick<Book, 'coverHash' | 'coverUpdatedAt'>;
type CoverSyncFields = Pick<
  Book,
  'coverHash' | 'coverUpdatedAt' | 'coverDownloadedAt' | 'deletedAt' | 'uploadedAt'
>;

const coverMs = (timestamp?: number | null) => timestamp ?? 0;

export const needsCoverRefresh = (local: CoverSyncFields, synced: CoverSyncFields): boolean => {
  if (synced.deletedAt || !synced.uploadedAt) return false;
  if (!local.coverDownloadedAt) return true;
  if (!synced.coverHash) return false;
  if (coverMs(synced.coverUpdatedAt) <= coverMs(local.coverUpdatedAt)) return false;
  return synced.coverHash !== local.coverHash;
};

export const pickFresherCover = (local: CoverFields, synced: CoverFields): CoverFields =>
  coverMs(synced.coverUpdatedAt) > coverMs(local.coverUpdatedAt)
    ? { coverHash: synced.coverHash, coverUpdatedAt: synced.coverUpdatedAt }
    : { coverHash: local.coverHash, coverUpdatedAt: local.coverUpdatedAt };
