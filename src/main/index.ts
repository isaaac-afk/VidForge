import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { createMainWindow } from './window';
import { ensureCacheDirs, mountAppProtocol, registerAppProtocol } from './cache';
import { registerIpcHandlers } from './ipc';
import { refreshAppMenu } from './menu';

// Privileged schemes MUST be registered before app.whenReady().
registerAppProtocol();

let mainWindow: BrowserWindow | null = null;
let isDirty = false;
let quitConfirmed = false;

ipcMain.on('renderer:dirty-state', (_event, dirty: boolean) => {
  isDirty = !!dirty;
});

function bootstrap(): void {
  mainWindow = createMainWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // FR-004: prompt before discarding unsaved changes.
  mainWindow.on('close', async (event) => {
    if (!isDirty || quitConfirmed) return;
    event.preventDefault();
    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Unsaved Changes',
      message: 'Your project has unsaved changes. Save before closing?'
    });
    if (response === 2) return; // Cancel
    if (response === 0) {
      // Save: ask the renderer to save, then quit after confirmation.
      mainWindow!.webContents.send('menu:action', { action: 'project:save', payload: { thenQuit: true } });
      return;
    }
    // Don't Save: close without saving.
    quitConfirmed = true;
    mainWindow!.close();
  });
}

ipcMain.on('renderer:safe-to-quit', () => {
  quitConfirmed = true;
  if (mainWindow) mainWindow.close();
});

app.whenReady().then(async () => {
  await ensureCacheDirs();
  mountAppProtocol();
  registerIpcHandlers();
  refreshAppMenu();
  bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrap();
    }
  });
});

// FR-003: closing the last window quits the app on Windows.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
