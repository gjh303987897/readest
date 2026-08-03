const COMMANDS: &[&str] = &[
    "copy_uri_to_path",
    "set_system_ui_visibility",
    "get_status_bar_height",
    "get_sys_fonts_list",
    "intercept_keys",
    "lock_screen_orientation",
    "get_system_color_scheme",
    "get_safe_area_insets",
    "get_screen_brightness",
    "set_screen_brightness",
    "has_ambient_light_sensor",
    "start_ambient_light_updates",
    "stop_ambient_light_updates",
    "select_directory",
    "register_listener",
    "remove_listener",
    "request_manage_storage_permission",
    "check_permissions",
    "request_permissions",
    "checkPermissions",
    "requestPermissions",
    "refresh_eink_screen",
    "capture_webview_region",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
