import { useEffect } from 'react';
import { useProjectStore } from '../store/project';
import { useProjectActions } from '../hooks/useProjectActions';

export function StartScreen() {
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const setRecentProjects = useProjectStore((s) => s.setRecentProjects);
  const openModal = useProjectStore((s) => s.openModal);
  const { openProject } = useProjectActions();

  useEffect(() => {
    window.api.project.recentList().then(setRecentProjects);
  }, [setRecentProjects]);

  const handleRemoveRecent = async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    const next = await window.api.project.removeRecent(filePath);
    setRecentProjects(next);
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="flex w-full max-w-2xl flex-col gap-6 p-8">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">VidForge</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Start a new project or open an existing one.</p>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => openModal({ kind: 'new-project' })}
            className="flex flex-col items-start gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4 text-left hover:border-[var(--accent)]"
          >
            <span className="text-base font-medium">New Project</span>
            <span className="text-xs text-[var(--text-secondary)]">Ctrl+N · Choose fps and resolution</span>
          </button>
          <button
            type="button"
            onClick={() => openProject()}
            className="flex flex-col items-start gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4 text-left hover:border-[var(--accent)]"
          >
            <span className="text-base font-medium">Open Project…</span>
            <span className="text-xs text-[var(--text-secondary)]">Ctrl+O · Open a .vedit file</span>
          </button>
        </div>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Recent Projects
          </h2>
          {recentProjects.length === 0 ? (
            <div className="rounded border border-dashed border-[var(--border)] p-4 text-sm text-[var(--text-secondary)]">
              No recent projects yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {recentProjects.map((path) => {
                const fileName = path.split(/[\\/]/).pop() ?? path;
                return (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={() => openProject(path)}
                      className="group flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{fileName.replace(/\.vedit$/, '')}</div>
                        <div className="truncate text-xs text-[var(--text-secondary)]">{path}</div>
                      </div>
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => handleRemoveRecent(e, path)}
                        className="invisible text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] group-hover:visible"
                        aria-label={`Remove ${fileName} from recents`}
                      >
                        Remove
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
