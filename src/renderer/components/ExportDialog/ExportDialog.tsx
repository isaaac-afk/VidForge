import { useEffect, useMemo, useState } from 'react';
import type { ExportOptions } from '@shared/contracts';
import { useProjectStore, projectDuration } from '../../store/project';
import { Modal } from '../shared/Modal';
import { formatDuration } from '../../lib/timecode';

type Preset = 'mp4_1080p' | 'mp4_720p' | 'mp4_4k' | 'custom';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; jobId: string; percent: number; eta: number; startedAt: number }
  | { kind: 'done'; outputPath: string }
  | { kind: 'error'; message: string };

interface ExportDialogProps {
  onClose: () => void;
}

const PRESET_LABELS: Record<Preset, string> = {
  mp4_1080p: '1080p MP4 (H.264)',
  mp4_720p: '720p MP4 (H.264)',
  mp4_4k: '4K MP4 (H.264)',
  custom: 'Custom'
};

const VIDEO_CODECS = ['libx264', 'libx265', 'h264_nvenc', 'h264_qsv', 'h264_amf'] as const;

export function ExportDialog({ onClose }: ExportDialogProps) {
  const project = useProjectStore((s) => s.project);

  const [preset, setPreset] = useState<Preset>('mp4_1080p');
  const [outputPath, setOutputPath] = useState<string>('');
  const [useInOut, setUseInOut] = useState<boolean>(false);
  const [encoders, setEncoders] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  // Custom settings (only used if preset === 'custom')
  const [customWidth, setCustomWidth] = useState<number>(1920);
  const [customHeight, setCustomHeight] = useState<number>(1080);
  const [customFps, setCustomFps] = useState<number>(30);
  const [customCodec, setCustomCodec] = useState<string>('libx264');
  const [customCrf, setCustomCrf] = useState<number>(20);
  const [customBitrate, setCustomBitrate] = useState<string>('8M');

  const hasInOut =
    !!project && project.inPoint !== null && project.outPoint !== null && project.outPoint > project.inPoint;

  // Seed the suggested output path and detect encoders on first open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const suggested = await window.api.export.suggestedName(project?.name ?? 'untitled');
      if (!cancelled && !outputPath) setOutputPath(suggested);
      const e = await window.api.system.detectEncoders();
      if (!cancelled) setEncoders(e);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to export events while a job is running.
  useEffect(() => {
    if (phase.kind !== 'running') return;
    const offP = window.api.export.onProgress((e) => {
      if (e.jobId !== phase.jobId) return;
      setPhase((cur) => (cur.kind === 'running' ? { ...cur, percent: e.percent, eta: e.eta } : cur));
    });
    const offC = window.api.export.onComplete((e) => {
      if (e.jobId !== phase.jobId) return;
      setPhase({ kind: 'done', outputPath: e.outputPath });
    });
    const offE = window.api.export.onError((e) => {
      if (e.jobId !== phase.jobId) return;
      setPhase({ kind: 'error', message: e.message });
    });
    return () => {
      offP();
      offC();
      offE();
    };
  }, [phase]);

  const totalDuration = useMemo(() => (project ? projectDuration(project) : 0), [project]);
  const exportRange = useMemo(() => {
    if (!project) return { start: 0, end: 0 };
    if (useInOut && hasInOut) {
      return { start: project.inPoint!, end: project.outPoint! };
    }
    return { start: 0, end: totalDuration };
  }, [project, useInOut, hasInOut, totalDuration]);
  const exportDuration = Math.max(0, exportRange.end - exportRange.start);

  const handlePickOutput = async () => {
    const p = await window.api.export.pickOutputPath(outputPath || 'untitled.mp4');
    if (p) setOutputPath(p);
  };

  const handleStart = async () => {
    if (!project) return;
    if (!outputPath) {
      const p = await window.api.export.pickOutputPath(outputPath || `${project.name}.mp4`);
      if (!p) return;
      setOutputPath(p);
    }
    const options: ExportOptions = {
      outputPath: outputPath,
      preset,
      useInOutPoints: useInOut && hasInOut,
      ...(preset === 'custom' && {
        customSettings: {
          width: customWidth,
          height: customHeight,
          fps: customFps,
          videoCodec: customCodec as 'libx264' | 'libx265' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf',
          audioCodec: 'aac' as const,
          bitrate: customBitrate,
          crf: customCrf
        }
      })
    };
    try {
      const jobId = await window.api.export.start(project, options);
      setPhase({ kind: 'running', jobId, percent: 0, eta: 0, startedAt: Date.now() });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPhase({ kind: 'error', message });
    }
  };

  const handleCancel = async () => {
    if (phase.kind !== 'running') return;
    await window.api.export.cancel(phase.jobId);
  };

  const handleClose = async () => {
    if (phase.kind === 'running') {
      await window.api.export.cancel(phase.jobId);
    }
    onClose();
  };

  if (!project) return null;

  return (
    <Modal onClose={handleClose} title="Export to MP4">
      {phase.kind === 'idle' || phase.kind === 'error' ? (
        <div className="flex flex-col gap-3 text-xs">
          <section className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">Preset</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
                <label
                  key={p}
                  className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                    preset === p ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:bg-white/5'
                  }`}
                >
                  <input
                    type="radio"
                    name="preset"
                    checked={preset === p}
                    onChange={() => setPreset(p)}
                  />
                  {PRESET_LABELS[p]}
                </label>
              ))}
            </div>
          </section>

          {preset === 'custom' && (
            <section className="flex flex-col gap-2 rounded border border-[var(--border)] p-2">
              <div className="grid grid-cols-3 gap-2">
                <NumField label="Width" value={customWidth} onChange={setCustomWidth} min={16} />
                <NumField label="Height" value={customHeight} onChange={setCustomHeight} min={16} />
                <NumField label="FPS" value={customFps} onChange={setCustomFps} min={1} max={120} />
              </div>
              <label className="flex items-center justify-between gap-2">
                <span>Codec</span>
                <select
                  value={customCodec}
                  onChange={(e) => setCustomCodec(e.target.value)}
                  className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-app)] px-1 py-0.5"
                >
                  {VIDEO_CODECS.map((c) => {
                    const isHw = c.includes('nvenc') || c.includes('qsv') || c.includes('amf');
                    const available = !isHw || encoders.includes(c);
                    return (
                      <option key={c} value={c} disabled={!available}>
                        {c}{!available ? ' (not detected)' : ''}
                      </option>
                    );
                  })}
                </select>
              </label>
              {(customCodec === 'libx264' || customCodec === 'libx265') ? (
                <NumField label="CRF (quality)" value={customCrf} onChange={setCustomCrf} min={0} max={51} />
              ) : (
                <label className="flex items-center justify-between gap-2">
                  <span>Bitrate</span>
                  <input
                    type="text"
                    value={customBitrate}
                    onChange={(e) => setCustomBitrate(e.target.value)}
                    className="flex-1 rounded border border-[var(--border)] bg-[var(--bg-app)] px-1 py-0.5"
                  />
                </label>
              )}
            </section>
          )}

          <section className="flex flex-col gap-2 rounded border border-[var(--border)] p-2">
            <label className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">Output</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                className="flex-1 truncate rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1"
                placeholder="Choose output file…"
              />
              <button
                type="button"
                onClick={handlePickOutput}
                className="rounded border border-[var(--border)] px-2 hover:bg-white/5"
              >
                Browse…
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-1 rounded border border-[var(--border)] p-2">
            <label className={`flex items-center gap-2 ${!hasInOut ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={useInOut && hasInOut}
                disabled={!hasInOut}
                onChange={(e) => setUseInOut(e.target.checked)}
              />
              <span>Export In/Out range only</span>
            </label>
            <div className="text-[10px] text-[var(--text-secondary)]">
              Duration: {formatDuration(exportDuration)}
            </div>
          </section>

          {phase.kind === 'error' && (
            <div className="rounded border border-red-500/50 bg-red-500/10 p-2 text-red-200">
              <div className="font-medium">Export failed</div>
              <pre className="mt-1 whitespace-pre-wrap break-all text-[10px]">{phase.message}</pre>
            </div>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-[var(--border)] px-3 py-1 hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStart}
              disabled={!outputPath || exportDuration <= 0}
              className="rounded border border-[var(--accent)] bg-[var(--accent)]/20 px-3 py-1 text-[var(--text-primary)] hover:bg-[var(--accent)]/30 disabled:opacity-40"
            >
              Start Export
            </button>
          </div>
        </div>
      ) : phase.kind === 'running' ? (
        <div className="flex flex-col gap-3 text-xs">
          <div className="flex items-center justify-between">
            <span>Rendering…</span>
            <span className="font-mono">{phase.percent.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-[var(--bg-app)]">
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-200"
              style={{ width: `${Math.min(100, phase.percent)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
            <span>Elapsed: {formatDuration((Date.now() - phase.startedAt) / 1000)}</span>
            <span>ETA: {phase.eta > 0 ? formatDuration(phase.eta) : '—'}</span>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded border border-[var(--border)] px-3 py-1 hover:bg-white/5"
            >
              Cancel Export
            </button>
          </div>
        </div>
      ) : (
        // done
        <div className="flex flex-col gap-3 text-xs">
          <div className="rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-200">
            <div className="font-medium">Export complete</div>
            <div className="mt-1 truncate text-[10px]" title={phase.outputPath}>{phase.outputPath}</div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => window.api.export.reveal(phase.outputPath)}
              className="rounded border border-[var(--border)] px-3 py-1 hover:bg-white/5"
            >
              Reveal in Explorer
            </button>
            <button
              type="button"
              onClick={() => window.api.export.openFile(phase.outputPath)}
              className="rounded border border-[var(--accent)] bg-[var(--accent)]/20 px-3 py-1 hover:bg-[var(--accent)]/30"
            >
              Open File
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-[var(--border)] px-3 py-1 hover:bg-white/5"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface NumFieldProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}

function NumField({ label, value, onChange, min, max }: NumFieldProps) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-1 py-0.5"
      />
    </label>
  );
}
