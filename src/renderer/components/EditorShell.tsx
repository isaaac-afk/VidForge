import { useProjectStore, projectDuration } from '../store/project';
import { usePlaybackStore } from '../store/playback';
import { formatTimecode } from '../lib/timecode';
import { MediaBin } from './MediaBin/MediaBin';
import { Preview } from './Preview/Preview';
import { Timeline } from './Timeline/Timeline';
import { Inspector } from './Inspector/Inspector';
import { useTimelineShortcuts } from '../hooks/useTimelineShortcuts';
import { useAutosave } from '../hooks/useAutosave';
import { useProjectActions } from '../hooks/useProjectActions';

export function EditorShell() {
  const project = useProjectStore((s) => s.project);
  const filePath = useProjectStore((s) => s.filePath);
  const isDirty = useProjectStore((s) => s.isDirty);
  const selectedCount = useProjectStore((s) => s.selectedClipIds.length);
  const masterVolume = usePlaybackStore((s) => s.masterVolume);
  const setMasterVolume = usePlaybackStore((s) => s.setMasterVolume);
  const recoveredFromAutosave = useProjectStore((s) => s.recoveredFromAutosave);
  const dismissRecoveryNotice = useProjectStore((s) => s.dismissRecoveryNotice);
  const { openProject, saveProject } = useProjectActions();

  useTimelineShortcuts();
  useAutosave(60);

  if (!project) return null;

  const dur = projectDuration(project);

  return (
    <div className="flex h-screen w-screen flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {project.name}
            {isDirty && <span className="ml-1 text-[var(--text-secondary)]">•</span>}
          </span>
          <span className="text-[var(--text-secondary)]">
            {project.settings.resolution.width}×{project.settings.resolution.height} · {project.settings.fps} fps
          </span>
        </div>
        <div className="flex items-center gap-2 text-[var(--text-secondary)]" title="Master monitor volume (does not affect export)">
          <span>Master</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={masterVolume}
            onChange={(e) => setMasterVolume(Number(e.target.value))}
            className="w-28 accent-[var(--accent)]"
            aria-label="Master volume"
          />
          <span className="w-10 text-right font-mono text-[10px]">{Math.round(masterVolume * 100)}%</span>
        </div>
        <div className="truncate text-[var(--text-secondary)]" title={filePath ?? ''}>
          {filePath ?? 'Unsaved'}
        </div>
      </header>

      {recoveredFromAutosave && filePath && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 text-xs">
          <div>
            <span className="font-medium text-[var(--text-primary)]">Recovered from autosave.</span>
            <span className="ml-2 text-[var(--text-secondary)]">Save to make this state permanent, or discard to revert to the last manual save.</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                const saved = await saveProject(false);
                if (saved) dismissRecoveryNotice();
              }}
              className="rounded border border-[var(--accent)] bg-[var(--accent)]/30 px-2 py-0.5 text-[11px] hover:bg-[var(--accent)]/40"
            >
              Save Now
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!filePath) return;
                if (!window.confirm('Discard recovered changes and reload the saved file?')) return;
                await window.api.project.clearAutosave(filePath);
                await openProject(filePath);
                dismissRecoveryNotice();
              }}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-[11px] hover:bg-white/5"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={dismissRecoveryNotice}
              className="rounded border border-[var(--border)] px-2 py-0.5 text-[11px] hover:bg-white/5"
              title="Dismiss this banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <MediaBin />

        <main className="flex flex-1 flex-col">
          <Preview />

          <section className="h-[40%] border-t border-[var(--border)]">
            <Timeline />
          </section>
        </main>

        <Inspector />
      </div>

      <footer className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1 text-[11px] text-[var(--text-secondary)]">
        <div>Playhead: {formatTimecode(project.playhead, project.settings.fps)}</div>
        <div>Duration: {formatTimecode(dur, project.settings.fps)}</div>
        <div>Selected: {selectedCount} clip{selectedCount === 1 ? '' : 's'}</div>
        <div>{project.mediaPool.length} media asset{project.mediaPool.length === 1 ? '' : 's'}</div>
      </footer>
    </div>
  );
}
