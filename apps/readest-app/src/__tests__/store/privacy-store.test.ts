import { beforeEach, describe, expect, it } from 'vitest';

import { usePrivacyStore } from '@/store/privacyStore';

describe('privacyStore', () => {
  beforeEach(() => {
    localStorage.clear();
    usePrivacyStore.setState({
      credential: null,
      syncUserId: null,
      hiddenBookHashes: [],
      isInitialized: true,
      hasPin: false,
      isUnlocked: false,
    });
  });

  it('requires a valid PIN before exposing hidden book hashes', async () => {
    await usePrivacyStore.getState().setPin('1234');
    await usePrivacyStore.getState().hideBook('private');
    usePrivacyStore.getState().lock();

    expect(usePrivacyStore.getState().canAccessBook('private')).toBe(false);
    await expect(usePrivacyStore.getState().unlock('0000')).resolves.toBe(false);
    expect(usePrivacyStore.getState().canAccessBook('private')).toBe(false);
    await expect(usePrivacyStore.getState().unlock('1234')).resolves.toBe(true);
    expect(usePrivacyStore.getState().canAccessBook('private')).toBe(true);
  });

  it('removing the PIN also clears hidden books', async () => {
    await usePrivacyStore.getState().setPin('1234');
    await usePrivacyStore.getState().hideBook('private');

    await expect(usePrivacyStore.getState().removePin('1234')).resolves.toBe(true);
    expect(usePrivacyStore.getState().hasPin).toBe(false);
    expect(usePrivacyStore.getState().hiddenBookHashes).toEqual([]);
  });

  it('does not change hidden books while locked', async () => {
    await usePrivacyStore.getState().setPin('1234');
    await usePrivacyStore.getState().hideBook('private');
    usePrivacyStore.getState().lock();

    await usePrivacyStore.getState().hideBook('other');
    await usePrivacyStore.getState().unhideBook('private');

    expect(usePrivacyStore.getState().hiddenBookHashes).toEqual(['private']);
  });

  it('blocks access until a newer encrypted cloud state is unlocked', async () => {
    await usePrivacyStore.getState().setPin('1234');
    await usePrivacyStore.getState().hideBook('private');
    const cloudRecord = usePrivacyStore.getState().getCloudRecord();
    expect(cloudRecord?.envelope).not.toBeNull();

    localStorage.clear();
    usePrivacyStore.setState({
      credential: null,
      hiddenBookHashes: [],
      updatedAt: 0,
      encryptedEnvelope: null,
      pendingCloudRecord: null,
      isInitialized: true,
      hasPin: false,
      isUnlocked: false,
      encryptionKey: null,
    });

    usePrivacyStore.getState().applyCloudRecord(cloudRecord!);
    expect(usePrivacyStore.getState().isCloudUnlockRequired).toBe(true);
    expect(usePrivacyStore.getState().canAccessBook('public')).toBe(false);
    await expect(usePrivacyStore.getState().unlock('0000')).resolves.toBe(false);
    await expect(usePrivacyStore.getState().unlock('1234')).resolves.toBe(true);
    expect(usePrivacyStore.getState().hiddenBookHashes).toEqual(['private']);
  });

  it('does not carry one account privacy record into another account', async () => {
    usePrivacyStore.getState().prepareSyncForUser('user-a');
    await usePrivacyStore.getState().setPin('1234');
    await usePrivacyStore.getState().hideBook('private');

    usePrivacyStore.getState().prepareSyncForUser('user-b');

    expect(usePrivacyStore.getState().syncUserId).toBe('user-b');
    expect(usePrivacyStore.getState().hasPin).toBe(false);
    expect(usePrivacyStore.getState().hiddenBookHashes).toEqual([]);
    expect(usePrivacyStore.getState().getCloudRecord()).toBeNull();
  });
});
