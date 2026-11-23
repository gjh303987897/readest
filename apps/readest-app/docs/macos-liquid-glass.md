# macOS Liquid Glass

The macOS app uses a platform-specific navigation layer. Book covers, EPUB/PDF
pages, forms, and the user's reading colors remain opaque content surfaces.
Other platforms retain their existing visual language.

## Design decisions

- Use the regular material for navigation. Clear glass is intended for controls
  over rich media, and is unsuitable as the default behind directory text.
- Keep related reading controls together in small groups. Avoid turning book
  cards or every settings row into glass.
- Preserve the native traffic lights, reserve their physical left-hand space,
  and measure each header's actual height.
- Preserve keyboard focus, accessible labels, arbitrary window resizing, and
  the existing hide-on-close/Dock behavior.
- Reduce transparency and increase contrast produce opaque chrome. Reduce
  motion suppresses toolbar animation. E-ink disables the native material and
  uses the existing flat design.

## Implementation

`src-tauri/src/macos/glass.rs` looks up the public `NSGlassEffectView` class at
runtime. On macOS 26 and newer, it uses `window-vibrancy`, the material library
already used by Tauri, passing the WKWebView through `content_view` explicitly.
The library hosts it within glass and restores it on removal. This follows
Apple's advice to keep content inside glass instead of above it as a sibling.
The original window content container and delegate remain intact. The
deployment target remains macOS 12.

The native material is visible through the library header. Opaque HTML content
masks it elsewhere. Reading control groups and the directory sidebar use local
WebView backdrop filters; these are frontend materials, not native per-control
Liquid Glass. This keeps their sampling within the book's WebView.

The main and secondary WebViews receive a background color at creation, using
Wry's existing custom-background handling. The bridge adjusts public AppKit
window opacity and the public WKWebView under-page background when applying
or removing the material.

`useMacOSAppearance` mounts once per window. It serializes native updates, follows
the current app theme and e-ink mode, and listens for accessibility changes from
`NSWorkspace.notificationCenter`. Failed IPC produces an opaque fallback.
Pre-26 systems retain the frontend material without a native glass container.

The app has its own Cargo workspace and lockfile, which pin Tauri 2.12.0 and
window-vibrancy 0.8.1. The older root workspace lockfile is separate. The
macOS-only dependencies select the already locked material library and NSView
bindings. Tauri's window-effect convenience API does not pass the WebView as
glass content, so the bridge uses the underlying library's `content_view` API.
The window-sized material uses the public Regular style with interaction
animation left off.

## Verification

Unit coverage checks platform isolation, accessibility changes, e-ink changes,
theme-update ordering, failed IPC recovery, and teardown. Library tests check
traffic-light space, custom button suppression, and opaque content.
Real-browser material tests check computed backdrop removal, solid surfaces,
contrast boundaries, reduced motion, and platform/e-ink isolation.

The native module can be type-checked in isolation for `aarch64-apple-darwin`
against the locked Tauri API versions from Linux. This does not validate the
complete application bundle, Objective-C runtime behavior, or native rendering.

Native visual verification requires a Mac. Check:

1. macOS 26/27: light and dark themes, active/inactive windows, live resizing,
   native glass showing through the library header, opaque book covers and pages.
2. macOS 12–15: startup and the standard material fallback.
3. Change Reduce transparency, Increase contrast, and Reduce motion while open.
4. Enter/exit fullscreen; switch library → reader → library, including while
   the reading toolbar is hidden; check traffic-light visibility and alignment.
5. Close the main window and reopen it from the Dock. Repeat with a separate
   reading window and with e-ink enabled.
6. Keyboard navigation, narrow windows, expanded search, and RTL UI languages.

## Apple references reviewed

- [Materials — Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [Build an AppKit app with the new design — WWDC25](https://developer.apple.com/videos/play/wwdc2025/310/)
- [Modernize your AppKit app — WWDC26](https://developer.apple.com/videos/play/wwdc2026/289/)
- [NSGlassEffectView](https://developer.apple.com/documentation/appkit/nsglasseffectview)
- [NSWorkspace accessibility display options](https://developer.apple.com/documentation/appkit/nsworkspace/accessibilitydisplayoptionsdidchangenotification)
