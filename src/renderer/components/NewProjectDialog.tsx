import { useState } from 'react';
import { FPS_OPTIONS, RESOLUTION_PRESETS, type NewProjectParams } from '@shared/projectFactory';
import { Modal } from './shared/Modal';

interface NewProjectDialogProps {
  onCreate: (params: NewProjectParams) => void;
  onCancel: () => void;
}

type ResolutionChoice = '1080p' | '720p' | '4k' | 'custom';

export function NewProjectDialog({ onCreate, onCancel }: NewProjectDialogProps) {
  const [name, setName] = useState('Untitled Project');
  const [fps, setFps] = useState<24 | 25 | 30 | 50 | 60>(30);
  const [resChoice, setResChoice] = useState<ResolutionChoice>('1080p');
  const [customWidth, setCustomWidth] = useState(1920);
  const [customHeight, setCustomHeight] = useState(1080);
  const [sampleRate, setSampleRate] = useState<44100 | 48000>(48000);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolution =
      resChoice === 'custom'
        ? { width: customWidth, height: customHeight }
        : RESOLUTION_PRESETS[resChoice];
    onCreate({
      name: name.trim() || 'Untitled Project',
      settings: { fps, resolution, sampleRate }
    });
  };

  const isValid =
    name.trim().length > 0 &&
    (resChoice !== 'custom' || (customWidth >= 16 && customHeight >= 16));

  return (
    <Modal
      title="New Project"
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-project-form"
            disabled={!isValid}
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
          >
            Create
          </button>
        </>
      }
    >
      <form id="new-project-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Name</span>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Frame Rate</span>
          <select
            value={fps}
            onChange={(e) => setFps(Number(e.target.value) as typeof fps)}
            className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          >
            {FPS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt} fps
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Resolution</span>
          <select
            value={resChoice}
            onChange={(e) => setResChoice(e.target.value as ResolutionChoice)}
            className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="1080p">1080p (1920 × 1080)</option>
            <option value="720p">720p (1280 × 720)</option>
            <option value="4k">4K (3840 × 2160)</option>
            <option value="custom">Custom…</option>
          </select>
        </label>

        {resChoice === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Width</span>
              <input
                type="number"
                min={16}
                step={2}
                value={customWidth}
                onChange={(e) => setCustomWidth(Number(e.target.value))}
                className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Height</span>
              <input
                type="number"
                min={16}
                step={2}
                value={customHeight}
                onChange={(e) => setCustomHeight(Number(e.target.value))}
                className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">Audio Sample Rate</span>
          <select
            value={sampleRate}
            onChange={(e) => setSampleRate(Number(e.target.value) as typeof sampleRate)}
            className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value={48000}>48 000 Hz</option>
            <option value={44100}>44 100 Hz</option>
          </select>
        </label>
      </form>
    </Modal>
  );
}
