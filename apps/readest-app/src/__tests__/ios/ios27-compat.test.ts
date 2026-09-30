import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const tauriDir = resolve(process.cwd(), 'src-tauri');
const config = JSON.parse(readFileSync(resolve(tauriDir, 'tauri.conf.json'), 'utf-8'));
const plist = new DOMParser().parseFromString(
  readFileSync(resolve(tauriDir, 'Info-ios.plist'), 'utf-8'),
  'application/xml',
);

function valueForKey(dict: Element, key: string): Element | null {
  const entry = Array.from(dict.children).find(
    (child) => child.tagName === 'key' && child.textContent === key,
  );
  return entry?.nextElementSibling ?? null;
}

describe('iOS 15-27 app configuration', () => {
  it('keeps iOS 15 as the minimum supported system', () => {
    expect(config.bundle.iOS.minimumSystemVersion).toBe('15.0');
    expect(config.bundle.iOS.infoPlist).toBe('./Info-ios.plist');
  });

  it('declares a single-window UIKit scene with the Tao scene delegate', () => {
    expect(plist.querySelector('parsererror')).toBeNull();
    const root = plist.querySelector('plist > dict');
    expect(root).not.toBeNull();
    const manifest = valueForKey(root!, 'UIApplicationSceneManifest');
    expect(manifest?.tagName).toBe('dict');
    expect(valueForKey(manifest!, 'UIApplicationSupportsMultipleScenes')?.tagName).toBe('false');
    const configurations = valueForKey(manifest!, 'UISceneConfigurations');
    expect(configurations?.tagName).toBe('dict');
    const scenes = valueForKey(configurations!, 'UIWindowSceneSessionRoleApplication');
    expect(scenes?.tagName).toBe('array');
    const scene = scenes?.firstElementChild;
    expect(scene?.tagName).toBe('dict');
    expect(valueForKey(scene!, 'UISceneDelegateClassName')?.textContent).toBe('TaoSceneDelegate');
  });

  it('declares a launch screen for iOS 27 SDK submissions', () => {
    const root = plist.querySelector('plist > dict');
    expect(valueForKey(root!, 'UILaunchStoryboardName')?.textContent).toBe('LaunchScreen');
  });
});
