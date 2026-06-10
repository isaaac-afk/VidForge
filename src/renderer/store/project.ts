import { create } from 'zustand';
import { produce } from 'immer';
import { nanoid } from 'nanoid';
import type { Clip, MediaAsset, Project, Track } from '@shared/models';
import type { OpenProjectResult } from '@shared/contracts';
import {
  COLOR_EFFECT_TYPES,
  withColorValue,
  withoutColorEffects,
  type ColorEffectType
} from '@shared/colorCorrection';

export type ModalKind =
  | { kind: 'new-project' }
  | { kind: 'relink'; missingPaths: string[] }
  | { kind: 'about' }
  | { kind: 'export' }
  | { kind: 'shortcuts' }
  | { kind: 'preferences' }
  | { kind: 'error'; title: string; message: string };

export type ToolMode = 'select' | 'razor';

/** Reference to a clip and the track that owns it (renderer-side helper). */
export interface ClipRef {
  trackId: string;
  clipId: string;
}

interface ProjectState {
  project: Project | null;
  filePath: string | null;
  isDirty: boolean;
  recentProjects: string[];
  modal: ModalKind | null;

  /** Pixels per second. Adjusted by Ctrl+scroll / +- keys / slider. */
  zoom: number;
  /** Snap-to-edge toggle (FR-039). */
  snapEnabled: boolean;
  /** Ripple-edit toggle (FR-041): trimming a clip shifts following clips on its track. */
  rippleEnabled: boolean;
  /** Currently selected clip IDs (FR-042/FR-043). */
  selectedClipIds: string[];
  /** Active editing tool (FR-050). */
  toolMode: ToolMode;
  /** FR-006: when set, the loaded project came from an autosave; show the recovery banner. */
  recoveredFromAutosave: boolean;
  dismissRecoveryNotice: () => void;

  // History — FR-054, FR-055. Snapshot-based with immer structural sharing.
  past: Project[];
  future: Project[];

  loadProject: (result: OpenProjectResult) => void;
  setProject: (project: Project, filePath: string | null) => void;
  closeProject: () => void;
  markSaved: (filePath: string) => void;
  setRecentProjects: (recents: string[]) => void;

  addMediaAssets: (assets: MediaAsset[]) => void;
  removeMediaAsset: (id: string) => void;
  relinkMedia: (originalPath: string, newPath: string) => void;
  /** FR-130: stash the proxy path on a media asset so the Preview can route to it. */
  setMediaProxyPath: (mediaId: string, proxyPath: string | null) => void;

  // Timeline ops
  addClipToTrack: (trackId: string, clip: Clip) => void;
  /** Add many clips in one history entry (used by paste). */
  addClipsBulk: (items: Array<{ trackId: string; clip: Clip }>) => string[];
  moveClip: (clipId: string, targetTrackId: string, newTrackTime: number) => void;
  trimClip: (clipId: string, edge: 'start' | 'end', newTrackTime: number) => void;
  /** Razor (FR-050): split a clip into two at the given track-time. */
  splitClipAt: (clipId: string, trackTime: number) => void;
  /** FR-051: delete selected clips, leave gap. */
  removeClips: (clipIds: string[]) => void;
  /** FR-052: delete selected clips, shift later clips on the same track to close the gaps. */
  rippleDeleteClips: (clipIds: string[]) => void;
  selectClips: (ids: string[], mode?: 'set' | 'add' | 'toggle') => void;
  clearSelection: () => void;
  setToolMode: (mode: ToolMode) => void;

  // Track ops (FR-031, FR-081)
  addTrack: (kind: 'video' | 'audio') => void;
  removeTrack: (trackId: string) => void;
  setTrackFlag: (trackId: string, flag: 'muted' | 'soloed' | 'hidden' | 'locked', value: boolean) => void;

  // Clip property edit (FR-080)
  setClipVolume: (clipId: string, volume: number) => void;
  // Color correction (FR-100, FR-103)
  setClipColor: (clipId: string, type: ColorEffectType, value: number) => void;
  resetClipColor: (clipId: string) => void;

  setPlayhead: (seconds: number) => void;
  setInPoint: (seconds: number | null) => void;
  setOutPoint: (seconds: number | null) => void;

  setZoom: (zoom: number) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setRippleEnabled: (enabled: boolean) => void;

  // History API
  undo: () => void;
  redo: () => void;

  openModal: (modal: ModalKind) => void;
  closeModal: () => void;
}

function notifyDirty(dirty: boolean): void {
  if (typeof window !== 'undefined' && window.api?.notifyDirty) {
    window.api.notifyDirty(dirty);
  }
}

/** Min pixels per second on the timeline (1 px per minute → 1/60 px/s). */
export const MIN_ZOOM = 1 / 60;
/** Max pixels per second (1 px per frame at 60fps → 60 px/s). Reasonable upper bound. */
export const MAX_ZOOM = 240;
export const DEFAULT_ZOOM = 60;

/** TRD risk mitigation: cap undo stack to keep memory bounded on huge projects. */
const MAX_HISTORY = 200;
/** Track-time epsilon for collision checks (1 ms). */
const EPS = 0.001;
/** FR-031: cap at 10 video and 10 audio tracks. */
export const MAX_TRACKS_PER_KIND = 10;

function findTrack(project: Project, trackId: string): Track | undefined {
  return project.tracks.find((t) => t.id === trackId);
}

function findClipLocation(
  project: Project,
  clipId: string
): { track: Track; clip: Clip } | undefined {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return undefined;
}

/**
 * Resolve a non-overlapping start time on a track for a clip of `duration`. Prefers `desired`
 * but slides toward the right if needed, skipping any neighbours. Pure: does not mutate.
 */
function resolveNonOverlap(
  track: Track,
  desired: number,
  duration: number,
  ignoreClipId?: string
): number {
  const others = track.clips
    .filter((c) => c.id !== ignoreClipId)
    .sort((a, b) => a.trackTime - b.trackTime);
  let start = Math.max(0, desired);
  for (const c of others) {
    const cEnd = c.trackTime + c.duration;
    if (start + duration <= c.trackTime + EPS) break;
    if (start + EPS >= cEnd) continue;
    // Overlap — push past this clip.
    start = cEnd;
  }
  return start;
}

/** Common shape returned by every editing action: pushes pre-edit state to undo stack. */
function applyEdit(prev: Project, next: Project, past: Project[]): {
  project: Project;
  past: Project[];
  future: Project[];
  isDirty: true;
} {
  const trimmedPast = past.length >= MAX_HISTORY ? past.slice(past.length - MAX_HISTORY + 1) : past;
  return {
    project: next,
    past: [...trimmedPast, prev],
    future: [],
    isDirty: true
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  filePath: null,
  isDirty: false,
  recentProjects: [],
  modal: null,

  zoom: DEFAULT_ZOOM,
  snapEnabled: true,
  rippleEnabled: false,
  selectedClipIds: [],
  toolMode: 'select',
  recoveredFromAutosave: false,

  past: [],
  future: [],

  loadProject: (result) => {
    const fromAutosave = !!result.fromAutosave;
    set({
      project: result.project,
      filePath: result.filePath,
      // Recovered projects are dirty so the user is prompted to save before quitting.
      isDirty: fromAutosave,
      selectedClipIds: [],
      zoom: DEFAULT_ZOOM,
      past: [],
      future: [],
      toolMode: 'select',
      recoveredFromAutosave: fromAutosave
    });
    notifyDirty(fromAutosave);
    if (result.missingMedia.length > 0) {
      set({ modal: { kind: 'relink', missingPaths: result.missingMedia } });
    }
  },

  dismissRecoveryNotice: () => set({ recoveredFromAutosave: false }),

  setProject: (project, filePath) => {
    set({
      project,
      filePath,
      isDirty: true,
      selectedClipIds: [],
      zoom: DEFAULT_ZOOM,
      past: [],
      future: [],
      toolMode: 'select'
    });
    notifyDirty(true);
  },

  closeProject: () => {
    set({
      project: null,
      filePath: null,
      isDirty: false,
      selectedClipIds: [],
      past: [],
      future: []
    });
    notifyDirty(false);
  },

  markSaved: (filePath) => {
    set({ filePath, isDirty: false });
    notifyDirty(false);
  },

  setRecentProjects: (recents) => set({ recentProjects: recents }),

  addMediaAssets: (assets) => {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      const seen = new Set(draft.mediaPool.map((a) => a.filePath));
      for (const asset of assets) {
        if (!seen.has(asset.filePath)) {
          draft.mediaPool.push(asset);
          seen.add(asset.filePath);
        }
      }
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  removeMediaAsset: (id) => {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      draft.mediaPool = draft.mediaPool.filter((a) => a.id !== id);
      // Drop any clips that referenced the removed asset.
      for (const track of draft.tracks) {
        track.clips = track.clips.filter((c) => c.mediaId !== id);
      }
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  relinkMedia: (originalPath, newPath) => {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      for (const asset of draft.mediaPool) {
        if (asset.filePath === originalPath) {
          asset.filePath = newPath;
        }
      }
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  setMediaProxyPath: (mediaId, proxyPath) => {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      const asset = draft.mediaPool.find((a) => a.id === mediaId);
      if (asset) asset.proxyPath = proxyPath;
    });
    if (next === current) return;
    // Proxy path is a per-machine cache reference — mark dirty so the save round-trip records it,
    // but don't push undo history (this is generated state, not a user edit).
    set({ project: next, isDirty: true });
    notifyDirty(true);
  },

  addClipToTrack: (trackId, clip) => {
    const current = get().project;
    if (!current) return;
    const track = findTrack(current, trackId);
    if (!track) return;
    const next = produce(current, (draft) => {
      const t = draft.tracks.find((tr) => tr.id === trackId);
      if (!t) return;
      const start = resolveNonOverlap(t, clip.trackTime, clip.duration);
      t.clips.push({ ...clip, trackTime: start });
      t.clips.sort((a, b) => a.trackTime - b.trackTime);
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  addClipsBulk: (items) => {
    const current = get().project;
    if (!current || items.length === 0) return [];
    const newIds: string[] = [];
    const next = produce(current, (draft) => {
      for (const { trackId, clip } of items) {
        const t = draft.tracks.find((tr) => tr.id === trackId);
        if (!t) continue;
        const start = resolveNonOverlap(t, clip.trackTime, clip.duration);
        const placed: Clip = { ...clip, trackTime: start };
        t.clips.push(placed);
        newIds.push(placed.id);
      }
      for (const t of draft.tracks) {
        t.clips.sort((a, b) => a.trackTime - b.trackTime);
      }
    });
    if (next === current) return [];
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
    return newIds;
  },

  moveClip: (clipId, targetTrackId, newTrackTime) => {
    const current = get().project;
    if (!current) return;
    const located = findClipLocation(current, clipId);
    if (!located) return;
    const targetTrack = findTrack(current, targetTrackId);
    if (!targetTrack) return;
    // Disallow moving between video and audio tracks (FR-038).
    if (targetTrack.kind !== located.track.kind) return;

    const next = produce(current, (draft) => {
      const sourceTrack = draft.tracks.find((t) => t.id === located.track.id);
      const destTrack = draft.tracks.find((t) => t.id === targetTrackId);
      if (!sourceTrack || !destTrack) return;
      const clipIdx = sourceTrack.clips.findIndex((c) => c.id === clipId);
      if (clipIdx < 0) return;
      const [moved] = sourceTrack.clips.splice(clipIdx, 1);
      const ignoreId = sourceTrack.id === destTrack.id ? clipId : undefined;
      const resolved = resolveNonOverlap(destTrack, newTrackTime, moved.duration, ignoreId);
      moved.trackTime = resolved;
      destTrack.clips.push(moved);
      destTrack.clips.sort((a, b) => a.trackTime - b.trackTime);
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  trimClip: (clipId, edge, newTrackTime) => {
    const current = get().project;
    if (!current) return;
    const located = findClipLocation(current, clipId);
    if (!located) return;
    const asset = current.mediaPool.find((a) => a.id === located.clip.mediaId);
    if (!asset) return;
    const ripple = get().rippleEnabled;

    const next = produce(current, (draft) => {
      const t = draft.tracks.find((tr) => tr.id === located.track.id);
      if (!t) return;
      const c = t.clips.find((cl) => cl.id === clipId);
      if (!c) return;
      const others = t.clips
        .filter((other) => other.id !== clipId)
        .sort((a, b) => a.trackTime - b.trackTime);
      if (edge === 'start') {
        const prev = others.filter((o) => o.trackTime + o.duration <= c.trackTime + EPS).pop();
        const minStart = Math.max(0, prev ? prev.trackTime + prev.duration : 0);
        const sourceBudget = c.sourceIn;
        const minStartBySource = c.trackTime - sourceBudget;
        const maxStart = c.trackTime + c.duration - 0.1;
        let proposed = Math.max(minStart, minStartBySource, Math.min(newTrackTime, maxStart));
        const delta = proposed - c.trackTime;
        c.trackTime = proposed;
        c.sourceIn = Math.max(0, c.sourceIn + delta);
        c.duration = Math.max(0.1, c.duration - delta);
      } else {
        const oldEnd = c.trackTime + c.duration;
        const nextClip = others.find((o) => o.trackTime >= oldEnd - EPS);
        const maxEnd = ripple || !nextClip ? Number.POSITIVE_INFINITY : nextClip.trackTime;
        const maxBySource = c.trackTime + (asset.duration - c.sourceIn);
        const minEnd = c.trackTime + 0.1;
        const proposed = Math.min(maxEnd, maxBySource, Math.max(newTrackTime, minEnd));
        const newDuration = Math.max(0.1, proposed - c.trackTime);
        const delta = (c.trackTime + newDuration) - oldEnd;
        c.duration = newDuration;
        if (ripple && Math.abs(delta) > 1e-6) {
          for (const other of t.clips) {
            if (other.id === clipId) continue;
            if (other.trackTime >= oldEnd - EPS) {
              other.trackTime = Math.max(0, other.trackTime + delta);
            }
          }
          t.clips.sort((a, b) => a.trackTime - b.trackTime);
        }
      }
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  splitClipAt: (clipId, trackTime) => {
    const current = get().project;
    if (!current) return;
    const located = findClipLocation(current, clipId);
    if (!located) return;
    const { clip } = located;
    // Split position must be strictly inside the clip; reject otherwise.
    const startEnd = clip.trackTime + clip.duration;
    if (trackTime <= clip.trackTime + EPS || trackTime >= startEnd - EPS) return;

    const rightDuration = startEnd - trackTime;
    const leftDuration = trackTime - clip.trackTime;
    const sourceAtCut = clip.sourceIn + leftDuration;

    const next = produce(current, (draft) => {
      const t = draft.tracks.find((tr) => tr.id === located.track.id);
      if (!t) return;
      const idx = t.clips.findIndex((c) => c.id === clipId);
      if (idx < 0) return;
      const left = t.clips[idx];
      // FR-056: both halves preserve speed/volume/effects. Fades collapse at the cut edge:
      // the left half keeps fadeIn but loses fadeOut; the right half keeps fadeOut but loses fadeIn.
      const right: Clip = {
        id: nanoid(),
        mediaId: left.mediaId,
        trackTime: trackTime,
        sourceIn: sourceAtCut,
        duration: rightDuration,
        speed: left.speed,
        reversed: left.reversed,
        volume: left.volume,
        fadeInDuration: 0,
        fadeOutDuration: left.fadeOutDuration,
        effects: left.effects.map((e) => ({ ...e, id: nanoid() })),
        linkedClipId: left.linkedClipId
      };
      left.duration = leftDuration;
      left.fadeOutDuration = 0;
      t.clips.splice(idx + 1, 0, right);
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  removeClips: (clipIds) => {
    const current = get().project;
    if (!current || clipIds.length === 0) return;
    const idSet = new Set(clipIds);
    const next = produce(current, (draft) => {
      for (const t of draft.tracks) {
        t.clips = t.clips.filter((c) => !idSet.has(c.id));
      }
    });
    if (next === current) return;
    set({
      ...applyEdit(current, next, get().past),
      selectedClipIds: []
    });
    notifyDirty(true);
  },

  rippleDeleteClips: (clipIds) => {
    const current = get().project;
    if (!current || clipIds.length === 0) return;
    const idSet = new Set(clipIds);
    const next = produce(current, (draft) => {
      for (const t of draft.tracks) {
        const removed = t.clips.filter((c) => idSet.has(c.id));
        if (removed.length === 0) continue;
        // Process rightmost removals first so earlier shifts don't disturb later math.
        removed.sort((a, b) => b.trackTime - a.trackTime);
        t.clips = t.clips.filter((c) => !idSet.has(c.id));
        for (const r of removed) {
          for (const c of t.clips) {
            if (c.trackTime >= r.trackTime + r.duration - EPS) {
              c.trackTime = Math.max(0, c.trackTime - r.duration);
            }
          }
        }
        t.clips.sort((a, b) => a.trackTime - b.trackTime);
      }
    });
    if (next === current) return;
    set({
      ...applyEdit(current, next, get().past),
      selectedClipIds: []
    });
    notifyDirty(true);
  },

  selectClips: (ids, mode = 'set') => {
    const current = get().selectedClipIds;
    if (mode === 'set') {
      set({ selectedClipIds: [...new Set(ids)] });
      return;
    }
    if (mode === 'add') {
      set({ selectedClipIds: [...new Set([...current, ...ids])] });
      return;
    }
    // toggle
    const out = new Set(current);
    for (const id of ids) {
      if (out.has(id)) out.delete(id);
      else out.add(id);
    }
    set({ selectedClipIds: [...out] });
  },

  clearSelection: () => set({ selectedClipIds: [] }),

  setToolMode: (mode) => set({ toolMode: mode }),

  setPlayhead: (seconds) => {
    const current = get().project;
    if (!current) return;
    const clamped = Math.max(0, seconds);
    if (Math.abs(clamped - current.playhead) < 1e-6) return;
    const next = produce(current, (draft) => {
      draft.playhead = clamped;
    });
    // Playhead is not an editing op — does not push history, does not dirty.
    set({ project: next });
  },

  setInPoint: (seconds) => {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      draft.inPoint = seconds;
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  setOutPoint: (seconds) => {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      draft.outPoint = seconds;
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setRippleEnabled: (rippleEnabled) => set({ rippleEnabled }),

  addTrack: (kind) => {
    const current = get().project;
    if (!current) return;
    const sameKind = current.tracks.filter((t) => t.kind === kind);
    if (sameKind.length >= MAX_TRACKS_PER_KIND) return;
    const usedNumbers = sameKind
      .map((t) => Number.parseInt(t.name.replace(/^\D+/, ''), 10))
      .filter((n) => Number.isFinite(n));
    const nextN = (usedNumbers.length ? Math.max(...usedNumbers) : 0) + 1;
    const newTrack: Track = {
      id: nanoid(),
      kind,
      name: `${kind === 'video' ? 'V' : 'A'}${nextN}`,
      clips: [],
      muted: false,
      locked: false,
      soloed: false,
      hidden: false,
      height: kind === 'video' ? 80 : 60
    };
    const next = produce(current, (draft) => {
      if (kind === 'video') {
        draft.tracks.unshift(newTrack);
      } else {
        draft.tracks.push(newTrack);
      }
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  removeTrack: (trackId) => {
    const current = get().project;
    if (!current) return;
    const track = findTrack(current, trackId);
    if (!track) return;
    const next = produce(current, (draft) => {
      draft.tracks = draft.tracks.filter((t) => t.id !== trackId);
    });
    if (next === current) return;
    const removedClipIds = new Set(track.clips.map((c) => c.id));
    set({
      ...applyEdit(current, next, get().past),
      selectedClipIds: get().selectedClipIds.filter((id) => !removedClipIds.has(id))
    });
    notifyDirty(true);
  },

  setTrackFlag: (trackId, flag, value) => {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      const t = draft.tracks.find((tr) => tr.id === trackId);
      if (!t) return;
      t[flag] = value;
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  setClipVolume: (clipId, volume) => {
    const current = get().project;
    if (!current) return;
    const clamped = Math.max(0, Math.min(2, volume));
    const next = produce(current, (draft) => {
      for (const t of draft.tracks) {
        const c = t.clips.find((cl) => cl.id === clipId);
        if (c) {
          c.volume = clamped;
          return;
        }
      }
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  setClipColor: (clipId, type, value) => {
    const current = get().project;
    if (!current) return;
    if (!COLOR_EFFECT_TYPES.includes(type)) return;
    const clamped = Math.max(-100, Math.min(100, value));
    const next = produce(current, (draft) => {
      for (const t of draft.tracks) {
        const c = t.clips.find((cl) => cl.id === clipId);
        if (c) {
          c.effects = withColorValue(c.effects, type, clamped, nanoid);
          return;
        }
      }
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  resetClipColor: (clipId) => {
    const current = get().project;
    if (!current) return;
    const next = produce(current, (draft) => {
      for (const t of draft.tracks) {
        const c = t.clips.find((cl) => cl.id === clipId);
        if (c) {
          c.effects = withoutColorEffects(c.effects);
          return;
        }
      }
    });
    if (next === current) return;
    set(applyEdit(current, next, get().past));
    notifyDirty(true);
  },

  undo: () => {
    const { past, future, project } = get();
    if (past.length === 0 || !project) return;
    const previous = past[past.length - 1];
    set({
      project: previous,
      past: past.slice(0, -1),
      future: [project, ...future],
      isDirty: true,
      selectedClipIds: []
    });
    notifyDirty(true);
  },

  redo: () => {
    const { past, future, project } = get();
    if (future.length === 0 || !project) return;
    const next = future[0];
    set({
      project: next,
      past: [...past, project],
      future: future.slice(1),
      isDirty: true,
      selectedClipIds: []
    });
    notifyDirty(true);
  },

  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null })
}));

/** Derived: total project duration = rightmost clip end across all tracks. */
export function projectDuration(project: Project): number {
  let max = 0;
  for (const t of project.tracks) {
    for (const c of t.clips) {
      const end = c.trackTime + c.duration;
      if (end > max) max = end;
    }
  }
  return max;
}
