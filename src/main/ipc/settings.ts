import { ipcMain } from 'electron';
import type { UserSettings } from '@shared/models';
import { getAllSettings, getSetting, setSetting } from '../store/settings';

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', (_event, key: keyof UserSettings) => getSetting(key));
  ipcMain.handle('settings:set', (_event, key: keyof UserSettings, value: unknown) => {
    setSetting(key, value as UserSettings[typeof key]);
  });
  ipcMain.handle('settings:getAll', () => getAllSettings());
}
