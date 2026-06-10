import { useEffect } from 'react';
import { useProjectStore } from '../store/project';

/**
 * FR-005: every `intervalSeconds`, if the project is dirty and has a known file path, write
 * a `<path>.autosave` sidecar via main. Skips silently for never-saved projects (no path to
 * key the sidecar off). A successful manual save deletes the sidecar via main; the next
 * autosave tick will recreate one only if there are new edits.
 */
export function useAutosave(intervalSeconds: number = 60): void {
  useEffect(() => {
    if (intervalSeconds <= 0) return;
    const handle = window.setInterval(() => {
      const { project, filePath, isDirty } = useProjectStore.getState();
      if (!project || !filePath || !isDirty) return;
      window.api.project.autosave(project, filePath).catch((err) => {
        console.error('[autosave] failed', err);
      });
    }, intervalSeconds * 1000);
    return () => window.clearInterval(handle);
  }, [intervalSeconds]);
}
