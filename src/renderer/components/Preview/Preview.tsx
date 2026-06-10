import { useEffect, useMemo, useRef } from 'react';
import type { Clip, MediaAsset, Project, Track } from '@shared/models';
import { projectDuration, useProjectStore } from '../../store/project';
import { usePlaybackStore } from '../../store/playback';
import { formatTimecode } from '../../lib/timecode';
import { cssFilterFor } from '@shared/colorCorrection';

interface ActiveSource {
  clip: Clip;
  asset: MediaAsset;
  track: Track;
  /** Position within source media (seconds) corresponding to playhead. */
  sourceTime: number;
}

function findActiveVideoSource(project: Project): ActiveSource | null {
  // Topmost track first (FR-070: render the topmost enabled video track).
  for (const track of project.tracks) {
    if (track.kind !== 'video') continue;
    if (track.hidden) continue;
    const hit = track.clips.find(
      (c) => c.trackTime <= project.playhead && project.playhead < c.trackTime + c.duration
    );
    if (!hit) continue;
    const asset = project.mediaPool.find((a) => a.id === hit.mediaId);
    if (!asset || asset.type === 'audio') continue;
    const sourceTime = hit.sourceIn + (project.playhead - hit.trackTime);
    return { clip: hit, asset, track, sourceTime };
  }
  return null;
}

export function Preview() {
  const project = useProjectStore((s) => s.project);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);

  const playing = usePlaybackStore((s) => s.playing);
  const rate = usePlaybackStore((s) => s.rate);
  const loopEnabled = usePlaybackStore((s) => s.loopEnabled);
  const masterVolume = usePlaybackStore((s) => s.masterVolume);
  const setPlaying = usePlaybackStore((s) => s.setPlaying);

  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const lastSrcRef = useRef<string | null>(null);

  const active = useMemo(() => (project ? findActiveVideoSource(project) : null), [
    project?.playhead,
    project?.tracks,
    project?.mediaPool,
    project
  ]);

  const totalDuration = useMemo(() => (project ? projectDuration(project) : 0), [project]);

  // Drive the playhead with rAF while playing — supports playback even when no clip is under
  // the cursor (we still advance and just show a black frame).
  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTickRef.current = 0;
      return;
    }
    const tick = (ts: number) => {
      if (lastTickRef.current === 0) {
        lastTickRef.current = ts;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const dt = (ts - lastTickRef.current) / 1000;
      lastTickRef.current = ts;
      const current = useProjectStore.getState().project;
      if (!current) return;
      const next = current.playhead + dt * rate;

      // FR-068: loop between in/out points when loop mode is on.
      const loop = usePlaybackStore.getState().loopEnabled;
      const inP = current.inPoint;
      const outP = current.outPoint;
      if (loop && inP !== null && outP !== null && outP > inP) {
        if (rate > 0 && next >= outP) {
          setPlayhead(inP);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        if (rate < 0 && next <= inP) {
          setPlayhead(outP);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      if (next >= totalDuration && rate > 0) {
        setPlayhead(totalDuration);
        setPlaying(false);
        return;
      }
      if (next <= 0 && rate < 0) {
        setPlayhead(0);
        setPlaying(false);
        return;
      }
      setPlayhead(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTickRef.current = 0;
    };
  }, [playing, rate, totalDuration, setPlayhead, setPlaying]);

  // Sync <video> element with active clip + playhead.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!active) {
      if (lastSrcRef.current) {
        v.removeAttribute('src');
        v.load();
        lastSrcRef.current = null;
      }
      return;
    }
    // FR-131: prefer proxy for preview when one exists; export still uses the original.
    const url = active.asset.proxyPath
      ? window.api.media.proxyUrl(active.asset.id)
      : window.api.media.sourceUrl(active.asset.filePath);
    if (lastSrcRef.current !== url) {
      v.src = url;
      lastSrcRef.current = url;
    }
    // In reverse-playback mode, Chromium clamps negative playbackRate to 0 (no native reverse).
    // We drive reverse manually: pause the element and seek every rAF tick. This yields
    // frame-stepped reverse playback — choppy at keyframe density but functional.
    const isReverse = playing && rate < 0;
    const driftThreshold = isReverse ? 0 : 0.05;
    if (isReverse || Math.abs(v.currentTime - active.sourceTime) > driftThreshold) {
      try {
        v.currentTime = Math.max(0, active.sourceTime);
      } catch {
        // metadata not loaded yet — handled in onLoadedMetadata.
      }
    }
    // Master volume × clip volume × the track-on-video-clip volume monitor.
    v.volume = Math.max(0, Math.min(1, masterVolume * active.clip.volume));
    v.muted = active.track.muted || v.volume === 0;
    if (playing && rate > 0) {
      v.playbackRate = Math.min(16, Math.max(0.0625, rate));
      v.play().catch(() => {/* autoplay gesture restrictions don't apply in Electron */});
    } else {
      v.pause();
    }
  }, [active, playing, rate, masterVolume]);

  const handleVideoMetadata = () => {
    const v = videoRef.current;
    if (!v || !active) return;
    if (Math.abs(v.currentTime - active.sourceTime) > 0.05) {
      try {
        v.currentTime = Math.max(0, active.sourceTime);
      } catch {/* noop */}
    }
  };

  if (!project) return null;

  return (
    <section className="flex flex-1 flex-col bg-black/40">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {active ? (
          <video
            ref={videoRef}
            onLoadedMetadata={handleVideoMetadata}
            className="max-h-full max-w-full bg-black"
            style={{ filter: cssFilterFor(active.clip) }}
            muted={false}
            playsInline
          />
        ) : (
          <div className="text-center text-sm text-[var(--text-secondary)]">
            <div className="text-xs uppercase tracking-wide">No clip under playhead</div>
            <div className="mt-1 text-[10px]">Drop video onto a track to begin.</div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlayhead(0)}
            className="rounded border border-[var(--border)] px-1.5 hover:bg-white/5"
            title="Jump to start (Home)"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={() => usePlaybackStore.getState().togglePlay()}
            className="rounded border border-[var(--border)] px-2 hover:bg-white/5"
            title="Play / Pause (Space)"
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            onClick={() => setPlayhead(totalDuration)}
            className="rounded border border-[var(--border)] px-1.5 hover:bg-white/5"
            title="Jump to end (End)"
          >
            ⏭
          </button>
          {playing && rate !== 1 && (
            <span className="ml-1 text-[10px] text-[var(--text-secondary)]">{rate}×</span>
          )}
          <button
            type="button"
            onClick={() => usePlaybackStore.getState().toggleLoop()}
            className={`ml-2 rounded border px-1.5 text-[10px] uppercase tracking-wide ${
              loopEnabled
                ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--text-primary)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5'
            }`}
            title="Loop between In/Out (Ctrl+L)"
          >
            Loop
          </button>
        </div>
        <div className="font-mono text-[var(--text-secondary)]">
          {formatTimecode(project.playhead, project.settings.fps)}
          <span className="opacity-50"> / {formatTimecode(totalDuration, project.settings.fps)}</span>
        </div>
      </div>
    </section>
  );
}
