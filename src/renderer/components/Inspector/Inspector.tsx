import { useMemo } from 'react';
import type { Clip, MediaAsset } from '@shared/models';
import { useProjectStore } from '../../store/project';
import { formatDuration, formatTimecode } from '../../lib/timecode';
import { COLOR_EFFECT_TYPES, getColorValue, type ColorEffectType } from '@shared/colorCorrection';

interface SelectionView {
  clip: Clip;
  asset: MediaAsset | undefined;
}

export function Inspector() {
  const project = useProjectStore((s) => s.project);
  const selectedIds = useProjectStore((s) => s.selectedClipIds);
  const setClipVolume = useProjectStore((s) => s.setClipVolume);
  const setClipColor = useProjectStore((s) => s.setClipColor);
  const resetClipColor = useProjectStore((s) => s.resetClipColor);

  const sel: SelectionView[] = useMemo(() => {
    if (!project) return [];
    const out: SelectionView[] = [];
    for (const t of project.tracks) {
      for (const c of t.clips) {
        if (selectedIds.includes(c.id)) {
          out.push({ clip: c, asset: project.mediaPool.find((a) => a.id === c.mediaId) });
        }
      }
    }
    return out;
  }, [project, selectedIds]);

  if (!project) return null;

  if (sel.length === 0) {
    return (
      <aside className="w-[320px] border-l border-[var(--border)] bg-[var(--bg-panel)] p-3 text-xs text-[var(--text-secondary)]">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide">Inspector</h2>
        <p>Nothing selected.</p>
        <p className="mt-2 text-[10px] opacity-75">Pick a clip on the timeline to edit its volume.</p>
      </aside>
    );
  }

  if (sel.length > 1) {
    return (
      <aside className="w-[320px] border-l border-[var(--border)] bg-[var(--bg-panel)] p-3 text-xs text-[var(--text-secondary)]">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide">Inspector</h2>
        <p>{sel.length} clips selected.</p>
        <p className="mt-2 text-[10px] opacity-75">Select a single clip to edit its properties.</p>
      </aside>
    );
  }

  const { clip, asset } = sel[0];
  const fps = project.settings.fps;

  return (
    <aside className="flex w-[320px] flex-col gap-3 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-panel)] p-3 text-xs">
      <header>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Inspector</h2>
        <div className="mt-1 truncate text-sm font-medium" title={asset?.fileName ?? '(missing media)'}>
          {asset?.fileName ?? '(missing media)'}
        </div>
      </header>

      <section className="rounded border border-[var(--border)] p-2 text-[var(--text-secondary)]">
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <span>Start</span>
          <span className="font-mono text-[var(--text-primary)]">{formatTimecode(clip.trackTime, fps)}</span>
          <span>Duration</span>
          <span className="font-mono text-[var(--text-primary)]">{formatDuration(clip.duration)}</span>
          <span>Source In</span>
          <span className="font-mono text-[var(--text-primary)]">{formatTimecode(clip.sourceIn, fps)}</span>
          <span>Speed</span>
          <span className="font-mono text-[var(--text-primary)]">{(clip.speed * 100).toFixed(0)}%</span>
        </div>
      </section>

      <section className="rounded border border-[var(--border)] p-2">
        <label className="flex items-center justify-between text-[var(--text-secondary)]">
          <span>Volume</span>
          <span className="font-mono text-[var(--text-primary)]">{Math.round(clip.volume * 100)}%</span>
        </label>
        <input
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={clip.volume}
          onChange={(e) => setClipVolume(clip.id, Number(e.target.value))}
          className="mt-1 w-full accent-[var(--accent)]"
          aria-label="Clip volume"
        />
        <div className="mt-1 flex justify-between text-[9px] text-[var(--text-secondary)]">
          <span>0%</span>
          <span>100%</span>
          <span>200%</span>
        </div>
      </section>

      {/* Color correction — FR-100, FR-103. Only meaningful on video clips, but the slider just
          sets effect values; the export pipeline ignores them on audio clips. */}
      <section className="rounded border border-[var(--border)] p-2">
        <header className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">Color</span>
          <button
            type="button"
            onClick={() => resetClipColor(clip.id)}
            className="rounded border border-[var(--border)] px-1.5 text-[10px] hover:bg-white/5"
            title="Reset all color parameters"
          >
            Reset All
          </button>
        </header>
        <div className="flex flex-col gap-1">
          {COLOR_EFFECT_TYPES.map((t) => (
            <ColorSlider
              key={t}
              type={t}
              value={getColorValue(clip, t)}
              onChange={(v) => setClipColor(clip.id, t, v)}
              onReset={() => setClipColor(clip.id, t, 0)}
            />
          ))}
        </div>
      </section>
    </aside>
  );
}

interface ColorSliderProps {
  type: ColorEffectType;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
}

function ColorSlider({ type, value, onChange, onReset }: ColorSliderProps) {
  const label = type[0].toUpperCase() + type.slice(1);
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-16 text-[var(--text-secondary)]">{label}</span>
      <input
        type="range"
        min={-100}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--accent)]"
        aria-label={`${label} (-100 to 100)`}
      />
      <button
        type="button"
        onClick={onReset}
        className={`w-10 rounded border border-[var(--border)] text-right font-mono ${
          value !== 0 ? 'text-[var(--text-primary)] hover:bg-white/5' : 'text-[var(--text-secondary)]'
        } px-1`}
        title="Reset this parameter to 0"
      >
        {value > 0 ? `+${value}` : value}
      </button>
    </div>
  );
}
