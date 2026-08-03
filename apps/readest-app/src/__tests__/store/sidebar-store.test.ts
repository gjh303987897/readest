import { beforeEach, describe, expect, it } from 'vitest';
import { useSidebarStore } from '@/store/sidebarStore';

describe('sidebarStore', () => {
  beforeEach(() => {
    useSidebarStore.setState({
      sideBarBookKey: null,
      sideBarWidth: '',
      isSideBarVisible: false,
      isSideBarPinned: false,
      isSearchBarVisible: false,
      searchNavStates: {},
      searchStatuses: {},
    });
  });

  it('controls the table-of-contents sidebar', () => {
    const state = useSidebarStore.getState();
    state.setSideBarBookKey('book-1');
    state.setSideBarWidth('320px');
    state.toggleSideBar();
    state.toggleSideBarPin();

    expect(useSidebarStore.getState()).toMatchObject({
      sideBarBookKey: 'book-1',
      sideBarWidth: '320px',
      isSideBarVisible: true,
      isSideBarPinned: true,
    });
    expect(useSidebarStore.getState().getIsSideBarVisible()).toBe(true);
    expect(useSidebarStore.getState().getSideBarWidth()).toBe('320px');
  });

  it('keeps search navigation state isolated per book', () => {
    const state = useSidebarStore.getState();
    state.setSearchTerm('book-1', 'alpha');
    state.setSearchResultIndex('book-1', 2);
    state.setSearchProgress('book-1', 0.5);
    state.setSearchError('book-1', 'invalid expression');
    state.setSearchStatus('book-1', 'searching');
    state.setSearchTerm('book-2', 'beta');

    expect(useSidebarStore.getState().getSearchNavState('book-1')).toMatchObject({
      searchTerm: 'alpha',
      searchResultIndex: 2,
      searchProgress: 0.5,
      searchError: 'invalid expression',
    });
    expect(useSidebarStore.getState().getSearchNavState('book-2').searchTerm).toBe('beta');
    expect(useSidebarStore.getState().getSearchStatus('book-1')).toBe('searching');
  });

  it('clears one book search without changing another', () => {
    const state = useSidebarStore.getState();
    state.setSearchTerm('book-1', 'alpha');
    state.setSearchTerm('book-2', 'beta');
    state.clearSearch('book-1');

    expect(useSidebarStore.getState().getSearchNavState('book-1').searchTerm).toBe('');
    expect(useSidebarStore.getState().getSearchStatus('book-1')).toBe('terminated');
    expect(useSidebarStore.getState().getSearchNavState('book-2').searchTerm).toBe('beta');
  });
});
