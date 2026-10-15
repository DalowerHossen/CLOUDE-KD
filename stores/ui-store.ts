// path: stores/ui-store.ts
import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
  shortcutsOpen: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  setMobileNavOpen: (value: boolean) => void;
  setCommandOpen: (value: boolean) => void;
  setShortcutsOpen: (value: boolean) => void;
}

const STORAGE_KEY = 'kd.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: readCollapsed(),
  mobileNavOpen: false,
  commandOpen: false,
  shortcutsOpen: false,
  setSidebarCollapsed: (value) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // Storage can be blocked; the preference then lasts for this page view only.
    }
    set({ sidebarCollapsed: value });
  },
  setMobileNavOpen: (value) => set({ mobileNavOpen: value }),
  setCommandOpen: (value) => set({ commandOpen: value }),
  setShortcutsOpen: (value) => set({ shortcutsOpen: value }),
}));
