import { CustomTheme } from '@/styles/themes';
import { ViewSettings } from './book';

export type ThemeType = 'light' | 'dark' | 'auto';
export type TTSEngine = 'system' | 'piper' | 'melotts';
export type MeloTTSDevice = 'cpu' | 'gpu';

export interface ReadSettings {
  sideBarWidth: string;
  isSideBarPinned: boolean;
  customThemes: CustomTheme[];
}

export interface KeyBinding {
  /** `native` = media keys forwarded by the OS bridge; `dom` = keyboard/D-pad keys. */
  source: 'native' | 'dom';
  /** Native key name (e.g. `MediaNext`) or DOM `event.code` (e.g. `ArrowLeft`). */
  id: string;
  /** Human-readable label shown in settings. */
  label: string;
}

export interface HardwarePageTurnerSettings {
  enabled: boolean;
  bindings: {
    pagePrev: KeyBinding | null;
    pageNext: KeyBinding | null;
    sectionPrev: KeyBinding | null;
    sectionNext: KeyBinding | null;
    /** E-ink full screen refresh (clears ghosting). Optional: absent on settings persisted before the feature existed. */
    refresh?: KeyBinding | null;
  };
}

export interface SystemSettings {
  version: number;
  migrationVersion: number;
  localBooksDir: string;
  customRootDir?: string;
  keepLogin: boolean;
  screenWakeLock: boolean;
  autohideCursor: boolean;
  screenBrightness: number;
  autoScreenBrightness: boolean;
  swipeBrightnessGesture: boolean;
  ttsEngine: TTSEngine;
  ttsRate: number;
  ttsMeloDevice: MeloTTSDevice;
  hardwarePageTurner: HardwarePageTurnerSettings;
  alwaysShowStatusBar: boolean;
  lastSyncedAtBooks: number;
  lastSyncedAtConfigs: number;
  // Global read settings that apply to the reader page
  globalReadSettings: ReadSettings;
  // Global view settings that apply to all books, and can be overridden by book-specific view settings
  globalViewSettings: ViewSettings;
}
