use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_native_bridge);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<NativeBridge<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.readest.native_bridge", "NativeBridgePlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_native_bridge)?;
    Ok(NativeBridge(handle))
}

pub struct NativeBridge<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> NativeBridge<R> {
    pub fn copy_uri_to_path(&self, payload: CopyURIRequest) -> crate::Result<CopyURIResponse> {
        self.0.run_mobile_plugin("copy_uri_to_path", payload).map_err(Into::into)
    }

    pub fn set_system_ui_visibility(
        &self,
        payload: SetSystemUIVisibilityRequest,
    ) -> crate::Result<SetSystemUIVisibilityResponse> {
        self.0.run_mobile_plugin("set_system_ui_visibility", payload).map_err(Into::into)
    }

    pub fn get_status_bar_height(&self) -> crate::Result<GetStatusBarHeightResponse> {
        self.0.run_mobile_plugin("get_status_bar_height", ()).map_err(Into::into)
    }

    pub fn get_sys_fonts_list(&self) -> crate::Result<GetSysFontsListResponse> {
        self.0.run_mobile_plugin("get_sys_fonts_list", ()).map_err(Into::into)
    }

    pub fn intercept_keys(&self, payload: InterceptKeysRequest) -> crate::Result<()> {
        self.0.run_mobile_plugin("intercept_keys", payload).map_err(Into::into)
    }

    pub fn lock_screen_orientation(
        &self,
        payload: LockScreenOrientationRequest,
    ) -> crate::Result<()> {
        self.0.run_mobile_plugin("lock_screen_orientation", payload).map_err(Into::into)
    }

    pub fn get_system_color_scheme(&self) -> crate::Result<GetSystemColorSchemeResponse> {
        self.0.run_mobile_plugin("get_system_color_scheme", ()).map_err(Into::into)
    }

    pub fn get_safe_area_insets(&self) -> crate::Result<GetSafeAreaInsetsResponse> {
        self.0.run_mobile_plugin("get_safe_area_insets", ()).map_err(Into::into)
    }

    pub fn get_screen_brightness(&self) -> crate::Result<GetScreenBrightnessResponse> {
        self.0.run_mobile_plugin("get_screen_brightness", ()).map_err(Into::into)
    }

    pub fn set_screen_brightness(
        &self,
        payload: SetScreenBrightnessRequest,
    ) -> crate::Result<SetScreenBrightnessResponse> {
        self.0.run_mobile_plugin("set_screen_brightness", payload).map_err(Into::into)
    }

    pub fn has_ambient_light_sensor(&self) -> crate::Result<HasAmbientLightSensorResponse> {
        self.0.run_mobile_plugin("has_ambient_light_sensor", ()).map_err(Into::into)
    }

    pub fn start_ambient_light_updates(&self) -> crate::Result<AmbientLightUpdatesResponse> {
        self.0.run_mobile_plugin("start_ambient_light_updates", ()).map_err(Into::into)
    }

    pub fn stop_ambient_light_updates(&self) -> crate::Result<AmbientLightUpdatesResponse> {
        self.0.run_mobile_plugin("stop_ambient_light_updates", ()).map_err(Into::into)
    }

    pub fn select_directory(&self) -> crate::Result<SelectDirectoryResponse> {
        self.0.run_mobile_plugin("select_directory", ()).map_err(Into::into)
    }

    pub fn request_manage_storage_permission(
        &self,
    ) -> crate::Result<RequestManageStoragePermissionResponse> {
        self.0.run_mobile_plugin("request_manage_storage_permission", ()).map_err(Into::into)
    }

    pub fn refresh_eink_screen(&self) -> crate::Result<RefreshEinkScreenResponse> {
        self.0.run_mobile_plugin("refresh_eink_screen", ()).map_err(Into::into)
    }

    pub fn capture_webview_region(
        &self,
        _window: &tauri::WebviewWindow<R>,
        payload: CaptureWebviewRegionRequest,
    ) -> crate::Result<Vec<u8>> {
        use base64::Engine as _;
        let response: CaptureWebviewRegionResponse =
            self.0.run_mobile_plugin("capture_webview_region", payload)?;
        base64::engine::general_purpose::STANDARD
            .decode(response.data)
            .map_err(|error| crate::Error::NativeBridgeError(format!("invalid base64 PNG: {error}")))
    }
}
