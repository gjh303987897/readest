import { create } from 'zustand';
import type { SavedOpdsLogin } from '@/services/opdsLoginService';
import type { OpdsNavigationLink } from '@/services/opdsService';

interface OpdsBrowserState {
  login: SavedOpdsLogin | null;
  path: OpdsNavigationLink[];
  select: (login: SavedOpdsLogin) => void;
  navigate: (path: OpdsNavigationLink[]) => void;
  leave: () => void;
}

export const useOpdsBrowserStore = create<OpdsBrowserState>((set) => ({
  login: null,
  path: [],
  select: (login) => set({ login, path: [] }),
  navigate: (path) => set({ path }),
  leave: () => set({ login: null, path: [] }),
}));
