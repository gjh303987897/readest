import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import '@/styles/macos.css';

// Real style computation matters here: accessibility selectors must override
// the more specific reader-control rules, including WebKit's prefixed filter.
let fixture: HTMLDivElement;
const root = document.documentElement;

beforeEach(() => {
  root.dataset['platform'] = 'macos';
  root.dataset['macosMaterial'] = 'standard';
  root.dataset['eink'] = 'false';
  root.style.setProperty('--fallback-b1', '#ffffff');
  fixture = document.createElement('div');
  fixture.innerHTML = `
    <div class="reader-chrome">
      <div class="header-bar">
        <div class="macos-toolbar-group"><button>Search</button></div>
        <div class="header-title"><div>Book title</div></div>
      </div>
    </div>
    <div class="macos-sidebar">Table of contents</div>
  `;
  document.body.appendChild(fixture);
});

afterEach(() => {
  fixture.remove();
  for (const name of ['platform', 'macosMaterial', 'eink', 'reduceMotion', 'increaseContrast']) {
    delete root.dataset[name];
  }
  root.style.removeProperty('--fallback-b1');
});

const style = (selector: string) => getComputedStyle(fixture.querySelector(selector)!);

describe('macOS navigation materials', () => {
  test('uses a local backdrop on controls and the directory', () => {
    expect(style('.macos-toolbar-group').backdropFilter).toContain('blur(');
    expect(style('.macos-sidebar').backdropFilter).toContain('blur(');
  });

  test('opaque fallback removes all backdrop filters and keeps text on a solid surface', () => {
    root.dataset['macosMaterial'] = 'solid';
    for (const selector of ['.macos-toolbar-group', '.header-title > div', '.macos-sidebar']) {
      expect(style(selector).backdropFilter).toBe('none');
      expect(style(selector).backgroundColor).toBe('rgb(255, 255, 255)');
    }
  });

  test('increase contrast makes control boundaries explicit', () => {
    root.dataset['increaseContrast'] = 'true';
    const group = style('.macos-toolbar-group');
    expect(group.borderTopStyle).toBe('solid');
    expect(group.borderTopColor).toBe(group.color);
  });

  test('reduce motion overrides toolbar transitions', () => {
    const button = fixture.querySelector('button')!;
    button.style.transition = 'opacity 200ms ease';
    root.dataset['reduceMotion'] = 'true';
    expect(getComputedStyle(button).transitionDuration).toBe('0s');
  });

  test('e-ink does not receive translucent navigation styles', () => {
    root.dataset['eink'] = 'true';
    expect(style('.macos-toolbar-group').backdropFilter).toBe('none');
    expect(style('.macos-sidebar').backdropFilter).toBe('none');
  });

  test('other platforms retain their own control styles', () => {
    root.dataset['platform'] = 'windows';
    expect(style('.macos-toolbar-group').backdropFilter).toBe('none');
    expect(style('.macos-toolbar-group').borderTopStyle).toBe('none');
  });
});
