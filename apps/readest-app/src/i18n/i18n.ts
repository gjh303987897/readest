import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import translatableLngs from '../../i18n-langs.json';
import { initReactI18next } from 'react-i18next';

// 'en' is the source language and not listed in the translatable set.
export const SUPPORTED_LNGS = ['en', ...translatableLngs];

const fallbackLanguages: Record<string, string[]> = {
  'pt-BR': ['pt', 'en'],
  kk: ['ru', 'en'],
  ky: ['ru', 'en'],
  tk: ['ru', 'en'],
  ug: ['ru', 'en'],
  tt: ['ru', 'en'],
};

export const getFallbackLanguages = (language?: string): string[] => {
  const parts = language?.toLowerCase().split('-') ?? [];
  if (parts[0] === 'zh') {
    const traditional =
      parts.includes('hant') ||
      (!parts.includes('hans') && parts.some((part) => ['tw', 'hk', 'mo'].includes(part)));
    return [traditional ? 'zh-TW' : 'zh-CN', 'en'];
  }
  return fallbackLanguages[language ?? ''] ?? ['en'];
};

const isBrowser = typeof window !== 'undefined';

const initI18n = async () => {
  if (isBrowser) {
    const HttpApi = (await import('i18next-http-backend')).default;
    i18n.use(HttpApi);
  }

  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      supportedLngs: SUPPORTED_LNGS,
      fallbackLng: getFallbackLanguages,
      ns: ['translation'],
      defaultNS: 'translation',
      ...(isBrowser && {
        backend: {
          loadPath: '/locales/{{lng}}/{{ns}}.json',
        },
      }),
      detection: {
        order: ['querystring', 'localStorage', 'navigator'],
        caches: ['localStorage'],
      },
      keySeparator: false,
      nsSeparator: false,
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });

  i18n.on('languageChanged', (lng) => {
    if (typeof window !== 'undefined') {
      console.log('Language changed to', lng);
    }
  });
};

initI18n();

export default i18n;
