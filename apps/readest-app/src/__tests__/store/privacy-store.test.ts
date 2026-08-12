import { beforeEach, describe, expect, it } from 'vitest';

import { usePrivacyStore } from '@/store/privacyStore';

describe('privacyStore', () => {
  beforeEach(() => {
    localStorage.clear();
    usePrivacyStore.setState({
      credential: null,
      hiddenBookHashes: [],
      isInitialized: true,
      hasPin: false,
      isUnlocked: false,
    });
  });

  it('requires a valid PIN before exposing hidden book hashes', async () => {
    await usePrivacyStore.getState().setPin('1234');
    usePrivacyStore.getState().hideBook('private');
    usePrivacyStore.getState().lock();

    expect(usePrivacyStore.getState().canAccessBook('private')).toBe(false);
    await expect(usePrivacyStore.getState().unlock('0000')).resolves.toBe(false);
    expect(usePrivacyStore.getState().canAccessBook('private')).toBe(false);
    await expect(usePrivacyStore.getState().unlock('1234')).resolves.toBe(true);
    expect(usePrivacyStore.getState().canAccessBook('private')).toBe(true);
  });

  it('removing the PIN also clears hidden books', async () => {
    await usePrivacyStore.getState().setPin('1234');
    usePrivacyStore.getState().hideBook('private');

    await expect(usePrivacyStore.getState().removePin('1234')).resolves.toBe(true);
    expect(usePrivacyStore.getState().hasPin).toBe(false);
    expect(usePrivacyStore.getState().hiddenBookHashes).toEqual([]);
  });

  it('does not change hidden books while locked', async () => {
    await usePrivacyStore.getState().setPin('1234');
    usePrivacyStore.getState().hideBook('private');
    usePrivacyStore.getState().lock();

    usePrivacyStore.getState().hideBook('other');
    usePrivacyStore.getState().unhideBook('private');

    expect(usePrivacyStore.getState().hiddenBookHashes).toEqual(['private']);
  });
});
