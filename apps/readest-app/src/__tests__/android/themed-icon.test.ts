import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Regression guard for the Android themed ("Material You" / monochrome) launcher
 * icon (issue #4733).
 *
 * Android 13+ recolors the adaptive icon's `<monochrome>` layer with a
 * wallpaper-derived tint when the user enables themed icons. Support for it was
 * originally added in #2122/#2153 (the `ic_launcher_monochrome.png` assets) and
 * wired into the source adaptive icon, but #2353 ("fixed Android launcher icon
 * size") rewrote the *committed* `gen/` adaptive icon to inset the foreground
 * and silently dropped the `<monochrome>` layer — so themed icons stopped
 * working in shipped builds.
 *
 * Mobile projects under `src-tauri/gen` are ignored and regenerated, so the
 * committed icon sources and manifest must contain every customization needed
 * to reproduce the adaptive icon in CI and release builds.
 *
 * Invariants:
 *  1. The icon manifest declares padded foreground and monochrome sources.
 *  2. The committed adaptive icon declares a `<monochrome>` layer pointing at
 *     `@mipmap/ic_launcher_monochrome`.
 *  3. A committed `ic_launcher_monochrome.png` exists for every launcher
 *     density so the resource resolves when a mobile project is regenerated.
 */

const appRoot = process.cwd();
const repoRoot = resolve(appRoot, '../..');
const resRoot = resolve(appRoot, 'src-tauri/icons/android');
const manifestPath = resolve(repoRoot, 'data/icons/readest-icon-manifest.json');

const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

describe('Android themed (monochrome) launcher icon', () => {
  it('generates adaptive layers from committed source assets', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      android_fg: string;
      android_monochrome: string;
    };

    expect(manifest.android_fg).toBe('readest-book-android-foreground.png');
    expect(manifest.android_monochrome).toBe('readest-book-monochrome.png');
    expect(existsSync(resolve(repoRoot, 'data/icons', manifest.android_fg))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'data/icons', manifest.android_monochrome))).toBe(true);
  });

  it('declares a <monochrome> layer in the adaptive icon', () => {
    const xml = readFileSync(resolve(resRoot, 'mipmap-anydpi-v26/ic_launcher.xml'), 'utf8');
    expect(xml).toMatch(/<monochrome\b/);
    expect(xml).toMatch(/@mipmap\/ic_launcher_monochrome/);
  });

  it('ships a tracked monochrome mipmap for every density', () => {
    const missing = DENSITIES.filter(
      (d) => !existsSync(resolve(resRoot, `mipmap-${d}`, 'ic_launcher_monochrome.png')),
    );
    expect(missing, `missing tracked monochrome mipmaps for: ${missing.join(', ')}`).toEqual([]);
  });
});
