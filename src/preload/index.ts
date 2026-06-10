import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  ExportOptions,
  MenuActionId,
  OpenProjectResult,
  WaveformPeaksPayload
} from '@shared/contracts';
import type { MediaAsset, Project, UserSettings } from '@shared/models';

export interface ExportProgressEvent { jobId: string; percent: number; eta: number }
export interface ExportCompleteEvent { jobId: string; outputPath: string }
export interface ExportErrorEvent { jobId: string; message: string }

const api = {
  version: '0.1.0',
  platform: process.platform,

  project: {
    open: (filePath?: string) =>
      ipcRenderer.invoke('project:open', filePath) as Promise<OpenProjectResult | null>,
    save: (project: Project, filePath?: string) =>
      ipcRenderer.invoke('project:save', project, filePath) as Promise<string | null>,
    recentList: () => ipcRenderer.invoke('project:recentList') as Promise<string[]>,
    removeRecent: (filePath: string) =>
      ipcRenderer.invoke('project:removeRecent', filePath) as Promise<string[]>,
    autosave: (project: Project, filePath: string) =>
      ipcRenderer.invoke('project:autosave', project, filePath) as Promise<void>,
    clearAutosave: (filePath: string) =>
      ipcRenderer.invoke('project:clearAutosave', filePath) as Promise<void>
  },

  media: {
    import: (filePaths: string[]) =>
      ipcRenderer.invoke('media:import', filePaths) as Promise<MediaAsset[]>,
    pickFiles: () => ipcRenderer.invoke('media:pickFiles') as Promise<string[]>,
    generateWaveform: (mediaId: string, filePath: string) =>
      ipcRenderer.invoke('media:generateWaveform', mediaId, filePath) as Promise<WaveformPeaksPayload>,
    generateProxy: (mediaId: string, filePath: string) =>
      ipcRenderer.invoke('media:generateProxy', mediaId, filePath) as Promise<string>,
    /** Build the streaming URL for an absolute media path (used as <video src>). */
    sourceUrl: (filePath: string): string =>
      `app://media-source/${encodeURIComponent(filePath)}`,
    proxyUrl: (mediaId: string): string => `app://proxies/${mediaId}.mp4`
  },

  settings: {
    get: <K extends keyof UserSettings>(key: K) =>
      ipcRenderer.invoke('settings:get', key) as Promise<UserSettings[K]>,
    set: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
      ipcRenderer.invoke('settings:set', key, value) as Promise<void>,
    getAll: () => ipcRenderer.invoke('settings:getAll') as Promise<UserSettings>
  },

  system: {
    openInExplorer: (path: string) =>
      ipcRenderer.invoke('system:openInExplorer', path) as Promise<void>,
    pathExists: (path: string) =>
      ipcRenderer.invoke('system:pathExists', path) as Promise<boolean>,
    browseForMedia: (originalPath: string) =>
      ipcRenderer.invoke('system:browseForMedia', originalPath) as Promise<string | null>,
    detectEncoders: () => ipcRenderer.invoke('system:detectEncoders') as Promise<string[]>,
    /** Resolve an absolute path for a File dragged into the renderer (Electron 32+ replacement for File.path). */
    getPathForFile: (file: File) => webUtils.getPathForFile(file)
  },

  export: {
    start: (project: Project, options: ExportOptions) =>
      ipcRenderer.invoke('export:start', project, options) as Promise<string>,
    cancel: (jobId: string) => ipcRenderer.invoke('export:cancel', jobId) as Promise<void>,
    pickOutputPath: (suggestedName: string) =>
      ipcRenderer.invoke('export:pickOutputPath', suggestedName) as Promise<string | null>,
    reveal: (filePath: string) => ipcRenderer.invoke('export:reveal', filePath) as Promise<void>,
    openFile: (filePath: string) => ipcRenderer.invoke('export:openFile', filePath) as Promise<void>,
    suggestedName: (projectName: string) =>
      ipcRenderer.invoke('export:suggestedName', projectName) as Promise<string>,
    onProgress: (handler: (e: ExportProgressEvent) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: ExportProgressEvent) => handler(payload);
      ipcRenderer.on('export:progress', listener);
      return () => ipcRenderer.removeListener('export:progress', listener);
    },
    onComplete: (handler: (e: ExportCompleteEvent) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: ExportCompleteEvent) => handler(payload);
      ipcRenderer.on('export:complete', listener);
      return () => ipcRenderer.removeListener('export:complete', listener);
    },
    onError: (handler: (e: ExportErrorEvent) => void): (() => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: ExportErrorEvent) => handler(payload);
      ipcRenderer.on('export:error', listener);
      return () => ipcRenderer.removeListener('export:error', listener);
    }
  },

  /** Inform main of unsaved-changes state so it can gate the close prompt. */
  notifyDirty: (dirty: boolean) => ipcRenderer.send('renderer:dirty-state', dirty),
  /** Tell main it can finish closing the window. */
  confirmQuit: () => ipcRenderer.send('renderer:safe-to-quit'),

  /**
   * Subscribe to native-menu actions broadcast from main.
   * Returns an unsubscribe function.
   */
  onMenuAction: (handler: (action: MenuActionId, payload?: unknown) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      message: { action: MenuActionId; payload?: unknown }
    ): void => {
      handler(message.action, message.payload);
    };
    ipcRenderer.on('menu:action', listener);
    return () => ipcRenderer.removeListener('menu:action', listener);
  }
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api);
} else {
  (globalThis as unknown as { api: typeof api }).api = api;
}

export type AppAPI = typeof api;
