import type { OpdsProvider } from './opdsService';

export interface SavedOpdsLogin {
  provider?: OpdsProvider;
  url: string;
  username: string;
  password: string;
  title: string;
  /** Calibre-Web's Kobo sync token; OPDS passwords cannot authorize this API. */
  koboToken?: string;
}

export const SAVED_LOGINS_KEY = 'readest-opds-logins-v1';

export const readSavedLogins = (): SavedOpdsLogin[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(SAVED_LOGINS_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((entry): entry is SavedOpdsLogin => {
      if (
        !entry ||
        typeof entry.url !== 'string' ||
        typeof entry.username !== 'string' ||
        typeof entry.password !== 'string' ||
        typeof entry.title !== 'string' ||
        (entry.koboToken !== undefined && typeof entry.koboToken !== 'string') ||
        (entry.provider !== undefined &&
          entry.provider !== 'calibre-web' &&
          entry.provider !== 'kavita')
      ) {
        return false;
      }
      try {
        return ['http:', 'https:'].includes(new URL(entry.url).protocol);
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
};
