import { create } from 'zustand';

import {
  createPrivacyCredential,
  isPrivacyCredential,
  type PrivacyCredential,
  verifyPrivacyPin,
} from '@/services/privacyService';
import { eventDispatcher } from '@/utils/event';

const STORAGE_KEY = 'readest-privacy-mode-v1';
const LOCK_SIGNAL_KEY = 'readest-privacy-lock-signal';

interface PersistedPrivacyState {
  credential: PrivacyCredential | null;
  hiddenBookHashes: string[];
}

interface PrivacyState extends PersistedPrivacyState {
  isInitialized: boolean;
  hasPin: boolean;
  isUnlocked: boolean;
  setPin: (pin: string) => Promise<void>;
  changePin: (currentPin: string, nextPin: string) => Promise<boolean>;
  removePin: (pin: string) => Promise<boolean>;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  hideBook: (hash: string) => void;
  unhideBook: (hash: string) => void;
  isBookHidden: (hash: string) => boolean;
  canAccessBook: (hash: string) => boolean;
  hydrate: () => void;
}

const emptyPersistedState = (): PersistedPrivacyState => ({
  credential: null,
  hiddenBookHashes: [],
});

const readPersistedState = (): PersistedPrivacyState => {
  if (typeof localStorage === 'undefined') return emptyPersistedState();
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '',
    ) as Partial<PersistedPrivacyState>;
    const credential = isPrivacyCredential(parsed.credential) ? parsed.credential : null;
    return {
      credential,
      hiddenBookHashes:
        credential && Array.isArray(parsed.hiddenBookHashes)
          ? [...new Set(parsed.hiddenBookHashes.filter((hash) => typeof hash === 'string'))]
          : [],
    };
  } catch {
    return emptyPersistedState();
  }
};

const persist = (state: PersistedPrivacyState) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const notifyPrivacyLock = (state: PrivacyState, hiddenBookHashes = state.hiddenBookHashes) => {
  if (state.hasPin && state.isUnlocked) {
    eventDispatcher.dispatchSync('privacy-lock-reader', { hiddenBookHashes });
  }
};

const lockCurrentWindow = () => {
  const state = usePrivacyStore.getState();
  notifyPrivacyLock(state);
  usePrivacyStore.setState({ isUnlocked: false });
};

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  ...emptyPersistedState(),
  isInitialized: false,
  hasPin: false,
  isUnlocked: false,
  setPin: async (pin) => {
    const credential = await createPrivacyCredential(pin);
    const hiddenBookHashes = get().hiddenBookHashes;
    persist({ credential, hiddenBookHashes });
    set({ credential, hasPin: true, isUnlocked: true });
  },
  changePin: async (currentPin, nextPin) => {
    const credential = get().credential;
    if (!credential || !(await verifyPrivacyPin(currentPin, credential))) return false;
    const nextCredential = await createPrivacyCredential(nextPin);
    const hiddenBookHashes = get().hiddenBookHashes;
    persist({ credential: nextCredential, hiddenBookHashes });
    set({ credential: nextCredential, hasPin: true, isUnlocked: true });
    return true;
  },
  removePin: async (pin) => {
    const credential = get().credential;
    if (!credential || !(await verifyPrivacyPin(pin, credential))) return false;
    const next = emptyPersistedState();
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    set({ ...next, hasPin: false, isUnlocked: false });
    return true;
  },
  unlock: async (pin) => {
    const credential = get().credential;
    if (!credential || !(await verifyPrivacyPin(pin, credential))) return false;
    set({ isUnlocked: true });
    return true;
  },
  lock: () => {
    lockCurrentWindow();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCK_SIGNAL_KEY, crypto.randomUUID());
    }
  },
  hideBook: (hash) => {
    const state = get();
    if (!state.hasPin || !state.isUnlocked || state.hiddenBookHashes.includes(hash)) return;
    const hiddenBookHashes = [...state.hiddenBookHashes, hash];
    persist({ credential: state.credential, hiddenBookHashes });
    set({ hiddenBookHashes });
  },
  unhideBook: (hash) => {
    const state = get();
    if (!state.isUnlocked) return;
    const hiddenBookHashes = state.hiddenBookHashes.filter((item) => item !== hash);
    persist({ credential: state.credential, hiddenBookHashes });
    set({ hiddenBookHashes });
  },
  isBookHidden: (hash) => get().hiddenBookHashes.includes(hash),
  canAccessBook: (hash) => get().isUnlocked || !get().hiddenBookHashes.includes(hash),
  hydrate: () => {
    const persisted = readPersistedState();
    notifyPrivacyLock(get(), persisted.hiddenBookHashes);
    set({ ...persisted, isInitialized: true, hasPin: !!persisted.credential, isUnlocked: false });
  },
}));

export const initializePrivacyStore = () => {
  usePrivacyStore.getState().hydrate();
  if (typeof window === 'undefined') return () => {};
  const handleStorage = (event: StorageEvent) => {
    if (event.key === LOCK_SIGNAL_KEY) {
      lockCurrentWindow();
    } else if (event.key === STORAGE_KEY || event.key === null) {
      usePrivacyStore.getState().hydrate();
    }
  };
  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') lockCurrentWindow();
  };
  window.addEventListener('storage', handleStorage);
  document.addEventListener('visibilitychange', handleVisibility);
  return () => {
    window.removeEventListener('storage', handleStorage);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
};
