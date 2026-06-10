import { nanoid } from 'nanoid';
import type { Project, ProjectSettings, Track } from './models';

export interface NewProjectParams {
  name: string;
  settings: ProjectSettings;
}

function makeTrack(kind: 'video' | 'audio', index: number): Track {
  return {
    id: nanoid(),
    kind,
    name: `${kind === 'video' ? 'V' : 'A'}${index}`,
    clips: [],
    muted: false,
    locked: false,
    soloed: false,
    hidden: false,
    height: kind === 'video' ? 80 : 60
  };
}

/**
 * Build a fresh Project per FR-030: two video tracks (V1, V2) and two audio tracks (A1, A2).
 */
export function createNewProject(params: NewProjectParams): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: nanoid(),
    name: params.name,
    createdAt: now,
    modifiedAt: now,
    settings: params.settings,
    mediaPool: [],
    tracks: [
      makeTrack('video', 2),
      makeTrack('video', 1),
      makeTrack('audio', 1),
      makeTrack('audio', 2)
    ],
    markers: [],
    playhead: 0,
    inPoint: null,
    outPoint: null
  };
}

export const RESOLUTION_PRESETS = {
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
  '4k': { width: 3840, height: 2160 }
} as const;

export const FPS_OPTIONS = [24, 25, 30, 50, 60] as const;
