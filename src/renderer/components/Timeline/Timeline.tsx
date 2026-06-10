import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { Track } from './Track';
import { TimelineRuler } from './TimelineRuler';
import { Playhead } from './Playhead';
import {
  MAX_TRACKS_PER_KIND,
  MAX_ZOOM,
  MIN_ZOOM,
  projectDuration,
  useProjectStore
} from '../../store/project';

const MIN_TIMELINE_DURATION = 30; // seconds — show some empty space even for empty projects

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const zoom = useProjectStore((s) => s.zoom);
  const setZoom = useProjectStore((s) => s.setZoom);
  const snapEnabled = useProjectStore((s) => s.snapEnabled);
  const setSnapEnabled = useProjectStore((s) => s.setSnapEnabled);
  const rippleEnabled = useProjectStore((s) => s.rippleEnabled);
  const setRippleEnabled = useProjectStore((s) => s.setRippleEnabled);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const selectClips = useProjectStore((s) => s.selectClips);
  const clearSelection = useProjectStore((s) => s.clearSelection);
  const addTrack = useProjectStore((s) => s.addTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const setTrackFlag = useProjectStore((s) => s.setTrackFlag);
  const toolMode = useProjectStore((s) => s.toolMode);
  const setToolMode = useProjectStore((s) => s.setToolMode);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const assetsById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof project>['mediaPool'][number]>();
    if (!project) return m;
    for (const a of project.mediaPool) m.set(a.id, a);
    return m;
  }, [project]);

  const duration = useMemo(() => {
    if (!project) return MIN_TIMELINE_DURATION;
    return Math.max(MIN_TIMELINE_DURATION, projectDuration(project) * 1.1);
  }, [project]);

  const widthPx = duration * zoom;
  const totalTrackHeight = (project?.tracks ?? []).reduce((sum, t) => sum + t.height, 0);

  // Keep the playhead visible while scrubbing/playing.
  useEffect(() => {
    if (!project) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const x = project.playhead * zoom;
    const visibleStart = scroller.scrollLeft;
    const visibleEnd = scroller.scrollLeft + scroller.clientWidth;
    if (x < visibleStart || x > visibleEnd) {
      scroller.scrollLeft = Math.max(0, x - 100);
    }
  }, [project?.playhead, zoom, project]);

  // Ctrl+wheel zoom; plain wheel scrolls horizontally too.
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor)));
    } else if (e.shiftKey && scrollerRef.current) {
      scrollerRef.current.scrollLeft += e.deltaY;
    }
  };

  // Marquee selection on the empty body.
  const handleBodyPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Ignore clicks that land on a clip.
    const target = e.target as HTMLElement;
    if (target.closest('[data-clip-id]')) return;
    const rect = bodyRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollerRef.current?.scrollLeft ?? 0);
    const y = e.clientY - rect.top;
    setMarquee({ x0: x, y0: y, x1: x, y1: y });
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) clearSelection();
    bodyRef.current!.setPointerCapture(e.pointerId);
  };

  const handleBodyPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!marquee) return;
    const rect = bodyRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollerRef.current?.scrollLeft ?? 0);
    const y = e.clientY - rect.top;
    setMarquee({ ...marquee, x1: x, y1: y });
  };

  const handleBodyPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!marquee) return;
    // If the user barely moved, treat as a "click in empty space" — seek + deselect.
    const dx = Math.abs(marquee.x1 - marquee.x0);
    const dy = Math.abs(marquee.y1 - marquee.y0);
    if (dx < 3 && dy < 3) {
      setPlayhead(marquee.x0 / zoom);
      setMarquee(null);
      return;
    }
    // Otherwise compute which clips fall inside the marquee.
    if (project) {
      const x0 = Math.min(marquee.x0, marquee.x1);
      const x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1);
      const y1 = Math.max(marquee.y0, marquee.y1);
      const tStart = x0 / zoom;
      const tEnd = x1 / zoom;
      const picked: string[] = [];
      let rowTop = 0;
      for (const track of project.tracks) {
        const rowBottom = rowTop + track.height;
        if (y0 <= rowBottom && y1 >= rowTop) {
          for (const c of track.clips) {
            if (c.trackTime < tEnd && c.trackTime + c.duration > tStart) {
              picked.push(c.id);
            }
          }
        }
        rowTop = rowBottom;
      }
      selectClips(picked, e.shiftKey || e.ctrlKey || e.metaKey ? 'add' : 'set');
    }
    setMarquee(null);
  };

  if (!project) return null;

  return (
    <section className="flex h-full flex-col bg-[var(--bg-app)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1 text-[11px] text-[var(--text-secondary)]">
        <span className="uppercase tracking-wide">Timeline</span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Tool">
          <button
            type="button"
            onClick={() => setToolMode('select')}
            role="radio"
            aria-checked={toolMode === 'select'}
            className={`rounded border px-1.5 ${
              toolMode === 'select'
                ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--text-primary)]'
                : 'border-[var(--border)] hover:bg-white/5'
            }`}
            title="Selection tool (V)"
          >
            V Select
          </button>
          <button
            type="button"
            onClick={() => setToolMode('razor')}
            role="radio"
            aria-checked={toolMode === 'razor'}
            className={`rounded border px-1.5 ${
              toolMode === 'razor'
                ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--text-primary)]'
                : 'border-[var(--border)] hover:bg-white/5'
            }`}
            title="Razor tool (C) — click a clip to split"
          >
            C Razor
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={(e) => setSnapEnabled(e.target.checked)}
            />
            Snap
          </label>
          <label className="flex items-center gap-1" title="Ripple edit: end-trim shifts following clips">
            <input
              type="checkbox"
              checked={rippleEnabled}
              onChange={(e) => setRippleEnabled(e.target.checked)}
            />
            Ripple
          </label>
          <button
            type="button"
            className="rounded border border-[var(--border)] px-1.5 hover:bg-white/5"
            onClick={() => setZoom(zoom / 1.5)}
            aria-label="Zoom out"
            title="Zoom out (-)"
          >
            −
          </button>
          <input
            type="range"
            min={Math.log(MIN_ZOOM)}
            max={Math.log(MAX_ZOOM)}
            step="0.01"
            value={Math.log(zoom)}
            onChange={(e) => setZoom(Math.exp(Number(e.target.value)))}
            className="w-32 accent-[var(--accent)]"
            aria-label="Zoom"
          />
          <button
            type="button"
            className="rounded border border-[var(--border)] px-1.5 hover:bg-white/5"
            onClick={() => setZoom(zoom * 1.5)}
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Track headers (sticky left rail) */}
        <div className="flex w-[96px] flex-shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-panel)]">
          <div className="h-6 border-b border-[var(--border)]" />
          {project.tracks.map((t) => {
            const videoCount = project.tracks.filter((tt) => tt.kind === 'video').length;
            const audioCount = project.tracks.filter((tt) => tt.kind === 'audio').length;
            const canRemove = t.kind === 'video' ? videoCount > 1 : audioCount > 1;
            return (
              <div
                key={t.id}
                className="group relative flex items-center gap-1 border-b border-[var(--border)] px-2 text-[11px] text-[var(--text-secondary)]"
                style={{ height: t.height }}
                title={t.name}
              >
                <span className="font-medium text-[var(--text-primary)]">{t.name}</span>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => setTrackFlag(t.id, 'muted', !t.muted)}
                    className={`rounded border px-1 text-[9px] leading-none ${
                      t.muted
                        ? 'border-red-500/60 bg-red-500/20 text-red-200'
                        : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5'
                    }`}
                    aria-pressed={t.muted}
                    title={t.kind === 'video' ? 'Hide track' : 'Mute track'}
                  >
                    M
                  </button>
                  {t.kind === 'audio' && (
                    <button
                      type="button"
                      onClick={() => setTrackFlag(t.id, 'soloed', !t.soloed)}
                      className={`rounded border px-1 text-[9px] leading-none ${
                        t.soloed
                          ? 'border-yellow-400/60 bg-yellow-400/20 text-yellow-200'
                          : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-white/5'
                      }`}
                      aria-pressed={t.soloed}
                      title="Solo track"
                    >
                      S
                    </button>
                  )}
                </div>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => {
                      if (t.clips.length > 0) {
                        const ok = window.confirm(
                          `Remove track ${t.name}? It contains ${t.clips.length} clip${t.clips.length === 1 ? '' : 's'}.`
                        );
                        if (!ok) return;
                      }
                      removeTrack(t.id);
                    }}
                    className="invisible absolute right-1 top-1 rounded px-1 text-[10px] text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)] group-hover:visible"
                    title={`Remove ${t.name}`}
                    aria-label={`Remove track ${t.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <div className="mt-auto flex flex-col gap-1 border-t border-[var(--border)] p-1">
            <button
              type="button"
              onClick={() => addTrack('video')}
              disabled={project.tracks.filter((t) => t.kind === 'video').length >= MAX_TRACKS_PER_KIND}
              className="rounded border border-[var(--border)] py-0.5 text-[10px] text-[var(--text-secondary)] hover:bg-white/5 disabled:opacity-40"
              title="Add video track"
            >
              + V
            </button>
            <button
              type="button"
              onClick={() => addTrack('audio')}
              disabled={project.tracks.filter((t) => t.kind === 'audio').length >= MAX_TRACKS_PER_KIND}
              className="rounded border border-[var(--border)] py-0.5 text-[10px] text-[var(--text-secondary)] hover:bg-white/5 disabled:opacity-40"
              title="Add audio track"
            >
              + A
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          ref={scrollerRef}
          onWheel={handleWheel}
          className="relative flex-1 overflow-auto"
        >
          <TimelineRuler
            zoom={zoom}
            duration={duration}
            fps={project.settings.fps}
            onSeek={(s) => setPlayhead(s)}
            inPoint={project.inPoint}
            outPoint={project.outPoint}
          />
          <div
            ref={bodyRef}
            data-tracks-root
            onPointerDown={handleBodyPointerDown}
            onPointerMove={handleBodyPointerMove}
            onPointerUp={handleBodyPointerUp}
            onPointerCancel={handleBodyPointerUp}
            className="relative"
            style={{ width: widthPx, height: totalTrackHeight }}
          >
            {project.tracks.map((t) => (
              <Track
                key={t.id}
                track={t}
                zoom={zoom}
                assetsById={assetsById}
                playhead={project.playhead}
                widthPx={widthPx}
              />
            ))}
            {marquee && (
              <div
                className="pointer-events-none absolute border border-[var(--accent)] bg-[var(--accent)]/10"
                style={{
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0)
                }}
              />
            )}
            <Playhead time={project.playhead} zoom={zoom} height={totalTrackHeight} />
          </div>
        </div>
      </div>
    </section>
  );
}
