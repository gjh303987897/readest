//! AppKit appearance and accessibility bridge for macOS navigation.
//! Use Tauri's material library with the WebView explicitly hosted inside glass.

use cocoa::appkit::{NSColor, NSWindow};
use cocoa::base::{id, nil, BOOL, NO, YES};
use cocoa::foundation::NSString;
use objc::declare::ClassDecl;
use objc::runtime::{Class, Object, Sel};
use objc::{class, msg_send, sel, sel_impl};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, WebviewWindow};
use window_vibrancy::{apply_liquid_glass, clear_liquid_glass, LiquidGlassOptions};

static APP: OnceLock<AppHandle> = OnceLock::new();

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacOSAppearance {
    material: &'static str,
    reduce_transparency: bool,
    increase_contrast: bool,
    reduce_motion: bool,
}

/// Called once from Tauri's setup callback on the AppKit main thread.
pub fn observe_accessibility(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    extern "C" fn changed(_: &Object, _: Sel, _: id) {
        if let Some(app) = APP.get() {
            let _ = app.emit("macos-appearance-changed", ());
        }
    }
    unsafe {
        let mut observer = ClassDecl::new("ReadestDisplayOptionsObserver", class!(NSObject))
            .expect("display options observer class must be unique");
        observer.add_method(
            sel!(displayOptionsChanged:),
            changed as extern "C" fn(&Object, Sel, id),
        );
        let observer: id = msg_send![observer.register(), new];
        let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
        // This notification is delivered by NSWorkspace's center, not the default center.
        let center: id = msg_send![workspace, notificationCenter];
        let name = NSString::alloc(nil)
            .init_str("NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification");
        let _: () = msg_send![center,
            addObserver: observer
            selector: sel!(displayOptionsChanged:)
            name: name
            object: nil
        ];
        let _: () = msg_send![name, release];
        // The observer has application lifetime. NSNotificationCenter does not retain it.
    }
}

#[tauri::command]
pub async fn configure_macos_glass(
    window: WebviewWindow,
    enabled: bool,
    dark_mode: bool,
) -> Result<MacOSAppearance, String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    let material_window = window.clone();
    window
        .with_webview(move |webview| {
            // with_webview dispatches to the main thread. No AppKit pointers cross threads.
            let appearance = unsafe {
                configure(
                    &material_window,
                    webview.ns_window() as id,
                    webview.inner() as id,
                    enabled,
                    dark_mode,
                )
            };
            let _ = send.send(appearance);
        })
        .map_err(|error| error.to_string())?;
    receive.await.map_err(|error| error.to_string())?
}

unsafe fn configure(
    window: &WebviewWindow,
    ns_window: id,
    webview: id,
    enabled: bool,
    dark_mode: bool,
) -> Result<MacOSAppearance, String> {
    let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
    let reduce_transparency: BOOL =
        msg_send![workspace, accessibilityDisplayShouldReduceTransparency];
    let increase_contrast: BOOL = msg_send![workspace, accessibilityDisplayShouldIncreaseContrast];
    let reduce_motion: BOOL = msg_send![workspace, accessibilityDisplayShouldReduceMotion];
    let solid = !enabled || reduce_transparency == YES || increase_contrast == YES;

    let name = NSString::alloc(nil).init_str(if dark_mode {
        "NSAppearanceNameDarkAqua"
    } else {
        "NSAppearanceNameAqua"
    });
    let appearance: id = msg_send![class!(NSAppearance), appearanceNamed: name];
    let _: () = msg_send![ns_window, setAppearance: appearance];
    let _: () = msg_send![name, release];

    // Clearing restores the WebView to its original container. The library
    // owns the native material's lifetime and resizing, without replacing
    // NSWindow.contentView or its delegate.
    clear_liquid_glass(window).map_err(|error| error.to_string())?;
    let material = if !solid && Class::get("NSGlassEffectView").is_some() {
        let content = &*(webview as *const objc2_app_kit::NSView);
        // Tauri's window-effect convenience API does not supply content_view.
        // Pass it explicitly: Apple advises against glass behind sibling views.
        apply_liquid_glass(window, LiquidGlassOptions::default().content_view(content))
            .map_err(|error| error.to_string())?;
        // Leave whole-window interaction animation off; it belongs on controls.
        ns_window.setOpaque_(NO);
        ns_window.setBackgroundColor_(NSColor::clearColor(nil));
        let _: () = msg_send![webview, setUnderPageBackgroundColor: NSColor::clearColor(nil)];
        "liquid"
    } else {
        ns_window.setOpaque_(YES);
        let background: id = msg_send![class!(NSColor), windowBackgroundColor];
        ns_window.setBackgroundColor_(background);
        let _: () = msg_send![webview, setUnderPageBackgroundColor: background];
        if solid {
            "solid"
        } else {
            "standard"
        }
    };
    Ok(MacOSAppearance {
        material,
        reduce_transparency: reduce_transparency == YES,
        increase_contrast: increase_contrast == YES,
        reduce_motion: reduce_motion == YES,
    })
}
