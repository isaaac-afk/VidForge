import { create } from 'zustand';
import type { Clip } from '@shared/models';

/**
 * Each entry remembers which track a clip came from so paste can route it back to the
 * same track when possible. Track-relative offsets are kept by snapshotting the original
 * trackTime — paste re-anchors to the playhead and preserves spacing between clips.
 */
export interface ClipboardEntry {
  /** A deep-cloned clip with its original IDs intact (a fresh ID is minted on paste). */
  clip: Clip;
  /** Track ID this clip was copied from. */
  sourceTrackId: string;
  /** 'video' | 'audio' — drives target-track selection when sourceTrackId is gone. */
  sourceTrackKind: 'video' | 'audio';
}

interface ClipboardState {
  entries: ClipboardEntry[];
  setEntries: (entries: ClipboardEntry[]) => void;
  clear: () => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  entries: [],
  setEntries: (entries) => set({ entries }),
  clear: () => set({ entries: [] })
}));
