'use client';

import Image from 'next/image';
import { useTranslation } from '@/hooks/useTranslation';

export default function Offline() {
  const _ = useTranslation();
  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-gray-100 text-center'>
      <div className='mb-4'>
        <Image
          src='/icon.png'
          alt={_('App Icon')}
          width={100}
          height={100}
          className='rounded-lg'
        />
      </div>

      <h1 className='text-2xl font-bold text-gray-800'>readest-tiny</h1>

      <p className='mt-2 text-gray-600'>
        {_("It seems you're offline. Please check your internet connection and try again.")}
      </p>
    </div>
  );
}
