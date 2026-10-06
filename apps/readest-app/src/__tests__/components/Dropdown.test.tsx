import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import Dropdown from '@/components/Dropdown';
import { DropdownProvider } from '@/context/DropdownContext';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Simulates the browser behavior where pressing Enter/Space on a focused
// <button> fires both a keydown event and a click event. JSDOM does not
// dispatch the click automatically, so we do it here.
const pressActivationKey = (el: HTMLElement, key: 'Enter' | ' ') => {
  fireEvent.keyDown(el, { key });
  fireEvent.click(el);
};

const renderDropdown = () =>
  render(
    <DropdownProvider>
      <Dropdown label='Test Menu' toggleButton={<span>Toggle</span>} showTooltip={false}>
        <div className='dropdown-content'>
          <button type='button'>Menu Item</button>
        </div>
      </Dropdown>
    </DropdownProvider>,
  );

describe('Dropdown keyboard activation', () => {
  it('opens when Enter is pressed on the toggle button', () => {
    renderDropdown();
    const toggle = screen.getByRole('button', { name: 'Test Menu' });

    toggle.focus();
    pressActivationKey(toggle, 'Enter');

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens when Space is pressed on the toggle button', () => {
    renderDropdown();
    const toggle = screen.getByRole('button', { name: 'Test Menu' });

    toggle.focus();
    pressActivationKey(toggle, ' ');

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes when Enter is pressed again on an open dropdown', () => {
    renderDropdown();
    const toggle = screen.getByRole('button', { name: 'Test Menu' });

    toggle.focus();
    pressActivationKey(toggle, 'Enter');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    pressActivationKey(toggle, 'Enter');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('stops propagation on Enter to prevent global shortcuts from firing', () => {
    renderDropdown();
    const toggle = screen.getByRole('button', { name: 'Test Menu' });

    const onWindowKeyDown = vi.fn();
    window.addEventListener('keydown', onWindowKeyDown);
    try {
      toggle.focus();
      fireEvent.keyDown(toggle, { key: 'Enter' });
      expect(onWindowKeyDown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown);
    }
  });

  it('stops propagation on Space to prevent global shortcuts from firing', () => {
    renderDropdown();
    const toggle = screen.getByRole('button', { name: 'Test Menu' });

    const onWindowKeyDown = vi.fn();
    window.addEventListener('keydown', onWindowKeyDown);
    try {
      toggle.focus();
      fireEvent.keyDown(toggle, { key: ' ' });
      expect(onWindowKeyDown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', onWindowKeyDown);
    }
  });
});

describe('Dropdown pointer alignment', () => {
  it.each([false, true])('points at the toggle after viewport clamping (%s)', (clamped) => {
    const left = clamped ? window.innerWidth - 150 : 100;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('dropdown-toggle')
        ? new DOMRect(left + 100, 20, 32, 32)
        : new DOMRect(left, 60, 200, 100);
    });
    renderDropdown();
    fireEvent.click(screen.getByRole('button', { name: 'Test Menu' }));
    const menu = document.querySelector<HTMLElement>('.dropdown-content')!;
    const dx = clamped ? -66 : 0;
    expect(menu.style.getPropertyValue('--dropdown-arrow-x')).toBe(`${116 - dx}px`);
    expect(menu.dataset['dropdownAnchored']).toBe('below');
  });

  it('moves the pointer to the bottom when the menu flips above its toggle', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('dropdown-toggle')
        ? new DOMRect(200, window.innerHeight - 60, 32, 32)
        : new DOMRect(100, window.innerHeight - 20, 200, 100);
    });
    renderDropdown();
    fireEvent.click(screen.getByRole('button', { name: 'Test Menu' }));
    const menu = document.querySelector<HTMLElement>('.dropdown-content')!;
    expect(menu.style.bottom).toBe('100%');
    expect(menu.dataset['dropdownAnchored']).toBe('above');
    expect(menu.style.getPropertyValue('--dropdown-arrow-x')).toBe('116px');
  });
});
