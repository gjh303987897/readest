import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const nativeBridgeSource = readFileSync(
  resolve(
    process.cwd(),
    'src-tauri/plugins/tauri-plugin-native-bridge/android/src/main/java/NativeBridgePlugin.kt',
  ),
  'utf8',
);

describe('Android safe-area insets', () => {
  it('includes both status bar and display cutout insets for notch support', () => {
    expect(nativeBridgeSource).toContain('windowInsets.getInsets(');
    expect(nativeBridgeSource).toContain(
      'WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.statusBars()',
    );
  });
});
