import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useReaderStore } from '@/store/readerStore';
import { navigateToReader } from '@/utils/nav';

const useBooksManager = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { bookKeys } = useReaderStore();
  const { setBookKeys } = useReaderStore();
  const [shouldUpdateSearchParams, setShouldUpdateSearchParams] = useState(false);

  useEffect(() => {
    if (shouldUpdateSearchParams) {
      const ids = bookKeys.map((key) => key.split('-')[0]!);
      if (ids.length > 0) {
        navigateToReader(router, ids, searchParams?.toString() || '', { scroll: false });
      }
      setShouldUpdateSearchParams(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKeys, shouldUpdateSearchParams]);

  // Close a book and sync with bookKeys and URL
  const dismissBook = (bookKey: string) => {
    const updatedKeys = bookKeys.filter((key) => key !== bookKey);
    setBookKeys(updatedKeys);
    setShouldUpdateSearchParams(true);
  };

  const getNextBookKey = (bookKey: string) => {
    const index = bookKeys.indexOf(bookKey);
    const nextIndex = (index + 1) % bookKeys.length;
    return bookKeys[nextIndex]!;
  };

  return {
    bookKeys,
    dismissBook,
    getNextBookKey,
  };
};

export default useBooksManager;
