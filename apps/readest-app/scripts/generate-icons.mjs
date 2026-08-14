import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '../..');
const manifest = resolve(repoRoot, 'data/icons/readest-icon-manifest.json');
const tauriIcons = resolve(appRoot, 'src-tauri/icons');
const tauriCli = resolve(appRoot, 'node_modules/@tauri-apps/cli/tauri.js');
const stagingRoot = mkdtempSync(join(tmpdir(), 'readest-icons-'));
const generatedIcons = resolve(stagingRoot, 'platforms');
const resizedIcons = resolve(stagingRoot, 'resized');

const runTauriIcon = (args) =>
  execFileSync(process.execPath, [tauriCli, 'icon', manifest, ...args], {
    cwd: appRoot,
    stdio: 'inherit',
  });

const copyResizedIcon = (size, destination) =>
  copyFileSync(resolve(resizedIcons, `${size}x${size}.png`), destination);

const copyTreeContents = (source, destination) => {
  for (const entry of readdirSync(source)) {
    cpSync(resolve(source, entry), resolve(destination, entry), { recursive: true, force: true });
  }
};

try {
  runTauriIcon(['--output', generatedIcons]);
  runTauriIcon(['--png', '16,32,48,128,256,512', '--output', resizedIcons]);

  const iosIcons = resolve(generatedIcons, 'ios');
  for (const icon of readdirSync(iosIcons)) {
    const iconPath = resolve(iosIcons, icon);
    const opaqueIcon = await sharp(iconPath)
      .flatten({ background: '#ffffff' })
      .removeAlpha()
      .png()
      .toBuffer();
    writeFileSync(iconPath, opaqueIcon);
  }

  copyTreeContents(generatedIcons, tauriIcons);

  const generatedAndroidRes = resolve(appRoot, 'src-tauri/gen/android/app/src/main/res');
  if (existsSync(generatedAndroidRes)) {
    copyTreeContents(resolve(generatedIcons, 'android'), generatedAndroidRes);
  }

  const generatedIosIcons = resolve(
    appRoot,
    'src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset',
  );
  if (existsSync(generatedIosIcons)) {
    copyTreeContents(resolve(generatedIcons, 'ios'), generatedIosIcons);
  }

  copyResizedIcon(512, resolve(appRoot, 'public/icon.png'));
  copyResizedIcon(512, resolve(appRoot, 'public/icon-tiny.png'));
  copyFileSync(resolve(generatedIcons, 'icon.ico'), resolve(appRoot, 'public/favicon.ico'));
  copyFileSync(
    resolve(iosIcons, 'AppIcon-60x60@3x.png'),
    resolve(appRoot, 'public/apple-touch-icon.png'),
  );

  for (const size of [16, 32, 48, 128, 256]) {
    copyResizedIcon(
      size,
      resolve(appRoot, `extensions/send-to-readest/icons/icon-${size}.png`),
    );
  }

  copyResizedIcon(128, resolve(repoRoot, 'apps/readest-calibre-plugin/images/icon.png'));
  copyResizedIcon(512, resolve(repoRoot, 'fastlane/metadata/android/en-US/images/icon.png'));
} finally {
  rmSync(stagingRoot, { recursive: true, force: true });
}
