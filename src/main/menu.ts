import { BrowserWindow, Menu, type MenuItemConstructorOptions, app, shell } from 'electron';
import { basename } from 'node:path';
import type { MenuActionId } from '@shared/contracts';
import { getRecentProjects } from './store/settings';

function broadcastMenuAction(action: MenuActionId, payload?: unknown): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) return;
  win.webContents.send('menu:action', { action, payload });
}

function buildRecentSubmenu(): MenuItemConstructorOptions[] {
  const recents = getRecentProjects();
  if (recents.length === 0) {
    return [{ label: 'No recent projects', enabled: false }];
  }
  return recents.map((filePath) => ({
    label: basename(filePath, '.vedit'),
    sublabel: filePath,
    click: () => broadcastMenuAction('project:open-recent', filePath)
  }));
}

export function buildAppMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => broadcastMenuAction('project:new') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => broadcastMenuAction('project:open') },
        { label: 'Open Recent', submenu: buildRecentSubmenu() },
        { type: 'separator' },
        { label: 'Import Media…', accelerator: 'CmdOrCtrl+I', click: () => broadcastMenuAction('media:import') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => broadcastMenuAction('project:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => broadcastMenuAction('project:save-as') },
        { type: 'separator' },
        { label: 'Export…', accelerator: 'CmdOrCtrl+E', click: () => broadcastMenuAction('media:export') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => broadcastMenuAction('edit:undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => broadcastMenuAction('edit:redo') },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: () => broadcastMenuAction('edit:cut') },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => broadcastMenuAction('edit:copy') },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: () => broadcastMenuAction('edit:paste') },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => broadcastMenuAction('edit:select-all') },
        { type: 'separator' },
        { label: 'Delete', accelerator: 'Delete', click: () => broadcastMenuAction('edit:delete') },
        { label: 'Ripple Delete', accelerator: 'Shift+Delete', click: () => broadcastMenuAction('edit:ripple-delete') },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => broadcastMenuAction('app:preferences') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'F1', click: () => broadcastMenuAction('app:shortcuts') },
        { type: 'separator' },
        { label: 'View Project on Disk', click: () => shell.openPath(app.getPath('userData')) },
        { label: 'About VidForge', click: () => broadcastMenuAction('app:about') }
      ]
    }
  ];
  return Menu.buildFromTemplate(template);
}

export function refreshAppMenu(): void {
  Menu.setApplicationMenu(buildAppMenu());
}
