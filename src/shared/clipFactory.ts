import { nanoid } from 'nanoid';
import type { Clip, MediaAsset } from './models';

export interface NewClipFromAssetParams {
  asset: MediaAsset;
  trackTime: number;
  /** Optional: pre-trim source in/out. Defaults to full asset. */
  sourceIn?: number;
  duration?: number;
}

export function clipFromAsset(params: NewClipFromAssetParams): Clip {
  const { asset, trackTime } = params;
  const sourceIn = params.sourceIn ?? 0;
  const duration = params.duration ?? Math.max(0.1, asset.duration - sourceIn);
  return {
    id: nanoid(),
    mediaId: asset.id,
    trackTime: Math.max(0, trackTime),
    sourceIn,
    duration,
    speed: 1,
    reversed: false,
    volume: 1,
    fadeInDuration: 0,
    fadeOutDuration: 0,
    effects: []
  };
}
