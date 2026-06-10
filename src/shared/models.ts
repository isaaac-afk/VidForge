// Project data models. Authoritative spec lives in VIDEO_EDITOR_TRD.md §6.
// Phase 0 ships skeletons only; Phase 1 fills these in.

export type SchemaVersion = 1;

export interface Project {
  schemaVersion: SchemaVersion;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  settings: ProjectSettings;
  mediaPool: MediaAsset[];
  tracks: Track[];
  markers: Marker[];
  playhead: number;
  inPoint: number | null;
  outPoint: number | null;
}

export interface ProjectSettings {
  fps: 24 | 25 | 30 | 50 | 60;
  resolution: { width: number; height: number };
  sampleRate: 44100 | 48000;
}

export interface MediaAsset {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  type: 'video' | 'audio' | 'image';
  duration: number;
  metadata: {
    width?: number;
    height?: number;
    fps?: number;
    videoCodec?: string;
    audioCodec?: string;
    audioChannels?: number;
    audioSampleRate?: number;
    bitrate?: number;
  };
  thumbnailPath?: string;
  proxyPath?: string | null;
  waveformCachePath?: string;
  importedAt: string;
  /** FR-027: variable frame rate detected by ffprobe. */
  isVfr?: boolean;
}

export interface Track {
  id: string;
  kind: 'video' | 'audio';
  name: string;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  soloed: boolean;
  hidden: boolean;
  height: number;
}

export interface Clip {
  id: string;
  mediaId: string;
  trackTime: number;
  sourceIn: number;
  duration: number;
  speed: number;
  reversed: boolean;
  volume: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  effects: Effect[];
  linkedClipId?: string;
}

export type EffectType =
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'exposure'
  | 'temperature'
  | 'tint'
  | 'transition';

export interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface UserSettings {
  theme: 'dark' | 'light';
  recentProjects: string[];
  defaultExportPreset: string;
  keyboardShortcuts: Record<string, string>;
  hardwareAcceleration: 'auto' | 'nvenc' | 'qsv' | 'amf' | 'off';
  proxyResolution: 360 | 540 | 720;
  autoSaveIntervalSeconds: number;
}
