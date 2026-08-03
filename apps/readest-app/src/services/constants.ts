import {
  BookFont,
  BookLanguage,
  BookLayout,
  BookSearchConfig,
  BookStyle,
  ScreenConfig,
  ViewConfig,
  ViewSettings,
  ViewSettingsConfig,
} from '@/types/book';
import { ReadSettings, SystemSettings } from '@/types/settings';
import { UserStorageQuota } from '@/types/quota';
import { getDefaultMaxBlockSize, getDefaultMaxInlineSize } from '@/utils/config';
import { stubTranslation as _ } from '@/utils/misc';

export const DATA_SUBDIR = 'Readest';
export const LOCAL_BOOKS_SUBDIR = `${DATA_SUBDIR}/Books`;
export const CLOUD_BOOKS_SUBDIR = `${DATA_SUBDIR}/Books`;

export const SETTINGS_FILENAME = 'settings.json';

export const SUPPORTED_BOOK_EXTS = [
  'epub',
  'mobi',
  'azw',
  'azw3',
  'fb2',
  'fbz',
  'cbz',
  'pdf',
  'txt',
  'md',
];
export const BOOK_ACCEPT_FORMATS = SUPPORTED_BOOK_EXTS.map((ext) => `.${ext}`).join(', ');

export const DEFAULT_SYSTEM_SETTINGS: Partial<SystemSettings> = {
  keepLogin: false,
  alwaysShowStatusBar: false,
  screenWakeLock: false,
  autohideCursor: true,
  screenBrightness: -1, // -1~100, -1 for system default
  autoScreenBrightness: true,
  swipeBrightnessGesture: true,
  hardwarePageTurner: {
    enabled: false,
    bindings: {
      pagePrev: null,
      pageNext: null,
      sectionPrev: null,
      sectionNext: null,
      refresh: null,
    },
  },
  lastSyncedAtBooks: 0,
  lastSyncedAtConfigs: 0,
};

export const DEFAULT_MOBILE_SYSTEM_SETTINGS: Partial<SystemSettings> = {};

export const DEFAULT_READSETTINGS: ReadSettings = {
  sideBarWidth: '15%',
  isSideBarPinned: true,
  customThemes: [],
};

export const DEFAULT_MOBILE_READSETTINGS: Partial<ReadSettings> = {
  sideBarWidth: '25%',
  isSideBarPinned: false,
};

export const DEFAULT_BOOK_FONT: BookFont = {
  serifFont: 'Bitter',
  sansSerifFont: 'Roboto',
  monospaceFont: 'Consolas',
  defaultFont: 'Serif',
  defaultCJKFont: 'LXGW WenKai GB Screen',
  defaultFontSize: 16,
  minimumFontSize: 8,
  fontWeight: 400,
};

export const DEFAULT_BOOK_LAYOUT: BookLayout = {
  marginTopPx: 44,
  marginBottomPx: 44,
  marginLeftPx: 16,
  marginRightPx: 16,
  compactMarginTopPx: 16,
  compactMarginBottomPx: 16,
  compactMarginLeftPx: 16,
  compactMarginRightPx: 16,
  gapPercent: 5,
  scrolled: false,
  webtoonMode: false,
  noContinuousScroll: false,
  disableClick: false,
  disableSwipe: false,
  fullscreenClickArea: false,
  swapClickArea: false,
  disableDoubleClick: false,
  volumeKeysToFlip: false,
  maxColumnCount: 2,
  maxInlineSize: getDefaultMaxInlineSize(),
  maxBlockSize: getDefaultMaxBlockSize(),
  writingMode: 'auto',
  vertical: false,
  rtl: false,
  scrollingOverlap: 0,
  allowScript: false,
  hideScrollbar: false,
};

export const DEFAULT_BOOK_LANGUAGE: BookLanguage = {
  replaceQuotationMarks: true,
};

export const DEFAULT_BOOK_STYLE: BookStyle = {
  zoomLevel: 100,
  paragraphMargin: 0.6,
  lineHeight: 1.4,
  wordSpacing: 0,
  letterSpacing: 0,
  textIndent: 0,
  fullJustification: true,
  hyphenation: true,
  theme: 'light',
  userStylesheet: '',
  userUIStylesheet: '',

  overrideFont: false,
  overrideLayout: false,
  overrideColor: false,
  useBookLayout: false,

  zoomMode: 'fit-page',
  spreadMode: 'auto',
  keepCoverSpread: true,
  invertImgColorInDark: false,
  applyThemeToPDF: false,
  contrast: 100,
};

export const DEFAULT_MOBILE_VIEW_SETTINGS: Partial<ViewSettings> = {
  fullJustification: false,
  animated: true,
  defaultFont: 'Sans-serif',
  disableDoubleClick: true,
  spreadMode: 'none',
};

export const DEFAULT_CJK_VIEW_SETTINGS: Partial<ViewSettings> = {
  fullJustification: true,
  textIndent: 2,
  paragraphMargin: 1,
  lineHeight: 1.6,
};

export const DEFAULT_FIXED_LAYOUT_VIEW_SETTINGS: Partial<ViewSettings> = {
  overrideColor: false,
};

export const DEFAULT_EINK_VIEW_SETTINGS: Partial<ViewSettings> = {
  isEink: true,
  animated: false,
  volumeKeysToFlip: true,
};

export const DEFAULT_VIEW_CONFIG: ViewConfig = {
  uiLanguage: '',
  sortedTOC: false,

  doubleBorder: false,
  borderColor: 'red',

  showHeader: true,
  showFooter: true,
  showRemainingTime: false,
  showRemainingPages: false,
  showProgressInfo: true,
  showStickyProgressBar: false,
  showCurrentTime: false,
  showCurrentBatteryStatus: false,
  showBatteryPercentage: true,
  use24HourClock: false,
  showPaginationButtons: false,
  progressStyle: 'fraction',
  referencePageCount: 0,

  animated: false,
  pageTurnStyle: 'push',
  isEink: false,
  isColorEink: false,
};

export const DEFAULT_SCREEN_CONFIG: ScreenConfig = {
  screenOrientation: 'auto',
};

export const DEFAULT_BOOK_SEARCH_CONFIG: BookSearchConfig = {
  scope: 'book',
  mode: 'contains',
  matchCase: false,
  matchDiacritics: false,
  nearbyWords: 10,
  // kept for sync wire back-compat with pre-v3 clients (mirrors mode === 'whole-words')
  matchWholeWords: false,
};

export const DEFAULT_VIEW_SETTINGS_CONFIG: ViewSettingsConfig = {
  isGlobal: true,
};

export const SYSTEM_SETTINGS_VERSION = 1;

export const SERIF_FONTS = [
  'Bitter',
  'Literata',
  'Merriweather',
  'Roboto Slab',
  'Vollkorn',
  'PT Serif',
  'Georgia',
  'Times New Roman',
];

export const NON_FREE_FONTS = ['Georgia', 'Times New Roman'];

export const CJK_SERIF_FONTS = [
  _('LXGW WenKai GB Screen'),
  _('LXGW WenKai TC'),
  _('GuanKiapTsingKhai-T'),
  _('Source Han Serif CN'),
  _('Huiwen-MinchoGBK'),
  _('KingHwa_OldSong'),
];

export const CJK_SANS_SERIF_FONTS = ['Noto Sans SC', 'Noto Sans TC'];

export const SANS_SERIF_FONTS = ['Roboto', 'Noto Sans', 'Open Sans', 'PT Sans', 'Helvetica'];

export const MONOSPACE_FONTS = [
  'Fira Code',
  'Consolas',
  'Courier New',
  'Lucida Console',
  'PT Mono',
];

export const FALLBACK_FONTS = ['MiSans L3'];

export const WINDOWS_FONTS = [
  'Arial',
  'Arial Black',
  'Bahnschrift',
  'Calibri',
  'Cambria',
  'Cambria Math',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Ebrima',
  'FangSong',
  'Franklin Gothic Medium',
  'Gabriola',
  'Gadugi',
  'Georgia',
  'Heiti',
  'HoloLens MDL2 Assets',
  'Impact',
  'Ink Free',
  'Javanese Text',
  'KaiTi',
  'Leelawadee UI',
  'Lucida Console',
  'Lucida Sans Unicode',
  'LXGW WenKai GB Screen',
  'LXGW WenKai TC',
  'Malgun Gothic',
  'Marlett',
  'Microsoft Himalaya',
  'Microsoft JhengHei',
  'Microsoft New Tai Lue',
  'Microsoft PhagsPa',
  'Microsoft Sans Serif',
  'Microsoft Tai Le',
  'Microsoft YaHei',
  'Microsoft Yi Baiti',
  'MingLiU',
  'MingLiU-ExtB',
  'Mongolian Baiti',
  'MS Gothic',
  'MS Mincho',
  'MV Boli',
  'Myanmar Text',
  'Nirmala UI',
  'Noto Serif JP',
  'NSimSun',
  'Palatino Linotype',
  'PMingLiU',
  'Segoe MDL2 Assets',
  'Segoe Print',
  'Segoe Script',
  'Segoe UI',
  'Segoe UI Historic',
  'Segoe UI Emoji',
  'Segoe UI Symbol',
  'SimHei',
  'SimSun',
  'SimSun-ExtB',
  'Sitka',
  'Sylfaen',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'XiHeiti',
  'Yu Gothic',
  'Yu Mincho',
];

export const MACOS_FONTS = [
  'American Typewriter',
  'Andale Mono',
  'Arial',
  'Arial Black',
  'Arial Narrow',
  'Arial Rounded MT Bold',
  'Arial Unicode MS',
  'Avenir',
  'Avenir Next',
  'Avenir Next Condensed',
  'Baskerville',
  'BiauKai',
  'Big Caslon',
  'Bodoni 72',
  'Bodoni 72 Oldstyle',
  'Bodoni 72 Smallcaps',
  'Bradley Hand',
  'Brush Script MT',
  'Chalkboard',
  'Chalkboard SE',
  'Chalkduster',
  'Charter',
  'Cochin',
  'Comic Sans MS',
  'Copperplate',
  'Courier',
  'Courier New',
  'Didot',
  'DIN Alternate',
  'DIN Condensed',
  'FangSong',
  'Futura',
  'Geneva',
  'Georgia',
  'Gill Sans',
  'Heiti SC',
  'Heiti TC',
  'Helvetica',
  'Helvetica Neue',
  'Herculanum',
  'Hiragino Sans',
  'Hiragino Mincho',
  'Hoefler Text',
  'Impact',
  'Kaiti SC',
  'Kaiti TC',
  'Kozuka Gothic Pro',
  'Kozuka Mincho Pro',
  'Lucida Grande',
  'Luminari',
  'LXGW WenKai GB Screen',
  'LXGW WenKai TC',
  'Marker Felt',
  'Menlo',
  'Microsoft Sans Serif',
  'Monaco',
  'Noteworthy',
  'Noto Serif JP',
  'Optima',
  'Palatino',
  'Papyrus',
  'PingFang HK',
  'PingFang SC',
  'PingFang TC',
  'Phosphate',
  'Rockwell',
  'Savoye LET',
  'SignPainter',
  'Skia',
  'Snell Roundhand',
  'Songti SC',
  'Songti TC',
  'STFangsong',
  'STKaiti',
  'STSong',
  'STXihei',
  'Tahoma',
  'Times',
  'Times New Roman',
  'Trattatello',
  'Trebuchet MS',
  'Verdana',
  'XiHeiti',
  'Yu Mincho',
  'Zapfino',
];

export const LINUX_FONTS = [
  'Arial',
  'Cantarell',
  'Comic Sans MS',
  'Courier New',
  'DejaVu Sans',
  'DejaVu Sans Mono',
  'DejaVu Serif',
  'Droid Sans',
  'Droid Sans Mono',
  'FangSong',
  'FreeMono',
  'FreeSans',
  'FreeSerif',
  'Georgia',
  'Heiti',
  'Impact',
  'Kaiti',
  'Liberation Mono',
  'Liberation Sans',
  'Liberation Serif',
  'LXGW WenKai GB Screen',
  'LXGW WenKai TC',
  'Noto Mono',
  'Noto Sans',
  'Noto Sans JP',
  'Noto Sans CJK SC',
  'Noto Sans CJK TC',
  'Noto Serif',
  'Noto Serif JP',
  'Noto Serif CJK SC',
  'Noto Serif CJK TC',
  'Open Sans',
  'Poppins',
  'Sazanami Gothic',
  'Sazanami Mincho',
  'Source Han Sans',
  'Source Han Serif',
  'Times New Roman',
  'Ubuntu',
  'Ubuntu Mono',
  'WenQuanYi Micro Hei',
  'WenQuanYi Zen Hei',
  'XiHeiti',
];

export const IOS_FONTS = [
  'Avenir',
  'Avenir Next',
  'Courier',
  'Courier New',
  'FangSong',
  'Georgia',
  'Heiti',
  'Helvetica',
  'Helvetica Neue',
  'Hiragino Mincho',
  'Hiragino Sans',
  'Kaiti',
  'LXGW WenKai GB Screen',
  'LXGW WenKai TC',
  'Palatino',
  'PingFang SC',
  'PingFang TC',
  'San Francisco',
  'SF Pro Display',
  'SF Pro Rounded',
  'SF Pro Text',
  'Songti',
  'Times New Roman',
  'Verdana',
  'XiHeiti',
];

export const ANDROID_FONTS = [
  'Arial',
  'Droid Sans',
  'Droid Serif',
  'FangSong',
  'FZLanTingHei',
  'Georgia',
  'Heiti',
  'Kaiti',
  'LXGW WenKai GB Screen',
  'LXGW WenKai TC',
  'Noto Sans',
  'Noto Sans CJK',
  'Noto Sans JP',
  'Noto Serif',
  'Noto Serif CJK',
  'Noto Serif JP',
  'PingFang SC',
  'Roboto',
  'Source Han Sans',
  'Source Han Serif',
  'STHeiti',
  'STSong',
  'Tahoma',
  'Verdana',
  'XiHeiti',
];

export const CJK_EXCLUDE_PATTENS = new RegExp(
  ['AlBayan', 'STIX', 'Kailasa', 'ITCTT', 'Luminari', 'Myanmar'].join('|'),
  'i',
);
export const CJK_FONTS_PATTENS = new RegExp(
  [
    'CJK',
    'TC$',
    'SC$',
    'HK',
    'JP',
    'TW',
    'Sim',
    'Kai',
    'Hei',
    'Yan',
    'Min',
    'Khai',
    'Yuan',
    'Song',
    'Ming',
    'FZ',
    'Huiwen',
    'KingHwa',
    'FangZheng',
    'WenQuanYi',
    'PingFang',
    'Hiragino',
    'Meiryo',
    'Source\\s?Han',
    'Yu\\s?Gothic',
    'Yu\\s?Mincho',
    'Mincho',
    'Nanum',
    'Malgun',
    'Gulim',
    'Dotum',
    'Batang',
    'Gungsuh',
    'OPPO sans',
    'MiSans',
    'Fallback',
  ].join('|'),
  'i',
);

export const BOOK_IDS_SEPARATOR = '+';

export const READEST_WEB_BASE_URL = 'https://web.readest.com';
export const READEST_NODE_BASE_URL = 'https://node.readest.com';

export const SYNC_PROGRESS_INTERVAL_SEC = 3;
export const SYNC_BOOKS_INTERVAL_SEC = 5;

export const MAX_ZOOM_LEVEL = 500;
export const MIN_ZOOM_LEVEL = 50;
export const ZOOM_STEP = 10;

export const MAX_CONTRAST = 300;
export const MIN_CONTRAST = 50;
export const CONTRAST_STEP = 10;

export const DEFAULT_STORAGE_QUOTA: UserStorageQuota = {
  free: 500 * 1024 * 1024,
  plus: 5 * 1024 * 1024 * 1024,
  pro: 20 * 1024 * 1024 * 1024,
  purchase: 0,
};

export const DOUBLE_CLICK_INTERVAL_THRESHOLD_MS = 250;
export const DISABLE_DOUBLE_CLICK_ON_MOBILE = true;
export const LONG_HOLD_THRESHOLD = 500;

export const SIZE_PER_LOC = 1500;
export const SIZE_PER_TIME_UNIT = 1600;

export const CUSTOM_THEME_TEMPLATES = [
  {
    light: {
      fg: '#2b2b2b',
      bg: '#f3f3f3',
      primary: '#3c5a72',
    },
    dark: {
      fg: '#d0d0d0',
      bg: '#1a1c1f',
      primary: '#486e8a',
    },
  },
  {
    light: {
      fg: '#3f2f3c',
      bg: '#f5ecf8',
      primary: '#7b5291',
    },
    dark: {
      fg: '#d6cadd',
      bg: '#3a2c3d',
      primary: '#bda0cc',
    },
  },
  {
    light: {
      fg: '#2b2b2b',
      bg: '#defcd9',
      primary: '#00796b',
    },
    dark: {
      fg: '#c8e6c9',
      bg: '#273c33',
      primary: '#26a69a',
    },
  },
];

export const MIGHT_BE_RTL_LANGS = [
  'zh',
  'ja',
  'ko',
  'ar',
  'he',
  'fa',
  'ur',
  'dv',
  'ps',
  'sd',
  'yi',
  '',
];

export const TRANSLATED_LANGS = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  nl: 'Nederlands',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  pt: 'Português',
  'pt-BR': 'Português (Brasil)',
  ru: 'Русский',
  he: 'עברית',
  ar: 'العربية',
  fa: 'فارسی',
  el: 'Ελληνικά',
  uk: 'Українська',
  pl: 'Polski',
  sl: 'Slovenščina',
  tr: 'Türkçe',
  hi: 'हिन्दी',
  id: 'Indonesia',
  vi: 'Tiếng Việt',
  th: 'ภาษาไทย',
  ms: 'Melayu',
  bo: 'བོད་སྐད་',
  bn: 'বাংলা',
  ta: 'தமிழ்',
  si: 'සිංහල',
  'zh-CN': '简体中文',
  'zh-TW': '正體中文',
  ro: 'Română',
  hu: 'Magyar',
  uz: 'Oʻzbek',
};

export const SUPPORTED_LANGS: Record<string, string> = { ...TRANSLATED_LANGS, zh: '中文' };

export const SUPPORTED_LANGNAMES: Record<string, string> = Object.fromEntries(
  Object.entries(SUPPORTED_LANGS).map(([code, name]) => [name, code]),
);
