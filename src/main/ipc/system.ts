import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { access } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { allowMediaPath } from '../cache';

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function browseForMedia(originalPath: string): Promise<string | null> {
  const focused = BrowserWindow.getFocusedWindow();
  const ext = extname(originalPath).slice(1);
  const filters: Electron.FileFilter[] = ext
    ? [{ name: `Original type (.${ext})`, extensions: [ext] }, { name: 'All files', extensions: ['*'] }]
    : [{ name: 'All files', extensions: ['*'] }];
  const result = focused
    ? await dialog.showOpenDialog(focused, {
        title: `Relink "${basename(originalPath)}"`,
        properties: ['openFile'],
        filters
      })
    : await dialog.showOpenDialog({
        title: `Relink "${basename(originalPath)}"`,
        properties: ['openFile'],
        filters
      });
  if (result.canceled || result.filePaths.length === 0) return null;
  const picked = result.filePaths[0];
  allowMediaPath(picked);
  return picked;
}

export function registerSystemIpc(): void {
  ipcMain.handle('system:openInExplorer', (_event, path: string) => {
    shell.showItemInFolder(path);
  });
  ipcMain.handle('system:pathExists', (_event, path: string) => pathExists(path));
  ipcMain.handle('system:browseForMedia', (_event, originalPath: string) => browseForMedia(originalPath));
}
