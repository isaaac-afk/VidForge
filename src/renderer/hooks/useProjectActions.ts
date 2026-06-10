import { useCallback } from 'react';
import { createNewProject, type NewProjectParams } from '@shared/projectFactory';
import { useProjectStore } from '../store/project';

/**
 * Centralised project actions — invoked from both the Start screen UI and the native menu.
 */
export function useProjectActions() {
  const {
    project,
    filePath,
    setProject,
    loadProject,
    markSaved,
    setRecentProjects,
    addMediaAssets,
    openModal,
    closeModal
  } = useProjectStore();

  const newProject = useCallback(
    async (params: NewProjectParams) => {
      const fresh = createNewProject(params);
      setProject(fresh, null);
      closeModal();
    },
    [setProject, closeModal]
  );

  const openProject = useCallback(
    async (path?: string) => {
      try {
        const result = await window.api.project.open(path);
        if (!result) return;
        loadProject(result);
        const recents = await window.api.project.recentList();
        setRecentProjects(recents);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        openModal({ kind: 'error', title: 'Could not open project', message });
      }
    },
    [loadProject, setRecentProjects, openModal]
  );

  const saveProject = useCallback(
    async (forceDialog = false): Promise<string | null> => {
      if (!project) return null;
      const targetPath = forceDialog ? undefined : filePath ?? undefined;
      try {
        const saved = await window.api.project.save(project, targetPath);
        if (!saved) return null;
        markSaved(saved);
        const recents = await window.api.project.recentList();
        setRecentProjects(recents);
        return saved;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        openModal({ kind: 'error', title: 'Save failed', message });
        return null;
      }
    },
    [project, filePath, markSaved, setRecentProjects, openModal]
  );

  const importMediaByPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      try {
        const assets = await window.api.media.import(paths);
        addMediaAssets(assets);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        openModal({ kind: 'error', title: 'Import failed', message });
      }
    },
    [addMediaAssets, openModal]
  );

  const importMediaViaDialog = useCallback(async () => {
    const paths = await window.api.media.pickFiles();
    await importMediaByPaths(paths);
  }, [importMediaByPaths]);

  return {
    newProject,
    openProject,
    saveProject,
    importMediaByPaths,
    importMediaViaDialog
  };
}
