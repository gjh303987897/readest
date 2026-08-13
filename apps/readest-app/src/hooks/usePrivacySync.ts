import { useEffect, useRef } from 'react';

import { useAuth } from '@/context/AuthContext';
import { pullPrivacySettings, pushPrivacySettings } from '@/libs/privacySync';
import { usePrivacyStore } from '@/store/privacyStore';

const SYNC_DEBOUNCE_MS = 500;

export const usePrivacySync = () => {
  const { user } = useAuth();
  const isInitialized = usePrivacyStore((state) => state.isInitialized);
  const syncing = useRef(false);
  const rerunRequested = useRef(false);

  useEffect(() => {
    if (!user || !isInitialized) return;
    let stopped = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const sync = async () => {
      if (stopped) return;
      if (syncing.current) {
        rerunRequested.current = true;
        return;
      }
      syncing.current = true;
      try {
        usePrivacyStore.getState().prepareSyncForUser(user.id);
        const remote = await pullPrivacySettings();
        if (remote) await usePrivacyStore.getState().applyCloudRecord(remote);

        const local = usePrivacyStore.getState().getCloudRecord();
        if (local && (!remote || local.updatedAt > remote.updatedAt)) {
          const authoritative = await pushPrivacySettings(local);
          if (authoritative) await usePrivacyStore.getState().applyCloudRecord(authoritative);
        }
      } catch (error) {
        console.warn('Failed to sync privacy settings', error);
      } finally {
        syncing.current = false;
        if (rerunRequested.current && !stopped) {
          rerunRequested.current = false;
          void sync();
        }
      }
    };

    const scheduleSync = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => void sync(), SYNC_DEBOUNCE_MS);
    };

    void sync();
    const unsubscribe = usePrivacyStore.subscribe((state, previous) => {
      if (
        state.updatedAt !== previous.updatedAt ||
        state.encryptedEnvelope !== previous.encryptedEnvelope
      ) {
        scheduleSync();
      }
    });
    window.addEventListener('online', scheduleSync);

    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
      window.removeEventListener('online', scheduleSync);
    };
  }, [user, isInitialized]);
};
