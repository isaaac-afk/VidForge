import { useMemo, type DragEvent } from 'react';
import type { Track as TrackModel, MediaAsset } from '@shared/models';
import { Clip } from './Clip';
import { useProjectStore } from '../../store/project';
import { useProjectActions } from '../../hooks/useProjectActions';
import { clipFromAsset } from '@shared/clipFactory';

interface TrackProps {
  track: TrackModel;
  zoom: number;
  /** All media assets keyed by id for clip lookups. */
  assetsById: Map<string, MediaAsset>;
  playhead: number;
  /** Visible width of the track row (== timeline width in seconds × zoom). */
  widthPx: number;
}

export function Track({ track, zoom, assetsById, playhead, widthPx }: TrackProps) {
  const project = useProjectStore((s) => s.project);
  const addClipToTrack = useProjectStore((s) => s.addClipToTrack);
  const { importMediaByPaths } = useProjectActions();

  // Snap targets: every clip edge across the project except the dragged clip's own edges.
  const snapTargets = useMemo(() => {
    if (!project) return [] as number[];
    const out: number[] = [0];
    for (const t of project.tracks) {
      for (const c of t.clips) {
        out.push(c.trackTime, c.trackTime + c.duration);
      }
    }
    return out;
  }, [project]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/x-vidforge-asset') || e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!project) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dropX = e.clientX - rect.left + e.currentTarget.scrollLeft;
    const trackTime = Math.max(0, dropX / zoom);

    // Asset dragged from MediaBin.
    const assetId = e.dataTransfer.getData('application/x-vidforge-asset');
    if (assetId) {
      const asset = project.mediaPool.find((a) => a.id === assetId);
      if (!asset) return;
      // Disallow video assets on audio tracks and vice versa. Images go on video tracks.
      if (track.kind === 'video' && asset.type === 'audio') return;
      if (track.kind === 'audio' && asset.type !== 'audio') return;
      const clip = clipFromAsset({ asset, trackTime });
      addClipToTrack(track.id, clip);
      return;
    }

    // External file drop — import then place on this track.
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const paths = files
      .map((f) => window.api.system.getPathForFile(f))
      .filter((p): p is string => Boolean(p));
    if (paths.length === 0) return;
    const before = new Set(project.mediaPool.map((a) => a.id));
    await importMediaByPaths(paths);
    // Place every newly imported compatible asset sequentially starting at the drop point.
    const after = useProjectStore.getState().project;
    if (!after) return;
    let cursor = trackTime;
    for (const asset of after.mediaPool) {
      if (before.has(asset.id)) continue;
      if (track.kind === 'video' && asset.type === 'audio') continue;
      if (track.kind === 'audio' && asset.type !== 'audio') continue;
      const clip = clipFromAsset({ asset, trackTime: cursor });
      addClipToTrack(track.id, clip);
      cursor += clip.duration;
    }
  };

  return (
    <div
      data-track-id={track.id}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative border-b border-[var(--border)] bg-[var(--bg-track)]"
      style={{ height: track.height, width: widthPx }}
    >
      {track.clips.map((c) => (
        <Clip
          key={c.id}
          clip={c}
          track={track}
          asset={assetsById.get(c.mediaId)}
          zoom={zoom}
          trackHeight={track.height}
          snapTargets={snapTargets.filter(
            (t) => Math.abs(t - c.trackTime) > 1e-6 && Math.abs(t - (c.trackTime + c.duration)) > 1e-6
          )}
          playhead={playhead}
        />
      ))}
    </div>
  );
}
