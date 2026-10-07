import { useEffect, useMemo, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useBookDataStore, flushPendingLibrarySave } from '@/store/bookDataStore';
import { useBookProgress } from '@/store/readerProgressStore';
import { useSettingsStore } from '@/store/settingsStore';
import { debounce } from '@/utils/debounce';

export const useProgressAutoSave = (bookKey: string) => {
  const { envConfig } = useEnv();
  const environment = useRef(envConfig);
  environment.current = envConfig;
  const getConfig = useBookDataStore((s) => s.getConfig);
  const saveConfig = useBookDataStore((s) => s.saveConfig);
  const progress = useBookProgress(bookKey);

  const session = useMemo(() => {
    let initialized = false;
    let lastSavedLocation: string | null = null;
    let scheduledLocation: string | null = null;
    let pending = Promise.resolve();
    const initialize = () => {
      const config = getConfig(bookKey);
      if (!initialized && config) {
        initialized = true;
        lastSavedLocation = scheduledLocation = config.location ?? null;
      }
    };
    const save = () => {
      const config = getConfig(bookKey);
      if (!config) return pending;
      // The initial relocate must not bump updatedAt or overwrite newer
      // remote progress. Snapshot the disk location before progress events.
      if (!initialized) {
        initialize();
        return pending;
      }
      const location = config.location ?? null;
      if (location === scheduledLocation) return pending;
      scheduledLocation = location;
      const snapshot = { ...config };
      const currentEnvironment = environment.current;
      const settings = useSettingsStore.getState().settings;
      pending = pending
        .then(async () => {
          await saveConfig(currentEnvironment, bookKey, snapshot, settings);
          lastSavedLocation = location;
        })
        .catch((error) => {
          if (scheduledLocation === location) scheduledLocation = lastSavedLocation;
          console.warn('Failed to save reading progress', error);
        });
      return pending;
    };
    const schedule = debounce(() => {
      void save();
    }, 1500);
    return { initialize, save, schedule };
  }, [bookKey, getConfig, saveConfig]);

  useEffect(() => {
    session.initialize();
    return () => {
      session.schedule.cancel();
      // Capture the final config before reader teardown clears the store.
      // Flush the shelf only after its per-book save has finished.
      void session
        .save()
        .then(flushPendingLibrarySave)
        .catch((error) => {
          console.warn('Failed to flush reading progress', error);
        });
    };
  }, [session]);

  useEffect(() => {
    session.schedule();
  }, [progress, session]);
};
