import { create } from 'zustand';
import { BookSearchMatch, BookSearchResult } from '@/types/book';

type SearchStatus = 'searching' | 'completed' | 'terminated';

interface SearchNavState {
  searchTerm: string;
  searchResults: BookSearchResult[] | BookSearchMatch[] | null;
  searchResultIndex: number;
  searchProgress: number;
  searchError: string | null;
}

interface SidebarState {
  sideBarBookKey: string | null;
  sideBarWidth: string;
  isSideBarVisible: boolean;
  isSideBarPinned: boolean;
  isSearchBarVisible: boolean;
  searchNavStates: Record<string, SearchNavState>;
  searchStatuses: Record<string, SearchStatus>;
  getIsSideBarVisible: () => boolean;
  getSideBarWidth: () => string;
  setSideBarBookKey: (key: string) => void;
  setSideBarWidth: (width: string) => void;
  toggleSideBar: () => void;
  toggleSideBarPin: () => void;
  setSideBarVisible: (visible: boolean) => void;
  setSideBarPin: (pinned: boolean) => void;
  setSearchBarVisible: (visible: boolean) => void;
  getSearchNavState: (bookKey: string) => SearchNavState;
  setSearchTerm: (bookKey: string, term: string) => void;
  setSearchStatus: (bookKey: string, status: SearchStatus) => void;
  getSearchStatus: (bookKey: string) => SearchStatus | null;
  setSearchResults: (
    bookKey: string,
    results: BookSearchResult[] | BookSearchMatch[] | null,
  ) => void;
  setSearchResultIndex: (bookKey: string, index: number) => void;
  setSearchProgress: (bookKey: string, progress: number) => void;
  setSearchError: (bookKey: string, error: string | null) => void;
  clearSearch: (bookKey: string) => void;
}

const defaultSearchNavState: SearchNavState = {
  searchTerm: '',
  searchResults: null,
  searchResultIndex: 0,
  searchProgress: 1,
  searchError: null,
};

export const useSidebarStore = create<SidebarState>((set, get) => ({
  sideBarBookKey: null,
  sideBarWidth: '',
  isSideBarVisible: false,
  isSideBarPinned: false,
  isSearchBarVisible: false,
  searchNavStates: {},
  searchStatuses: {},
  getIsSideBarVisible: () => get().isSideBarVisible,
  getSideBarWidth: () => get().sideBarWidth,
  setSideBarBookKey: (key: string) => set({ sideBarBookKey: key }),
  setSideBarWidth: (width: string) => set({ sideBarWidth: width }),
  toggleSideBar: () => set((state) => ({ isSideBarVisible: !state.isSideBarVisible })),
  toggleSideBarPin: () => set((state) => ({ isSideBarPinned: !state.isSideBarPinned })),
  setSideBarVisible: (visible: boolean) => set({ isSideBarVisible: visible }),
  setSideBarPin: (pinned: boolean) => set({ isSideBarPinned: pinned }),
  setSearchBarVisible: (visible: boolean) => set({ isSearchBarVisible: visible }),
  getSearchStatus: (bookKey: string) => get().searchStatuses[bookKey] || null,
  getSearchNavState: (bookKey: string) => get().searchNavStates[bookKey] || defaultSearchNavState,
  setSearchTerm: (bookKey: string, term: string) =>
    set((state) => ({
      searchNavStates: {
        ...state.searchNavStates,
        [bookKey]: {
          ...(state.searchNavStates[bookKey] || defaultSearchNavState),
          searchTerm: term,
        },
      },
    })),
  setSearchResults: (bookKey: string, results: BookSearchResult[] | BookSearchMatch[] | null) =>
    set((state) => ({
      searchNavStates: {
        ...state.searchNavStates,
        [bookKey]: {
          ...(state.searchNavStates[bookKey] || defaultSearchNavState),
          searchResults: results,
        },
      },
    })),
  setSearchResultIndex: (bookKey: string, index: number) =>
    set((state) => ({
      searchNavStates: {
        ...state.searchNavStates,
        [bookKey]: {
          ...(state.searchNavStates[bookKey] || defaultSearchNavState),
          searchResultIndex: index,
        },
      },
    })),
  setSearchProgress: (bookKey: string, progress: number) =>
    set((state) => ({
      searchNavStates: {
        ...state.searchNavStates,
        [bookKey]: {
          ...(state.searchNavStates[bookKey] || defaultSearchNavState),
          searchProgress: progress,
        },
      },
    })),
  setSearchError: (bookKey: string, error: string | null) =>
    set((state) => ({
      searchNavStates: {
        ...state.searchNavStates,
        [bookKey]: {
          ...(state.searchNavStates[bookKey] || defaultSearchNavState),
          searchError: error,
        },
      },
    })),
  clearSearch: (bookKey: string) =>
    set((state) => ({
      searchNavStates: {
        ...state.searchNavStates,
        [bookKey]: { ...defaultSearchNavState },
      },
      searchStatuses: {
        ...state.searchStatuses,
        [bookKey]: 'terminated',
      },
    })),
  setSearchStatus: (bookKey: string, status: SearchStatus) =>
    set((state) => ({
      searchStatuses: {
        ...state.searchStatuses,
        [bookKey]: status,
      },
    })),
}));
