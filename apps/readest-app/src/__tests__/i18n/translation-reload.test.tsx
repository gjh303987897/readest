import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { useTranslation } from '@/hooks/useTranslation';
import appI18n from '@/i18n/i18n';

const keys = [
  'Kobo sync token (optional)',
  'Token or Kobo sync URL',
  'Enable Kobo sync in Calibre-Web, then copy the sync token or URL from your user profile. Save this login to send reading progress.',
];

const KoboFields = () => {
  const _ = useTranslation();
  return (
    <>
      <label htmlFor='kobo-token'>{_(keys[0]!)}</label>
      <input id='kobo-token' placeholder={_(keys[1]!)} />
      <p>{_(keys[2]!)}</p>
    </>
  );
};

afterEach(cleanup);

describe('translation resource refresh', () => {
  it.each([
    'zh-CN',
    'zh-TW',
  ])('updates mounted Kobo fields after reloading %s', async (language) => {
    await waitFor(() => expect(appI18n.options.react).toBeDefined());
    let catalog: Record<string, string> = {};
    const i18n = createInstance();
    i18n.use({
      type: 'backend',
      read: (
        _language: string,
        _namespace: string,
        callback: (error: null, data: object) => void,
      ) => callback(null, catalog),
    });
    await i18n.init({
      lng: language,
      fallbackLng: false,
      keySeparator: false,
      nsSeparator: false,
      react: appI18n.options.react,
    });
    render(
      <I18nextProvider i18n={i18n}>
        <KoboFields />
      </I18nextProvider>,
    );
    expect(screen.getByLabelText(keys[0]!)).toBeTruthy();
    catalog = JSON.parse(readFileSync(`public/locales/${language}/translation.json`, 'utf8'));
    await act(async () => {
      await i18n.reloadResources();
    });
    const input = screen.getByLabelText(catalog[keys[0]!]!);
    expect(input.getAttribute('placeholder')).toBe(catalog[keys[1]!]);
    expect(screen.getByText(catalog[keys[2]!]!)).toBeTruthy();
    expect(screen.queryByText(keys[0]!)).toBeNull();
  });
});
