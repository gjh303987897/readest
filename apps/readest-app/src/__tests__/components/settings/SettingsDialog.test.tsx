import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsDialog from '@/components/settings/SettingsDialog';

vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: {} }) }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ setSettingsDialogOpen: () => {} }),
}));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/components/Dialog', () => ({
  default: ({ header, children }: { header: React.ReactNode; children: React.ReactNode }) => (
    <div role='dialog'>
      {header}
      {children}
    </div>
  ),
}));
vi.mock('@/components/settings/GeneralPanel', () => ({
  default: () => <div>General content</div>,
}));
vi.mock('@/components/settings/FontPanel', () => ({ default: () => <div>Font content</div> }));
vi.mock('@/components/settings/LayoutPanel', () => ({ default: () => <div>Layout content</div> }));
vi.mock('@/components/settings/ThemePanel', () => ({ default: () => <div>Theme content</div> }));
vi.mock('@/components/settings/ControlPanel', () => ({
  default: () => <div>Control content</div>,
}));
vi.mock('@/components/settings/TTSPanel', () => ({ default: () => <div>TTS content</div> }));
vi.mock('@/components/settings/PrivacyPanel', () => ({
  default: () => <div>Privacy content</div>,
}));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('SettingsDialog panel transitions', () => {
  it('restarts the content entrance when a different tab is selected', () => {
    render(<SettingsDialog bookKey='' />);
    const firstPanel = screen.getByRole('tabpanel');
    fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));

    const nextPanel = screen.getByRole('tabpanel');
    expect(nextPanel).not.toBe(firstPanel);
    expect(nextPanel.classList.contains('view-switch-enter')).toBe(true);
    expect(screen.getByText('Layout content')).toBeTruthy();
  });
});
