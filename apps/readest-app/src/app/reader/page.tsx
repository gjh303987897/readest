'use client';

import { useOpenWithBooks } from '@/hooks/useOpenWithBooks';
import Reader from './components/Reader';

export default function Page() {
  useOpenWithBooks();
  return <Reader />;
}
