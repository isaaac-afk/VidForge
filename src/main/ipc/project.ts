import { BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import type { OpenProjectResult } from '@shared/contracts';
import type { Project } from '@shared/models';
import { readProjectFile, writeProjectFile } from '../project/io';
import { clearAutosave, loadIfNewerAutosave, writeAutosave } from '../project/autosave';
import { addRecentProject, getRecentProjects, removeRecentProject } from '../store/settings';
import { refreshAppMenu } from '../menu';
import { allowMediaPaths } from '../cache';

const VEDIT_FILTERS: Electron.FileFilter[] = [
  { name: 'VidForge Project', extensions: ['vedit'] }
];

async function showOpenDialog(): Promise<string | null> {
  const focused = BrowserWindow.getFocusedWindow();
  const result = focused
    ? await dialog.showOpenDialog(focused, {
        title: 'Open Project',
        filters: VEDIT_FILTERS,
        properties: ['openFile']
      })
    : await dialog.showOpenDialog({
        title: 'Open Project',
        filters: VEDIT_FILTERS,
        properties: ['openFile']
      });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

async function showSaveDialog(suggestedName: string): Promise<string | null> {
  const focused = BrowserWindow.getFocusedWindow();
  const result = focused
    ? await dialog.showSaveDialog(focused, {
        title: 'Save Project',
        filters: VEDIT_FILTERS,
        defaultPath: `${suggestedName}.vedit`
      })
    : await dialog.showSaveDialog({
        title: 'Save Project',
        filters: VEDIT_FILTERS,
        defaultPath: `${suggestedName}.vedit`
      });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

async function openProject(filePath?: string): Promise<OpenProjectResult | null> {
  let path = filePath;
  if (!path) {
    const picked = await showOpenDialog();
    if (!picked) return null;
    path = picked;
  }

  let project: Project;
  let fromAutosave = false;
  try {
    // FR-006: if an autosave sidecar is newer than the saved file, use it.
    const autosaved = await loadIfNewerAutosave(path);
    if (autosaved) {
      project = autosaved;
      fromAutosave = true;
    } else {
      project = await readProjectFile(path);
    }
  } catch (err) {
    removeRecentProject(path);
    throw err;
  }

  const missingMedia = project.mediaPool
    .filter((asset) => !existsSync(asset.filePath))
    .map((asset) => asset.filePath);

  allowMediaPaths(
    project.mediaPool.filter((asset) => existsSync(asset.filePath)).map((asset) => asset.filePath)
  );

  addRecentProject(path);
  refreshAppMenu();

  return { project, filePath: path, missingMedia, fromAutosave };
}

async function saveProject(project: Project, filePath?: string): Promise<string | null> {
  let path = filePath;
  if (!path) {
    const picked = await showSaveDialog(project.name || 'Untitled');
    if (!picked) return null;
    path = picked;
  }

  await writeProjectFile(path, project);
  // FR-006: a successful manual save invalidates any older autosave sidecar.
  await clearAutosave(path);
  addRecentProject(path);
  refreshAppMenu();
  return path;
}

export function registerProjectIpc(): void {
  ipcMain.handle('project:open', (_event, filePath?: string) => openProject(filePath));
  ipcMain.handle('project:save', (_event, project: Project, filePath?: string) =>
    saveProject(project, filePath)
  );
  ipcMain.handle('project:recentList', () => getRecentProjects());
  ipcMain.handle('project:removeRecent', (_event, filePath: string) => removeRecentProject(filePath));
  // FR-005: renderer-driven autosave timer writes a sidecar next to the .vedit.
  ipcMain.handle('project:autosave', (_event, project: Project, filePath: string) =>
    writeAutosave(filePath, project)
  );
  ipcMain.handle('project:clearAutosave', (_event, filePath: string) => clearAutosave(filePath));
}
