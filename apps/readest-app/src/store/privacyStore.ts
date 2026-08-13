import { create } from 'zustand';

import {
  createPrivacyCredential,
  createUnlockedPrivacyEnvelope,
  decryptPrivacyEnvelopeWithKey,
  type EncryptedPrivacyEnvelope,
  encryptPrivacyPayload,
  isEncryptedPrivacyEnvelope,
  isPrivacyCredential,
  type PrivacyCredential,
  unlockPrivacyEnvelope,
  verifyPrivacyPin,
} from '@/services/privacyService';
import { eventDispatcher } from '@/utils/event';

const STORAGE_KEY = 'readest-privacy-mode-v1';
const LOCK_SIGNAL_KEY = 'readest-privacy-lock-signal';

export interface PrivacyCloudRecord {
  envelope: EncryptedPrivacyEnvelope | null;
  updatedAt: number;
}

interface PersistedPrivacyState {
  syncUserId: string | null;
  credential: PrivacyCredential | null;
  hiddenBookHashes: string[];
  updatedAt: number;
  encryptedEnvelope: EncryptedPrivacyEnvelope | null;
  pendingCloudRecord: PrivacyCloudRecord | null;
}

interface PrivacyState extends PersistedPrivacyState {
  isInitialized: boolean;
  hasPin: boolean;
  isUnlocked: boolean;
  isCloudUnlockRequired: boolean;
  encryptionKey: CryptoKey | null;
  setPin: (pin: string) => Promise<void>;
  changePin: (currentPin: string, nextPin: string) => Promise<boolean>;
  removePin: (pin: string) => Promise<boolean>;
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  hideBook: (hash: string) => Promise<void>;
  unhideBook: (hash: string) => Promise<void>;
  isBookHidden: (hash: string) => boolean;
  canAccessBook: (hash: string) => boolean;
  getCloudRecord: () => PrivacyCloudRecord | null;
  prepareSyncForUser: (userId: string) => void;
  applyCloudRecord: (record: PrivacyCloudRecord) => Promise<void>;
  hydrate: () => void;
}

const emptyPersistedState = (): PersistedPrivacyState => ({
  syncUserId: null,
  credential: null,
  hiddenBookHashes: [],
  updatedAt: 0,
  encryptedEnvelope: null,
  pendingCloudRecord: null,
});

const isPrivacyCloudRecord = (value: unknown): value is PrivacyCloudRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PrivacyCloudRecord>;
  return (
    typeof record.updatedAt === 'number' &&
    Number.isFinite(record.updatedAt) &&
    record.updatedAt > 0 &&
    (record.envelope === null || isEncryptedPrivacyEnvelope(record.envelope))
  );
};

const readPersistedState = (): PersistedPrivacyState => {
  if (typeof localStorage === 'undefined') return emptyPersistedState();
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '',
    ) as Partial<PersistedPrivacyState>;
    const credential = isPrivacyCredential(parsed.credential) ? parsed.credential : null;
    return {
      syncUserId: typeof parsed.syncUserId === 'string' ? parsed.syncUserId : null,
      credential,
      hiddenBookHashes:
        credential && Array.isArray(parsed.hiddenBookHashes)
          ? [
              ...new Set(
                parsed.hiddenBookHashes.filter(
                  (hash): hash is string => typeof hash === 'string' && hash.length > 0,
                ),
              ),
            ]
          : [],
      updatedAt:
        typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : 0,
      encryptedEnvelope: isEncryptedPrivacyEnvelope(parsed.encryptedEnvelope)
        ? parsed.encryptedEnvelope
        : null,
      pendingCloudRecord: isPrivacyCloudRecord(parsed.pendingCloudRecord)
        ? parsed.pendingCloudRecord
        : null,
    };
  } catch {
    return emptyPersistedState();
  }
};

const persistedFields = (state: PrivacyState): PersistedPrivacyState => ({
  syncUserId: state.syncUserId,
  credential: state.credential,
  hiddenBookHashes: state.hiddenBookHashes,
  updatedAt: state.updatedAt,
  encryptedEnvelope: state.encryptedEnvelope,
  pendingCloudRecord: state.pendingCloudRecord,
});

const persist = (state: PersistedPrivacyState) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const nextUpdatedAt = (previous: number) => Math.max(Date.now(), previous + 1);

const notifyPrivacyLock = (
  state: PrivacyState,
  hiddenBookHashes = state.hiddenBookHashes,
  blockAll = false,
) => {
  if (blockAll || (state.hasPin && state.isUnlocked)) {
    eventDispatcher.dispatchSync('privacy-lock-reader', { hiddenBookHashes, blockAll });
  }
};

const lockCurrentWindow = () => {
  const state = usePrivacyStore.getState();
  notifyPrivacyLock(state);
  usePrivacyStore.setState({ isUnlocked: false, encryptionKey: null });
};

const promoteCloudRecord = async (
  record: PrivacyCloudRecord,
  key: CryptoKey,
  keepUnlocked: boolean,
) => {
  if (!record.envelope) return;
  const payload = await decryptPrivacyEnvelopeWithKey(record.envelope, key);
  const next: PersistedPrivacyState = {
    syncUserId: usePrivacyStore.getState().syncUserId,
    credential: payload.credential,
    hiddenBookHashes: payload.hiddenBookHashes,
    updatedAt: record.updatedAt,
    encryptedEnvelope: record.envelope,
    pendingCloudRecord: null,
  };
  persist(next);
  usePrivacyStore.setState({
    ...next,
    hasPin: true,
    isUnlocked: keepUnlocked,
    isCloudUnlockRequired: false,
    encryptionKey: keepUnlocked ? key : null,
  });
};

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  ...emptyPersistedState(),
  isInitialized: false,
  hasPin: false,
  isUnlocked: false,
  isCloudUnlockRequired: false,
  encryptionKey: null,
  setPin: async (pin) => {
    const credential = await createPrivacyCredential(pin);
    const hiddenBookHashes = get().hiddenBookHashes;
    const { envelope, key } = await createUnlockedPrivacyEnvelope(pin, {
      credential,
      hiddenBookHashes,
    });
    const next: PersistedPrivacyState = {
      syncUserId: get().syncUserId,
      credential,
      hiddenBookHashes,
      updatedAt: nextUpdatedAt(get().updatedAt),
      encryptedEnvelope: envelope,
      pendingCloudRecord: null,
    };
    persist(next);
    set({
      ...next,
      hasPin: true,
      isUnlocked: true,
      isCloudUnlockRequired: false,
      encryptionKey: key,
    });
  },
  changePin: async (currentPin, nextPin) => {
    const state = get();
    if (!state.credential || !(await verifyPrivacyPin(currentPin, state.credential))) return false;
    const credential = await createPrivacyCredential(nextPin);
    const { envelope, key } = await createUnlockedPrivacyEnvelope(nextPin, {
      credential,
      hiddenBookHashes: state.hiddenBookHashes,
    });
    const next: PersistedPrivacyState = {
      syncUserId: state.syncUserId,
      credential,
      hiddenBookHashes: state.hiddenBookHashes,
      updatedAt: nextUpdatedAt(state.updatedAt),
      encryptedEnvelope: envelope,
      pendingCloudRecord: null,
    };
    persist(next);
    set({
      ...next,
      hasPin: true,
      isUnlocked: true,
      isCloudUnlockRequired: false,
      encryptionKey: key,
    });
    return true;
  },
  removePin: async (pin) => {
    const state = get();
    if (!state.credential || !(await verifyPrivacyPin(pin, state.credential))) return false;
    const next: PersistedPrivacyState = {
      ...emptyPersistedState(),
      syncUserId: state.syncUserId,
      updatedAt: nextUpdatedAt(state.updatedAt),
    };
    persist(next);
    set({
      ...next,
      hasPin: false,
      isUnlocked: false,
      isCloudUnlockRequired: false,
      encryptionKey: null,
    });
    return true;
  },
  unlock: async (pin) => {
    const state = get();
    try {
      if (state.pendingCloudRecord?.envelope) {
        const { payload, key } = await unlockPrivacyEnvelope(
          pin,
          state.pendingCloudRecord.envelope,
        );
        const next: PersistedPrivacyState = {
          syncUserId: state.syncUserId,
          credential: payload.credential,
          hiddenBookHashes: payload.hiddenBookHashes,
          updatedAt: state.pendingCloudRecord.updatedAt,
          encryptedEnvelope: state.pendingCloudRecord.envelope,
          pendingCloudRecord: null,
        };
        persist(next);
        set({
          ...next,
          hasPin: true,
          isUnlocked: true,
          isCloudUnlockRequired: false,
          encryptionKey: key,
        });
        return true;
      }

      if (!state.credential || !(await verifyPrivacyPin(pin, state.credential))) return false;
      if (state.encryptedEnvelope) {
        const { key } = await unlockPrivacyEnvelope(pin, state.encryptedEnvelope);
        set({ isUnlocked: true, encryptionKey: key });
        return true;
      }

      const { envelope, key } = await createUnlockedPrivacyEnvelope(pin, {
        credential: state.credential,
        hiddenBookHashes: state.hiddenBookHashes,
      });
      const next = {
        ...persistedFields(state),
        updatedAt: nextUpdatedAt(state.updatedAt),
        encryptedEnvelope: envelope,
      };
      persist(next);
      set({ ...next, isUnlocked: true, encryptionKey: key });
      return true;
    } catch {
      return false;
    }
  },
  lock: () => {
    lockCurrentWindow();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCK_SIGNAL_KEY, crypto.randomUUID());
    }
  },
  hideBook: async (hash) => {
    const state = get();
    if (
      !state.hasPin ||
      !state.isUnlocked ||
      !state.credential ||
      !state.encryptionKey ||
      !state.encryptedEnvelope ||
      state.hiddenBookHashes.includes(hash)
    ) {
      return;
    }
    const hiddenBookHashes = [...state.hiddenBookHashes, hash];
    const envelope = await encryptPrivacyPayload(
      { credential: state.credential, hiddenBookHashes },
      state.encryptionKey,
      state.encryptedEnvelope.kdf,
    );
    const next = {
      ...persistedFields(state),
      hiddenBookHashes,
      updatedAt: nextUpdatedAt(state.updatedAt),
      encryptedEnvelope: envelope,
    };
    persist(next);
    set(next);
  },
  unhideBook: async (hash) => {
    const state = get();
    if (
      !state.isUnlocked ||
      !state.credential ||
      !state.encryptionKey ||
      !state.encryptedEnvelope
    ) {
      return;
    }
    const hiddenBookHashes = state.hiddenBookHashes.filter((item) => item !== hash);
    if (hiddenBookHashes.length === state.hiddenBookHashes.length) return;
    const envelope = await encryptPrivacyPayload(
      { credential: state.credential, hiddenBookHashes },
      state.encryptionKey,
      state.encryptedEnvelope.kdf,
    );
    const next = {
      ...persistedFields(state),
      hiddenBookHashes,
      updatedAt: nextUpdatedAt(state.updatedAt),
      encryptedEnvelope: envelope,
    };
    persist(next);
    set(next);
  },
  isBookHidden: (hash) => get().hiddenBookHashes.includes(hash),
  canAccessBook: (hash) =>
    !get().isCloudUnlockRequired && (get().isUnlocked || !get().hiddenBookHashes.includes(hash)),
  getCloudRecord: () => {
    const state = get();
    if (state.pendingCloudRecord || state.updatedAt <= 0) return null;
    if (state.credential && !state.encryptedEnvelope) return null;
    return { envelope: state.encryptedEnvelope, updatedAt: state.updatedAt };
  },
  prepareSyncForUser: (userId) => {
    const state = get();
    if (!userId || state.syncUserId === userId) return;
    if (!state.syncUserId) {
      const next = { ...persistedFields(state), syncUserId: userId };
      persist(next);
      set({ syncUserId: userId });
      return;
    }

    notifyPrivacyLock(state, state.hiddenBookHashes, true);
    const next: PersistedPrivacyState = { ...emptyPersistedState(), syncUserId: userId };
    persist(next);
    set({
      ...next,
      hasPin: false,
      isUnlocked: false,
      isCloudUnlockRequired: false,
      encryptionKey: null,
    });
  },
  applyCloudRecord: async (record) => {
    if (!isPrivacyCloudRecord(record)) return;
    const state = get();
    const currentUpdatedAt = Math.max(state.updatedAt, state.pendingCloudRecord?.updatedAt ?? 0);
    if (record.updatedAt <= currentUpdatedAt) return;

    if (!record.envelope) {
      notifyPrivacyLock(state);
      const next: PersistedPrivacyState = {
        ...emptyPersistedState(),
        syncUserId: state.syncUserId,
        updatedAt: record.updatedAt,
      };
      persist(next);
      set({
        ...next,
        hasPin: false,
        isUnlocked: false,
        isCloudUnlockRequired: false,
        encryptionKey: null,
      });
      return;
    }

    if (state.isUnlocked && state.encryptionKey) {
      try {
        await promoteCloudRecord(record, state.encryptionKey, true);
        return;
      } catch {
        // A PIN change creates a new encryption key and requires explicit unlock.
      }
    }

    notifyPrivacyLock(state, state.hiddenBookHashes, true);
    const pendingState = { ...persistedFields(state), pendingCloudRecord: record };
    persist(pendingState);
    set({
      pendingCloudRecord: record,
      isUnlocked: false,
      isCloudUnlockRequired: true,
      hasPin: true,
      encryptionKey: null,
    });
  },
  hydrate: () => {
    const persisted = readPersistedState();
    notifyPrivacyLock(get(), persisted.hiddenBookHashes);
    set({
      ...persisted,
      isInitialized: true,
      hasPin: !!persisted.credential || !!persisted.pendingCloudRecord?.envelope,
      isUnlocked: false,
      isCloudUnlockRequired: !!persisted.pendingCloudRecord?.envelope,
      encryptionKey: null,
    });
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
