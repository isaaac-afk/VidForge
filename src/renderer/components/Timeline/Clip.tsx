import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Clip as ClipModel, MediaAsset, Track } from '@shared/models';
import { useProjectStore } from '../../store/project';
import { formatDuration } from '../../lib/timecode';

const SNAP_PX = 8;
const TRIM_HANDLE_PX = 6;

interface ClipProps {
  clip: ClipModel;
  track: Track;
  asset: MediaAsset | undefined;
  zoom: number;
  trackHeight: number;
  /** Other clip-edge times in this track (excluding this clip's edges) — used for snap. */
  snapTargets: number[];
  /** Playhead position for snap. */
  playhead: number;
}

type DragMode =
  | { kind: 'move'; startTrackTime: number; startPointerX: number; startPointerY: number }
  | { kind: 'trim'; edge: 'start' | 'end'; startPointerX: number }
  | null;

function snapToTargets(value: number, targets: number[], zoom: number): number {
  let best = value;
  let bestDist = SNAP_PX;
  for (const t of targets) {
    const dist = Math.abs((value - t) * zoom);
    if (dist < bestDist) {
      best = t;
      bestDist = dist;
    }
  }
  return best;
}

export function Clip({ clip, track, asset, zoom, trackHeight, snapTargets, playhead }: ClipProps) {
  const left = clip.trackTime * zoom;
  const width = Math.max(2, clip.duration * zoom);
  const selectedIds = useProjectStore((s) => s.selectedClipIds);
  const selectClips = useProjectStore((s) => s.selectClips);
  const moveClip = useProjectStore((s) => s.moveClip);
  const trimClip = useProjectStore((s) => s.trimClip);
  const snapEnabled = useProjectStore((s) => s.snapEnabled);
  const tracks = useProjectStore((s) => s.project?.tracks ?? []);
  const isSelected = selectedIds.includes(clip.id);

  const elRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode>(null);
  const [previewLeft, setPreviewLeft] = useState<number | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const toolMode = useProjectStore((s) => s.toolMode);
  const splitClipAt = useProjectStore((s) => s.splitClipAt);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    // Razor tool (FR-050): clicking on a clip splits it at the click point.
    if (toolMode === 'razor') {
      const rect = elRef.current!.getBoundingClientRect();
      const offsetInClip = e.clientX - rect.left;
      const splitTime = clip.trackTime + offsetInClip / zoom;
      splitClipAt(clip.id, splitTime);
      return;
    }

    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    selectClips([clip.id], additive ? 'toggle' : 'set');

    const rect = elRef.current!.getBoundingClientRect();
    const offsetInClip = e.clientX - rect.left;
    if (offsetInClip <= TRIM_HANDLE_PX) {
      dragRef.current = { kind: 'trim', edge: 'start', startPointerX: e.clientX };
    } else if (offsetInClip >= rect.width - TRIM_HANDLE_PX) {
      dragRef.current = { kind: 'trim', edge: 'end', startPointerX: e.clientX };
    } else {
      dragRef.current = {
        kind: 'move',
        startTrackTime: clip.trackTime,
        startPointerX: e.clientX,
        startPointerY: e.clientY
      };
    }
    elRef.current!.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'move') {
      const dx = e.clientX - drag.startPointerX;
      let next = drag.startTrackTime + dx / zoom;
      if (snapEnabled) {
        const candidate = snapToTargets(next, [...snapTargets, playhead], zoom);
        next = candidate;
      }
      setPreviewLeft(Math.max(0, next) * zoom);
      return;
    }
    // trim
    const dx = e.clientX - drag.startPointerX;
    if (drag.edge === 'start') {
      let newStart = clip.trackTime + dx / zoom;
      if (snapEnabled) {
        newStart = snapToTargets(newStart, [...snapTargets, playhead], zoom);
      }
      const newStartPx = Math.max(0, newStart) * zoom;
      const endPx = (clip.trackTime + clip.duration) * zoom;
      setPreviewLeft(newStartPx);
      setPreviewWidth(Math.max(2, endPx - newStartPx));
    } else {
      let newEnd = clip.trackTime + clip.duration + dx / zoom;
      if (snapEnabled) {
        newEnd = snapToTargets(newEnd, [...snapTargets, playhead], zoom);
      }
      const endPx = Math.max(clip.trackTime * zoom + 2, newEnd * zoom);
      setPreviewWidth(endPx - clip.trackTime * zoom);
    }
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setPreviewLeft(null);
    setPreviewWidth(null);
    if (!drag) return;
    if (drag.kind === 'move') {
      const dx = e.clientX - drag.startPointerX;
      const dy = e.clientY - drag.startPointerY;
      let newTime = drag.startTrackTime + dx / zoom;
      if (snapEnabled) {
        newTime = snapToTargets(newTime, [...snapTargets, playhead], zoom);
      }
      // Vertical drop targeting — pick the track-of-same-kind whose row contains the pointer.
      let targetTrackId = track.id;
      if (Math.abs(dy) > trackHeight * 0.5) {
        const sameKind = tracks.filter((t) => t.kind === track.kind);
        const allRows = elRef.current?.closest('[data-tracks-root]')?.querySelectorAll('[data-track-id]');
        if (allRows) {
          for (const row of allRows) {
            const rRect = (row as HTMLElement).getBoundingClientRect();
            if (e.clientY >= rRect.top && e.clientY <= rRect.bottom) {
              const tid = (row as HTMLElement).dataset.trackId;
              if (tid && sameKind.some((t) => t.id === tid)) {
                targetTrackId = tid;
              }
              break;
            }
          }
        }
      }
      moveClip(clip.id, targetTrackId, Math.max(0, newTime));
      return;
    }
    // trim
    const dx = e.clientX - drag.startPointerX;
    if (drag.edge === 'start') {
      let newStart = clip.trackTime + dx / zoom;
      if (snapEnabled) {
        newStart = snapToTargets(newStart, [...snapTargets, playhead], zoom);
      }
      trimClip(clip.id, 'start', Math.max(0, newStart));
    } else {
      let newEnd = clip.trackTime + clip.duration + dx / zoom;
      if (snapEnabled) {
        newEnd = snapToTargets(newEnd, [...snapTargets, playhead], zoom);
      }
      trimClip(clip.id, 'end', newEnd);
    }
  };

  const visibleLeft = previewLeft ?? left;
  const visibleWidth = previewWidth ?? width;
  const isAudio = track.kind === 'audio';

  return (
    <div
      ref={elRef}
      data-clip-id={clip.id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`absolute top-1 select-none overflow-hidden rounded text-[10px] text-white ${
        toolMode === 'razor' ? 'cursor-[crosshair]' : 'cursor-grab'
      } ${isAudio ? 'bg-[var(--bg-clip-audio)]' : 'bg-[var(--bg-clip-video)]'} ${
        isSelected ? 'ring-2 ring-[var(--accent)]' : 'ring-1 ring-black/20'
      }`}
      style={{ left: visibleLeft, width: visibleWidth, height: trackHeight - 8 }}
      title={asset?.fileName}
    >
      {/* Video thumbnail strip — repeated thumbnail at low cost. Phase 4 can swap for per-second frames. */}
      {!isAudio && asset?.thumbnailPath && (
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: `url(${asset.thumbnailPath})`,
            backgroundRepeat: 'repeat-x',
            backgroundSize: 'auto 100%'
          }}
        />
      )}
      {/* Trim handles */}
      <div className="pointer-events-none absolute left-0 top-0 h-full w-[6px] bg-black/30" />
      <div className="pointer-events-none absolute right-0 top-0 h-full w-[6px] bg-black/30" />
      <div className="pointer-events-none relative flex h-full flex-col justify-between px-2 py-1 mix-blend-normal">
        <div className="truncate font-medium">{asset?.fileName ?? '(missing)'}</div>
        <div className="text-[9px] opacity-80">{formatDuration(clip.duration)}</div>
      </div>
      {isAudio && asset && (
        <WaveformOverlay clipId={clip.id} mediaId={asset.id} filePath={asset.filePath}
          sourceIn={clip.sourceIn} duration={clip.duration} zoom={zoom} height={trackHeight - 8} />
      )}
    </div>
  );
}

interface WaveformOverlayProps {
  clipId: string;
  mediaId: string;
  filePath: string;
  sourceIn: number;
  duration: number;
  zoom: number;
  height: number;
}

/**
 * Renders a cached waveform onto a canvas overlay. Peaks are fetched once per mediaId
 * and cached in module-level memory; per-clip rendering just slices into them.
 */
const waveformCache = new Map<string, Promise<number[]> | number[]>();

function loadPeaks(mediaId: string, filePath: string): Promise<number[]> {
  const cached = waveformCache.get(mediaId);
  if (cached) return Promise.resolve(cached as number[] | Promise<number[]>);
  const promise = window.api.media
    .generateWaveform(mediaId, filePath)
    .then((res) => {
      waveformCache.set(mediaId, res.peaks);
      return res.peaks;
    })
    .catch((err) => {
      waveformCache.delete(mediaId);
      throw err;
    });
  waveformCache.set(mediaId, promise);
  return promise;
}

function WaveformOverlay({ mediaId, filePath, sourceIn, duration, zoom, height }: WaveformOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPeaks(mediaId, filePath)
      .then((p) => {
        if (!cancelled) setPeaks(p);
      })
      .catch(() => {/* swallow; clip just renders without a waveform */});
    return () => {
      cancelled = true;
    };
  }, [mediaId, filePath]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const widthCss = Math.max(2, duration * zoom);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(widthCss * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${widthCss}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, widthCss, height);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const SR = 100; // PEAKS_PER_SECOND
    const startSample = Math.floor(sourceIn * SR);
    const endSample = Math.floor((sourceIn + duration) * SR);
    const samples = endSample - startSample;
    if (samples <= 0) return;
    const mid = height / 2;
    for (let x = 0; x < widthCss; x++) {
      const s0 = startSample + Math.floor((x / widthCss) * samples);
      const s1 = startSample + Math.floor(((x + 1) / widthCss) * samples);
      let peak = 0;
      for (let i = s0; i < s1 && i < peaks.length; i++) {
        const v = peaks[i];
        if (v > peak) peak = v;
      }
      const h = peak * (height * 0.85);
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }, [peaks, zoom, sourceIn, duration, height]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />;
}
