// IPC channel contract. Authoritative spec lives in VIDEO_EDITOR_TRD.md §7.
// This shape is consumed by both src/main (handlers) and src/preload (bridge).

import type { MediaAsset, Project, UserSettings } from './models';

export interface WaveformPeaksPayload {
  /** Buckets per second (so peaks.length ≈ duration * sampleRate). */
  sampleRate: number;
  channels: 1;
  peaks: number[];
}

export interface ExportOptions {
  outputPath: string;
  preset: 'mp4_1080p' | 'mp4_720p' | 'mp4_4k' | 'custom';
  customSettings?: {
    width: number;
    height: number;
    fps: number;
    videoCodec: 'libx264' | 'libx265' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf';
    audioCodec: 'aac' | 'mp3';
    bitrate?: string;
    crf?: number;
  };
  useInOutPoints: boolean;
}

export interface OpenProjectResult {
  project: Project;
  filePath: string;
  /** Absolute paths of media files referenced by the project that are missing on disk. */
  missingMedia: string[];
  /** FR-006: true if the loaded snapshot came from `<path>.autosave` because it was newer. */
  fromAutosave?: boolean;
}

export interface RequestChannels {
  // Project lifecycle
  'project:open': { args: [filePath?: string]; result: OpenProjectResult | null };
  'project:save': { args: [project: Project, filePath?: string]; result: string | null };
  'project:recentList': { args: []; result: string[] };
  'project:removeRecent': { args: [filePath: string]; result: string[] };
  'project:autosave': { args: [project: Project, filePath: string]; result: void };
  'project:clearAutosave': { args: [filePath: string]; result: void };

  // Media import + asset generation
  'media:import': { args: [filePaths: string[]]; result: MediaAsset[] };
  'media:generateThumbnail': { args: [mediaId: string, filePath: string]; result: string };
  'media:generateWaveform': { args: [mediaId: string, filePath: string]; result: WaveformPeaksPayload };
  'media:generateProxy': { args: [mediaId: string, filePath: string]; result: string };
  'media:pickFiles': { args: []; result: string[] };

  // Export (Phase 4)
  'export:start': { args: [project: Project, options: ExportOptions]; result: string };
  'export:cancel': { args: [jobId: string]; result: void };
  'export:pickOutputPath': { args: [suggestedName: string]; result: string | null };
  'export:reveal': { args: [filePath: string]; result: void };
  'export:openFile': { args: [filePath: string]; result: void };
  'export:suggestedName': { args: [projectName: string]; result: string };

  // Settings
  'settings:get': { args: [key: keyof UserSettings]; result: unknown };
  'settings:set': { args: [key: keyof UserSettings, value: unknown]; result: void };
  'settings:getAll': { args: []; result: UserSettings };

  // System
  'system:detectEncoders': { args: []; result: string[] };
  'system:openInExplorer': { args: [path: string]; result: void };
  'system:pathExists': { args: [path: string]; result: boolean };
  'system:browseForMedia': { args: [originalPath: string]; result: string | null };
}

export interface EventChannels {
  'menu:action': { action: MenuActionId };
  'export:progress': { jobId: string; percent: number; eta: number };
  'export:complete': { jobId: string; outputPath: string };
  'export:error': { jobId: string; message: string };
}

export type RequestChannel = keyof RequestChannels;
export type EventChannel = keyof EventChannels;

/** Identifiers for native-menu actions broadcast to the renderer. */
export type MenuActionId =
  | 'project:new'
  | 'project:open'
  | 'project:open-recent'
  | 'project:save'
  | 'project:save-as'
  | 'media:import'
  | 'media:export'
  | 'edit:undo'
  | 'edit:redo'
  | 'edit:cut'
  | 'edit:copy'
  | 'edit:paste'
  | 'edit:select-all'
  | 'edit:delete'
  | 'edit:ripple-delete'
  | 'app:preferences'
  | 'app:about'
  | 'app:shortcuts';
