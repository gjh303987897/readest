import { SystemSettings } from './settings';
import { Book, BookConfig, BookContent, ImportBookOptions, ViewSettings } from './book';
import type { BookNav } from '@/services/nav';
import { ProgressHandler } from '@/utils/transfer';
import { DatabaseOpts, DatabaseService } from './database';
import { SchemaType } from '@/services/database/migrate';

export type AppPlatform = 'web' | 'tauri' | 'node';
export type OsPlatform = 'android' | 'ios' | 'macos' | 'windows' | 'linux' | 'unknown';
// biome-ignore format: keep the union members compact on a single line
export type BaseDir = 'Books' | 'Settings' | 'Data' | 'Log' | 'Cache' | 'Temp' | 'None';
export type DeleteAction = 'cloud' | 'local' | 'both' | 'purge';
export type SelectDirectoryMode = 'read' | 'write';

export type ResolvedPath = {
  baseDir: number;
  basePrefix: () => Promise<string>;
  fp: string;
  base: BaseDir;
};

export type FileItem = {
  path: string;
  size: number;
};

export type FileInfo = {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: Date | null;
  atime: Date | null;
  birthtime: Date | null;
};

export type NativeTouchEventType = {
  type: 'touchstart' | 'touchmove' | 'touchcancel' | 'touchend';
  pointerId: number;
  x: number;
  y: number;
  pressure: number;
  pointerCount: number;
  timestamp: number;
};

export interface FileSystem {
  resolvePath(path: string, base: BaseDir): ResolvedPath;
  getURL(path: string): string;
  getBlobURL(path: string, base: BaseDir): Promise<string>;
  openFile(path: string, base: BaseDir, filename?: string): Promise<File>;
  copyFile(srcPath: string, srcBase: BaseDir, dstPath: string, dstBase: BaseDir): Promise<void>;
  readFile(path: string, base: BaseDir, mode: 'text' | 'binary'): Promise<string | ArrayBuffer>;
  writeFile(path: string, base: BaseDir, content: string | ArrayBuffer | File): Promise<void>;
  removeFile(path: string, base: BaseDir): Promise<void>;
  readDir(path: string, base: BaseDir): Promise<FileItem[]>;
  createDir(path: string, base: BaseDir, recursive?: boolean): Promise<void>;
  removeDir(path: string, base: BaseDir, recursive?: boolean): Promise<void>;
  exists(path: string, base: BaseDir): Promise<boolean>;
  stats(path: string, base: BaseDir): Promise<FileInfo>;
  getPrefix(base: BaseDir): Promise<string>;
}

export interface SaveLibraryBooksOptions {
  /**
   * Overwrite `library.json` with exactly the given set, allowing it to shrink.
   * Reserved for deliberate, authoritative rewrites (tombstone GC, explicit
   * "clear library", account reset). Routine saves must NOT set this — the
   * default merge-floor protects against silently dropping books on disk.
   */
  replace?: boolean;
}

export interface AppService {
  osPlatform: OsPlatform;
  appPlatform: AppPlatform;
  hasTrafficLight: boolean;
  hasWindow: boolean;
  hasWindowBar: boolean;
  hasContextMenu: boolean;
  hasRoundedWindow: boolean;
  hasSafeAreaInset: boolean;
  hasHaptics: boolean;
  hasOrientationLock: boolean;
  hasScreenBrightness: boolean;
  /** True when a hardware ambient light sensor can drive Ambient Mode. */
  hasAmbientLightSensor: boolean;
  isMobile: boolean;
  isAppDataSandbox: boolean;
  isMobileApp: boolean;
  isAndroidApp: boolean;
  isIOSApp: boolean;
  isMacOSApp: boolean;
  isLinuxApp: boolean;
  isWindowsApp: boolean;
  isPortableApp: boolean;
  isDesktopApp: boolean;
  isEink: boolean;
  canCustomizeRootDir: boolean;
  canReadExternalDir: boolean;
  supportsCanvasContext2DFilter: boolean;
  supportsViewTransitionsAPI: boolean;
  supportsViewTransitionGroup: boolean;

  init(): Promise<void>;
  openFile(path: string, base: BaseDir): Promise<File>;
  copyFile(srcPath: string, srcBase: BaseDir, dstPath: string, dstBase: BaseDir): Promise<void>;
  readFile(path: string, base: BaseDir, mode: 'text' | 'binary'): Promise<string | ArrayBuffer>;
  writeFile(path: string, base: BaseDir, content: string | ArrayBuffer | File): Promise<void>;
  createDir(path: string, base: BaseDir, recursive?: boolean): Promise<void>;
  deleteFile(path: string, base: BaseDir): Promise<void>;
  deleteDir(path: string, base: BaseDir, recursive?: boolean): Promise<void>;
  exists(path: string, base: BaseDir): Promise<boolean>;
  isDirectory(path: string, base: BaseDir): Promise<boolean>;

  setCustomRootDir(customRootDir: string): Promise<void>;
  resolveFilePath(path: string, base: BaseDir): Promise<string>;
  selectDirectory(mode: SelectDirectoryMode): Promise<string>;
  selectFiles(name: string, extensions: string[]): Promise<string[]>;
  readDirectory(path: string, base: BaseDir): Promise<FileItem[]>;
  /**
   * Best-effort: extend the Tauri `fs_scope` and `asset_protocol_scope`
   * to cover the given paths. No-op on web. Used after a directory or
   * file path is recovered from somewhere other than the native picker
   * (e.g. localStorage of the last-used import folder), since the
   * dialog plugin only auto-allows `fs_scope` for paths it returned in
   * the current session.
   */
  allowPathsInScopes?(paths: string[], isDirectory: boolean): Promise<void>;
  getDefaultViewSettings(): ViewSettings;
  loadSettings(): Promise<SystemSettings>;
  saveSettings(settings: SystemSettings): Promise<void>;
  importBook(file: string | File, books: Book[], options?: ImportBookOptions): Promise<Book | null>;
  deleteBook(book: Book, deleteAction: DeleteAction): Promise<void>;
  uploadBook(book: Book, onProgress?: ProgressHandler): Promise<void>;
  downloadBook(
    book: Book,
    onlyCover?: boolean,
    redownload?: boolean,
    onProgress?: ProgressHandler,
  ): Promise<void>;
  downloadBookCovers(books: Book[], redownload?: boolean): Promise<void>;
  isBookAvailable(book: Book): Promise<boolean>;
  getBookFileSize(book: Book): Promise<number | null>;
  loadBookConfig(book: Book, settings: SystemSettings): Promise<BookConfig>;
  saveBookConfig(book: Book, config: BookConfig, settings?: SystemSettings): Promise<void>;
  loadBookNav(book: Book): Promise<BookNav | null>;
  saveBookNav(book: Book, nav: BookNav): Promise<void>;
  loadBookContent(book: Book): Promise<BookContent>;
  resolveNativeBookFilePath(book: Book): Promise<string | null>;
  loadLibraryBooks(): Promise<Book[]>;
  saveLibraryBooks(books: Book[], options?: SaveLibraryBooksOptions): Promise<void>;
  getCoverImageUrl(book: Book): string;
  getCoverImageBlobUrl(book: Book): Promise<string>;
  generateCoverImageUrl(book: Book): Promise<string>;
  ask(message: string): Promise<boolean>;
  openDatabase(
    schema: SchemaType,
    path: string,
    base: BaseDir,
    opts?: DatabaseOpts,
  ): Promise<DatabaseService>;
  databaseExists(path: string, base: BaseDir): Promise<boolean>;
  deleteDatabase(path: string, base: BaseDir): Promise<void>;
}
