import { create } from 'zustand';

/**
 * Transient transport state. Kept separate from the project store because none of
 * it is persisted to .vedit (playhead lives on Project, but playback rate/playing
 * state are renderer-only).
 */
interface PlaybackState {
  playing: boolean;
  /** Negative rate = reverse playback. Preview drives the <video> element manually in reverse
   *  because Chromium clamps native negative playbackRate to 0. */
  rate: number;
  /** FR-068: when true and both in/out points are set, playhead wraps from out → in. */
  loopEnabled: boolean;
  /** FR-082: master monitor gain for the Preview element. Does not affect export. 0..2. */
  masterVolume: number;
  setPlaying: (playing: boolean) => void;
  setRate: (rate: number) => void;
  togglePlay: () => void;
  toggleLoop: () => void;
  setLoopEnabled: (enabled: boolean) => void;
  setMasterVolume: (v: number) => void;
  /** J / K / L shuttle controls per FR-064. */
  shuttle: (direction: 'j' | 'k' | 'l') => void;
}

const FORWARD_RATES = [1, 2, 4, 8];
const REVERSE_RATES = [-1, -2, -4, -8];

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  playing: false,
  rate: 1,
  loopEnabled: false,
  masterVolume: 1,

  setPlaying: (playing) => set({ playing }),
  setRate: (rate) => set({ rate }),
  setMasterVolume: (v) => set({ masterVolume: Math.max(0, Math.min(2, v)) }),

  togglePlay: () => {
    const { playing } = get();
    set({ playing: !playing, rate: !playing ? Math.abs(get().rate) || 1 : get().rate });
  },

  toggleLoop: () => set({ loopEnabled: !get().loopEnabled }),
  setLoopEnabled: (loopEnabled) => set({ loopEnabled }),

  shuttle: (direction) => {
    const { rate, playing } = get();
    if (direction === 'k') {
      set({ playing: false, rate: 1 });
      return;
    }
    if (direction === 'l') {
      // Forward shuttle: if already playing forward, step up; else jump to 1×.
      if (playing && rate > 0) {
        const idx = FORWARD_RATES.indexOf(rate);
        const next = idx >= 0 && idx < FORWARD_RATES.length - 1 ? FORWARD_RATES[idx + 1] : 1;
        set({ rate: next, playing: true });
      } else {
        set({ rate: 1, playing: true });
      }
      return;
    }
    // 'j' — reverse shuttle.
    if (playing && rate < 0) {
      const idx = REVERSE_RATES.indexOf(rate);
      const next = idx >= 0 && idx < REVERSE_RATES.length - 1 ? REVERSE_RATES[idx + 1] : -1;
      set({ rate: next, playing: true });
    } else {
      set({ rate: -1, playing: true });
    }
  }
}));
