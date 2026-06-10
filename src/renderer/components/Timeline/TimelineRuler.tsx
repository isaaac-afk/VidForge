import { useMemo, type MouseEvent } from 'react';
import { formatTimecode } from '../../lib/timecode';

interface TimelineRulerProps {
  zoom: number; // px per second
  duration: number; // seconds visible (== max scrollable extent)
  fps: number;
  /** Click position in seconds (already converted from pixels). */
  onSeek: (seconds: number) => void;
  /** In/out points in seconds (FR-067). */
  inPoint: number | null;
  outPoint: number | null;
}

interface Tick {
  seconds: number;
  major: boolean;
  label?: string;
}

/** Pick a sensible major-tick interval (in seconds) for the current zoom. */
function pickTickInterval(zoom: number): { major: number; minorPerMajor: number } {
  // Aim for major ticks every ~80 px so labels don't crowd.
  const targetSecondsPerMajor = 80 / Math.max(zoom, 0.001);
  const candidates = [
    0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600
  ];
  let major = candidates[candidates.length - 1];
  for (const c of candidates) {
    if (c >= targetSecondsPerMajor) {
      major = c;
      break;
    }
  }
  return { major, minorPerMajor: 5 };
}

export function TimelineRuler({ zoom, duration, fps, onSeek, inPoint, outPoint }: TimelineRulerProps) {
  const widthPx = Math.max(1, duration * zoom);

  const ticks: Tick[] = useMemo(() => {
    const { major, minorPerMajor } = pickTickInterval(zoom);
    const minor = major / minorPerMajor;
    const out: Tick[] = [];
    const maxTicks = 2000;
    for (let i = 0, s = 0; s <= duration + 0.001 && i < maxTicks; i++, s = i * minor) {
      const isMajor = Math.abs((s / major) - Math.round(s / major)) < 1e-6;
      out.push({
        seconds: s,
        major: isMajor,
        label: isMajor ? formatTimecode(s, fps) : undefined
      });
    }
    return out;
  }, [zoom, duration, fps]);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    onSeek(x / zoom);
  };

  return (
    <div
      onMouseDown={handleClick}
      className="relative h-6 cursor-text select-none border-b border-[var(--border)] bg-[var(--bg-panel)]"
      style={{ width: widthPx }}
    >
      {/* In/Out range fill */}
      {inPoint !== null && outPoint !== null && outPoint > inPoint && (
        <div
          className="pointer-events-none absolute inset-y-0 bg-[var(--accent)]/15"
          style={{ left: inPoint * zoom, width: (outPoint - inPoint) * zoom }}
        />
      )}
      {ticks.map((t, idx) => (
        <div
          key={idx}
          className={`pointer-events-none absolute top-0 ${
            t.major ? 'h-full border-l border-[var(--text-secondary)]/60' : 'h-2 border-l border-[var(--text-secondary)]/25'
          }`}
          style={{ left: t.seconds * zoom }}
        >
          {t.label && (
            <span className="ml-1 select-none text-[10px] text-[var(--text-secondary)]">{t.label}</span>
          )}
        </div>
      ))}
      {/* In-point caret */}
      {inPoint !== null && (
        <div
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-[var(--accent)]"
          style={{ left: inPoint * zoom }}
          title="In point"
        />
      )}
      {outPoint !== null && (
        <div
          className="pointer-events-none absolute top-0 h-full w-0.5 bg-[var(--accent)]"
          style={{ left: outPoint * zoom }}
          title="Out point"
        />
      )}
    </div>
  );
}
