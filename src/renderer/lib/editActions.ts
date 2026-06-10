import { nanoid } from 'nanoid';
import type { Clip } from '@shared/models';
import { useProjectStore } from '../store/project';
import { useClipboardStore, type ClipboardEntry } from '../store/clipboard';

function locate(clipId: string): { trackId: string; clip: Clip } | null {
  const project = useProjectStore.getState().project;
  if (!project) return null;
  for (const t of project.tracks) {
    const c = t.clips.find((cl) => cl.id === clipId);
    if (c) return { trackId: t.id, clip: c };
  }
  return null;
}

function cloneClip(clip: Clip, newTrackTime: number): Clip {
  return {
    id: nanoid(),
    mediaId: clip.mediaId,
    trackTime: Math.max(0, newTrackTime),
    sourceIn: clip.sourceIn,
    duration: clip.duration,
    speed: clip.speed,
    reversed: clip.reversed,
    volume: clip.volume,
    fadeInDuration: clip.fadeInDuration,
    fadeOutDuration: clip.fadeOutDuration,
    effects: clip.effects.map((e) => ({ ...e, id: nanoid() })),
    linkedClipId: undefined
  };
}

export function copySelection(cut: boolean): boolean {
  const ids = useProjectStore.getState().selectedClipIds;
  if (ids.length === 0) return false;
  const project = useProjectStore.getState().project;
  if (!project) return false;
  const entries: ClipboardEntry[] = [];
  for (const id of ids) {
    const loc = locate(id);
    if (!loc) continue;
    const track = project.tracks.find((t) => t.id === loc.trackId);
    if (!track) continue;
    entries.push({
      clip: loc.clip,
      sourceTrackId: loc.trackId,
      sourceTrackKind: track.kind
    });
  }
  if (entries.length === 0) return false;
  useClipboardStore.getState().setEntries(entries);
  if (cut) {
    useProjectStore.getState().removeClips(ids);
  }
  return true;
}

export function pasteAtPlayhead(): void {
  const entries = useClipboardStore.getState().entries;
  if (entries.length === 0) return;
  const project = useProjectStore.getState().project;
  if (!project) return;
  const minTrackTime = Math.min(...entries.map((e) => e.clip.trackTime));
  const playhead = project.playhead;
  const items: Array<{ trackId: string; clip: Clip }> = [];
  for (const entry of entries) {
    const targetTrackId = project.tracks.some((t) => t.id === entry.sourceTrackId)
      ? entry.sourceTrackId
      : project.tracks.find((t) => t.kind === entry.sourceTrackKind)?.id;
    if (!targetTrackId) continue;
    const offset = entry.clip.trackTime - minTrackTime;
    items.push({ trackId: targetTrackId, clip: cloneClip(entry.clip, playhead + offset) });
  }
  const newIds = useProjectStore.getState().addClipsBulk(items);
  if (newIds.length > 0) {
    useProjectStore.getState().selectClips(newIds);
  }
}

export function selectAllClips(): void {
  const project = useProjectStore.getState().project;
  if (!project) return;
  useProjectStore.getState().selectClips(
    project.tracks.flatMap((t) => t.clips.map((c) => c.id))
  );
}

export function deleteSelected(ripple: boolean): void {
  const ids = useProjectStore.getState().selectedClipIds;
  if (ids.length === 0) return;
  if (ripple) useProjectStore.getState().rippleDeleteClips(ids);
  else useProjectStore.getState().removeClips(ids);
}
