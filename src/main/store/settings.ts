import Store from 'electron-store';
import type { UserSettings } from '@shared/models';

const defaults: UserSettings = {
  theme: 'dark',
  recentProjects: [],
  defaultExportPreset: 'mp4_1080p',
  keyboardShortcuts: {},
  hardwareAcceleration: 'auto',
  proxyResolution: 540,
  autoSaveIntervalSeconds: 60
};

const store = new Store<UserSettings>({
  name: 'settings',
  defaults,
  clearInvalidConfig: true
});

export function getSetting<K extends keyof UserSettings>(key: K): UserSettings[K] {
  return store.get(key);
}

export function setSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
  store.set(key, value);
}

export function getAllSettings(): UserSettings {
  return store.store;
}

export function addRecentProject(filePath: string): string[] {
  const current = store.get('recentProjects').filter((p) => p !== filePath);
  current.unshift(filePath);
  const trimmed = current.slice(0, 10);
  store.set('recentProjects', trimmed);
  return trimmed;
}

export function getRecentProjects(): string[] {
  return store.get('recentProjects');
}

export function removeRecentProject(filePath: string): string[] {
  const filtered = store.get('recentProjects').filter((p) => p !== filePath);
  store.set('recentProjects', filtered);
  return filtered;
}
