import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { ExportOptions } from '@shared/contracts';
import type { Project } from '@shared/models';
import { cancelExport, startExport } from '../ffmpeg/render';
import { detectEncoders, type HardwareEncoder } from '../ffmpeg/encoders';

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

async function pickOutputPath(suggestedName: string): Promise<string | null> {
  const focused = BrowserWindow.getFocusedWindow();
  const opts: Electron.SaveDialogOptions = {
    title: 'Export to MP4',
    defaultPath: suggestedName.endsWith('.mp4') ? suggestedName : `${suggestedName}.mp4`,
    filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
  };
  const result = focused ? await dialog.showSaveDialog(focused, opts) : await dialog.showSaveDialog(opts);
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

async function startExportHandler(project: Project, options: ExportOptions): Promise<string> {
  if (!options.outputPath) {
    throw new Error('Output path is required');
  }
  if (!existsSync(dirname(options.outputPath))) {
    throw new Error(`Output folder does not exist: ${dirname(options.outputPath)}`);
  }
  return startExport(project, options, {
    onProgress: (p) => broadcast('export:progress', p),
    onError: (jobId, message) => broadcast('export:error', { jobId, message }),
    onComplete: (jobId, outputPath) => broadcast('export:complete', { jobId, outputPath })
  });
}

export function registerExportIpc(): void {
  ipcMain.handle('export:start', (_event, project: Project, options: ExportOptions) =>
    startExportHandler(project, options)
  );
  ipcMain.handle('export:cancel', (_event, jobId: string) => {
    cancelExport(jobId);
  });
  ipcMain.handle('export:pickOutputPath', (_event, suggestedName: string) =>
    pickOutputPath(suggestedName)
  );
  ipcMain.handle('export:reveal', (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
  ipcMain.handle('export:openFile', (_event, filePath: string) => {
    shell.openPath(filePath);
  });
  ipcMain.handle('system:detectEncoders', async (): Promise<HardwareEncoder[]> => detectEncoders());
  // Convenience for the export dialog default-name field.
  ipcMain.handle('export:suggestedName', (_event, projectName: string) => {
    return projectName ? `${basename(projectName, '.vedit')}.mp4` : 'untitled.mp4';
  });
}
