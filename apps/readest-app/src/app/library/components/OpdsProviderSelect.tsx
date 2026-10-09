'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { BookOpen, Check, ChevronDown, LibraryBig } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import type { OpdsProvider } from '@/services/opdsService';

const providers = [
  { value: 'calibre-web', label: 'Calibre-Web', Icon: LibraryBig },
  { value: 'kavita', label: 'Kavita', Icon: BookOpen },
] as const;

interface OpdsProviderSelectProps {
  value: OpdsProvider | '';
  onChange: (value: OpdsProvider) => void;
  disabled: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
}

export default function OpdsProviderSelect({
  value,
  onChange,
  disabled,
  buttonRef,
}: OpdsProviderSelectProps) {
  const _ = useTranslation();
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = providers.findIndex((provider) => provider.value === value);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  const showOptions = () => {
    setActive(Math.max(0, selected));
    setOpen(true);
  };

  const choose = (index: number) => {
    onChange(providers[index]!.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div
      ref={container}
      className='relative'
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type='button'
        role='combobox'
        value={value}
        aria-label={_('OPDS provider')}
        aria-haspopup='listbox'
        aria-required='true'
        aria-expanded={open && !disabled}
        aria-controls={listId}
        aria-activedescendant={open && !disabled ? `${listId}-${active}` : undefined}
        disabled={disabled}
        className='eink-bordered border-base-300 bg-base-100 hover:border-base-content/30 flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-3 text-start text-sm transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-base-content/15 disabled:cursor-not-allowed disabled:opacity-50'
        onClick={() => (open ? setOpen(false) : showOptions())}
        onKeyDown={(event) => {
          const { key } = event;
          if (key === 'Tab') {
            setOpen(false);
            return;
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(key))
            return;
          if (key === 'Escape' && !open) return;
          event.preventDefault();
          event.stopPropagation();
          if (key === 'Escape') setOpen(false);
          else if (key === 'Enter' || key === ' ') {
            if (open) choose(active);
            else showOptions();
          } else {
            setOpen(true);
            setActive(
              key === 'Home'
                ? 0
                : key === 'End'
                  ? providers.length - 1
                  : !open
                    ? Math.max(0, selected)
                    : (active + (key === 'ArrowDown' ? 1 : -1) + providers.length) %
                      providers.length,
            );
          }
        }}
      >
        <LibraryBig aria-hidden='true' className='h-4 w-4 shrink-0 opacity-60' />
        <span
          className={`min-w-0 flex-1 truncate ${value ? 'font-medium' : 'text-base-content/60'}`}
        >
          {providers[selected]?.label ?? _('Select an OPDS provider')}
        </span>
        <ChevronDown
          aria-hidden='true'
          className={`h-4 w-4 shrink-0 opacity-60 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && !disabled && (
        <div
          id={listId}
          role='listbox'
          aria-label={_('OPDS provider')}
          className='view-switch-enter eink-bordered border-base-300 bg-base-100 absolute start-0 top-full z-20 mt-2 flex w-full flex-col gap-1 rounded-xl border p-1.5 shadow-sm'
        >
          {providers.map(({ value: option, label, Icon }, index) => (
            <button
              key={option}
              id={`${listId}-${index}`}
              type='button'
              role='option'
              aria-selected={value === option}
              tabIndex={-1}
              onPointerMove={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
              className={`active:bg-base-300 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm transition-colors duration-150 ${active === index ? 'bg-base-200' : value === option ? 'bg-base-200/60' : ''}`}
            >
              <Icon aria-hidden='true' className='h-4 w-4 shrink-0 opacity-60' />
              <span className={`min-w-0 flex-1 truncate ${value === option ? 'font-medium' : ''}`}>
                {label}
              </span>
              {value === option && <Check aria-hidden='true' className='h-4 w-4 shrink-0' />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
