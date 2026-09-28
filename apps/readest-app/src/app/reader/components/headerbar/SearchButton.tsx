import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useSidebarStore } from '@/store/sidebarStore';

interface SearchButtonProps {
  bookKey: string;
}

const SearchButton: React.FC<SearchButtonProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchText, setSearchText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { setSearchTerm, setSearchBarVisible } = useSidebarStore();

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchText.trim()) {
      setSearchTerm(bookKey, searchText.trim());
      setSearchBarVisible(true);
      setIsExpanded(false);
      setSearchText('');
    }
  };

  const handleBlur = () => {
    // Small delay to allow click on search button to register
    setTimeout(() => {
      if (!searchText.trim()) {
        setIsExpanded(false);
      }
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsExpanded(false);
      setSearchText('');
    }
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className='touch-optimized flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 hover:bg-base-200'
        aria-label={_('Search')}
        title={_('Search')}
      >
        <svg
          xmlns='http://www.w3.org/2000/svg'
          fill='none'
          viewBox='0 0 24 24'
          strokeWidth={1.5}
          stroke='currentColor'
          className='h-5 w-5'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z'
          />
        </svg>
      </button>
    );
  }

  return (
    <form onSubmit={handleSearch} className='flex items-center gap-1'>
      <div className='relative'>
        <input
          ref={inputRef}
          type='text'
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={_('Search...')}
          className='h-8 w-40 rounded-md border border-base-300 bg-base-100 px-3 pr-8 text-sm transition-colors duration-200 focus:border-primary focus:outline-none sm:w-48'
        />
        <button
          type='submit'
          className='absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-r-md transition-colors duration-200 hover:bg-base-200'
          aria-label={_('Search')}
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            fill='none'
            viewBox='0 0 24 24'
            strokeWidth={1.5}
            stroke='currentColor'
            className='h-4 w-4'
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z'
            />
          </svg>
        </button>
      </div>
      <button
        type='button'
        onClick={() => {
          setIsExpanded(false);
          setSearchText('');
        }}
        className='touch-optimized flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-200 hover:bg-base-200'
        aria-label={_('Close')}
      >
        <svg
          xmlns='http://www.w3.org/2000/svg'
          fill='none'
          viewBox='0 0 24 24'
          strokeWidth={1.5}
          stroke='currentColor'
          className='h-4 w-4'
        >
          <path strokeLinecap='round' strokeLinejoin='round' d='M6 18 18 6M6 6l12 12' />
        </svg>
      </button>
    </form>
  );
};

export default SearchButton;
