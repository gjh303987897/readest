import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import { getFallbackLanguages, SUPPORTED_LNGS } from '@/i18n/i18n';
import { TRANSLATED_LANGS } from '@/services/constants';

const require = createRequire(import.meta.url);
const { Parser } = require('i18next-scanner');
const { input, options } = require('../../../i18next-scanner.config.cjs');

describe('Chinese UI translations', () => {
  it('names every language offered in the settings picker', () => {
    const unnamed = SUPPORTED_LNGS.filter(
      (language) => !TRANSLATED_LANGS[language as keyof typeof TRANSLATED_LANGS],
    );
    expect(unnamed).toEqual([]);
  });

  it('covers every statically extracted key in both Chinese catalogs', () => {
    const parser = new Parser({ ...options, lngs: ['zh-CN', 'zh-TW'] });
    for (const file of input) {
      parser.parseFuncFromString(readFileSync(file, 'utf8'));
    }

    const resources = parser.get();
    for (const language of ['zh-CN', 'zh-TW']) {
      const untranslated = Object.entries(resources[language].translation)
        .filter(([, value]) => value === '__STRING_NOT_TRANSLATED__')
        .map(([key]) => key);
      expect(untranslated, language).toEqual([]);
    }
  });

  it('uses Chinese catalogs for common system locale variants', async () => {
    const i18n = createInstance();
    await i18n.init({
      initImmediate: false,
      supportedLngs: SUPPORTED_LNGS,
      fallbackLng: getFallbackLanguages,
      resources: {},
    });

    for (const language of ['zh', 'zh-SG', 'zh-Hans', 'zh-Hans-SG']) {
      expect(i18n.services.languageUtils.toResolveHierarchy(language)[0]).toBe('zh-CN');
    }
    for (const language of ['zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-HK']) {
      expect(i18n.services.languageUtils.toResolveHierarchy(language)[0]).toBe('zh-TW');
    }
    expect(i18n.services.languageUtils.toResolveHierarchy('pt-BR')).toContain('pt');
  });
});
