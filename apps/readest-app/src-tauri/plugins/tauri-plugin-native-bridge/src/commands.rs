use std::path::PathBuf;
use tauri::{command, AppHandle, Runtime, State};

use crate::models::*;
use crate::{DirectoryCallbackState, NativeBridgeExt, Result};

#[command]
pub(crate) async fn copy_uri_to_path<R: Runtime>(
    app: AppHandle<R>,
    payload: CopyURIRequest,
) -> Result<CopyURIResponse> {
    app.native_bridge().copy_uri_to_path(payload)
}

#[command]
pub(crate) async fn set_system_ui_visibility<R: Runtime>(
    app: AppHandle<R>,
    payload: SetSystemUIVisibilityRequest,
) -> Result<SetSystemUIVisibilityResponse> {
    app.native_bridge().set_system_ui_visibility(payload)
}

#[command]
pub(crate) async fn get_status_bar_height<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetStatusBarHeightResponse> {
    app.native_bridge().get_status_bar_height()
}

#[command]
pub(crate) async fn get_sys_fonts_list<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetSysFontsListResponse> {
    app.native_bridge().get_sys_fonts_list()
}

#[command]
pub(crate) async fn intercept_keys<R: Runtime>(
    app: AppHandle<R>,
    payload: InterceptKeysRequest,
) -> Result<()> {
    app.native_bridge().intercept_keys(payload)
}

#[command]
pub(crate) async fn lock_screen_orientation<R: Runtime>(
    app: AppHandle<R>,
    payload: LockScreenOrientationRequest,
) -> Result<()> {
    app.native_bridge().lock_screen_orientation(payload)
}

#[command]
pub(crate) async fn get_system_color_scheme<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetSystemColorSchemeResponse> {
    app.native_bridge().get_system_color_scheme()
}

#[command]
pub(crate) async fn get_safe_area_insets<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetSafeAreaInsetsResponse> {
    app.native_bridge().get_safe_area_insets()
}

#[command]
pub(crate) async fn get_screen_brightness<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetScreenBrightnessResponse> {
    app.native_bridge().get_screen_brightness()
}

#[command]
pub(crate) async fn set_screen_brightness<R: Runtime>(
    app: AppHandle<R>,
    payload: SetScreenBrightnessRequest,
) -> Result<SetScreenBrightnessResponse> {
    app.native_bridge().set_screen_brightness(payload)
}

#[command]
pub(crate) async fn has_ambient_light_sensor<R: Runtime>(
    app: AppHandle<R>,
) -> Result<HasAmbientLightSensorResponse> {
    app.native_bridge().has_ambient_light_sensor()
}

#[command]
pub(crate) async fn start_ambient_light_updates<R: Runtime>(
    app: AppHandle<R>,
) -> Result<AmbientLightUpdatesResponse> {
    app.native_bridge().start_ambient_light_updates()
}

#[command]
pub(crate) async fn stop_ambient_light_updates<R: Runtime>(
    app: AppHandle<R>,
) -> Result<AmbientLightUpdatesResponse> {
    app.native_bridge().stop_ambient_light_updates()
}

#[command]
pub(crate) async fn select_directory<R: Runtime>(
    app: AppHandle<R>,
    callback_state: State<'_, DirectoryCallbackState<R>>,
) -> Result<SelectDirectoryResponse> {
    let result = app.native_bridge().select_directory()?;
    if let Some(dir_path) = &result.path {
        let path = PathBuf::from(dir_path);
        if let Ok(callback_guard) = callback_state.callback.lock() {
            if let Some(callback) = callback_guard.as_ref() {
                callback(&app, &path);
            }
        }
    }
    Ok(result)
}

#[command]
pub(crate) async fn request_manage_storage_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<RequestManageStoragePermissionResponse> {
    app.native_bridge().request_manage_storage_permission()
}

#[command]
pub(crate) async fn refresh_eink_screen<R: Runtime>(
    app: AppHandle<R>,
) -> Result<RefreshEinkScreenResponse> {
    app.native_bridge().refresh_eink_screen()
}

#[command]
pub(crate) async fn capture_webview_region<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    payload: CaptureWebviewRegionRequest,
) -> Result<tauri::ipc::Response> {
    let png = app.native_bridge().capture_webview_region(&window, payload)?;
    Ok(tauri::ipc::Response::new(png))
}
