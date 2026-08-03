import { invoke } from '@tauri-apps/api/core';

export interface CopyURIRequest {
  uri: string;
  dst: string;
}

export interface CopyURIResponse {
  success: boolean;
  error?: string;
}

export interface SetSystemUIVisibilityRequest {
  visible: boolean;
  darkMode: boolean;
}

export interface SetSystemUIVisibilityResponse {
  success: boolean;
  error?: string;
}

export interface GetStatusBarHeightResponse {
  height: number;
  error?: string;
}

export interface GetSystemFontsListResponse {
  fonts: Record<string, string>; // { fontName: fontFamily }
  error?: string;
}

export interface InterceptKeysRequest {
  volumeKeys?: boolean;
  backKey?: boolean;
  /** Intercept media keys (next/previous/play-pause) for the hardware page turner. */
  pageTurnerKeys?: boolean;
  /** Forward every key press to JS so the settings UI can capture a binding. */
  learnMode?: boolean;
}

export interface LockScreenRequest {
  orientation: 'portrait' | 'landscape' | 'auto';
}

export interface GetSystemColorSchemeResponse {
  colorScheme: 'light' | 'dark';
  error?: string;
}

export interface GetSafeAreaInsetsResponse {
  top: number;
  right: number;
  bottom: number;
  left: number;
  error?: string;
}

interface GetScreenBrightnessResponse {
  brightness: number; // 0.0 to 1.0
  error?: string;
}

interface SetScreenBrightnessRequest {
  brightness: number; // 0.0 to 1.0
}

interface SetScreenBrightnessResponse {
  success: boolean;
  error?: string;
}

interface SelectDirectoryResponse {
  cancelled?: boolean;
  uri?: string;
  path?: string;
  error?: string;
}

export interface RefreshEinkScreenResponse {
  success: boolean;
  error?: string;
}

export async function copyURIToPath(request: CopyURIRequest): Promise<CopyURIResponse> {
  const result = await invoke<CopyURIResponse>('plugin:native-bridge|copy_uri_to_path', {
    payload: request,
  });

  return result;
}

export async function setSystemUIVisibility(
  request: SetSystemUIVisibilityRequest,
): Promise<SetSystemUIVisibilityResponse> {
  const result = await invoke<SetSystemUIVisibilityResponse>(
    'plugin:native-bridge|set_system_ui_visibility',
    {
      payload: request,
    },
  );
  return result;
}

export async function getStatusBarHeight(): Promise<GetStatusBarHeightResponse> {
  const result = await invoke<GetStatusBarHeightResponse>(
    'plugin:native-bridge|get_status_bar_height',
  );
  return result;
}

let cachedSysFontsResult: GetSystemFontsListResponse | null = null;

export async function getSysFontsList(): Promise<GetSystemFontsListResponse> {
  if (cachedSysFontsResult) {
    return cachedSysFontsResult;
  }
  const result = await invoke<GetSystemFontsListResponse>(
    'plugin:native-bridge|get_sys_fonts_list',
  );
  cachedSysFontsResult = result;
  return result;
}

export async function interceptKeys(request: InterceptKeysRequest): Promise<void> {
  await invoke('plugin:native-bridge|intercept_keys', {
    payload: request,
  });
}

export async function lockScreenOrientation(request: LockScreenRequest): Promise<void> {
  await invoke('plugin:native-bridge|lock_screen_orientation', {
    payload: request,
  });
}

export async function getSystemColorScheme(): Promise<GetSystemColorSchemeResponse> {
  const result = await invoke<GetSystemColorSchemeResponse>(
    'plugin:native-bridge|get_system_color_scheme',
  );
  return result;
}

export async function getSafeAreaInsets(): Promise<GetSafeAreaInsetsResponse> {
  const result = await invoke<GetSafeAreaInsetsResponse>(
    'plugin:native-bridge|get_safe_area_insets',
  );
  return result;
}

export async function getScreenBrightness(): Promise<GetScreenBrightnessResponse> {
  const result = await invoke<GetScreenBrightnessResponse>(
    'plugin:native-bridge|get_screen_brightness',
  );
  return result;
}

export async function setScreenBrightness(
  request: SetScreenBrightnessRequest,
): Promise<SetScreenBrightnessResponse> {
  const result = await invoke<SetScreenBrightnessResponse>(
    'plugin:native-bridge|set_screen_brightness',
    {
      payload: request,
    },
  );
  return result;
}

export interface HasAmbientLightSensorResponse {
  available: boolean;
  error?: string;
}

export interface AmbientLightUpdatesResponse {
  success: boolean;
  error?: string;
}

export interface AmbientLightPayload {
  lux: number;
}

export async function hasAmbientLightSensor(): Promise<HasAmbientLightSensorResponse> {
  return invoke<HasAmbientLightSensorResponse>('plugin:native-bridge|has_ambient_light_sensor');
}

export async function startAmbientLightUpdates(): Promise<AmbientLightUpdatesResponse> {
  return invoke<AmbientLightUpdatesResponse>('plugin:native-bridge|start_ambient_light_updates');
}

export async function stopAmbientLightUpdates(): Promise<AmbientLightUpdatesResponse> {
  return invoke<AmbientLightUpdatesResponse>('plugin:native-bridge|stop_ambient_light_updates');
}

export async function selectDirectory(): Promise<SelectDirectoryResponse> {
  const result = await invoke<SelectDirectoryResponse>('plugin:native-bridge|select_directory');
  return result;
}

/**
 * Trigger a deep e-ink full screen refresh (GC / GC16 waveform) to clear
 * ghosting. Android-only; the native side probes several vendor mechanisms
 * via reflection and returns `success: false` on devices with no e-ink
 * controller. Other platforms reject with an unsupported-platform error.
 */
export async function refreshEinkScreen(): Promise<RefreshEinkScreenResponse> {
  return await invoke<RefreshEinkScreenResponse>('plugin:native-bridge|refresh_eink_screen');
}

/** Webview region to snapshot, in CSS pixels of the viewport (origin top-left). */
export interface CaptureWebviewRegionRequest {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Capture a region of the running webview as compressed image bytes for
 * the mesh page-curl texture (#555): PNG on macOS, JPEG on iOS/Android
 * (phone-CPU PNG encoding took ~1.5s per turn). The snapshot is taken at
 * screen scale, capped at 2x CSS pixels on mobile. Rejects on platforms
 * without a native capture implementation (web, Windows/Linux so far) —
 * callers fall back to the CSS curl.
 */
export async function captureWebviewRegion(
  request: CaptureWebviewRegionRequest,
): Promise<ArrayBuffer> {
  return await invoke<ArrayBuffer>('plugin:native-bridge|capture_webview_region', {
    payload: request,
  });
}
