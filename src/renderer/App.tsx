import { useEffect } from 'react';
import { useProjectStore } from './store/project';
import { useProjectActions } from './hooks/useProjectActions';
import { StartScreen } from './components/StartScreen';
import { EditorShell } from './components/EditorShell';
import { NewProjectDialog } from './components/NewProjectDialog';
import { RelinkDialog } from './components/RelinkDialog';
import { AboutDialog } from './components/AboutDialog';
import { ErrorDialog } from './components/ErrorDialog';
import { ExportDialog } from './components/ExportDialog/ExportDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { PreferencesDialog } from './components/PreferencesDialog';
import { copySelection, deleteSelected, pasteAtPlayhead, selectAllClips } from './lib/editActions';
import type { MenuActionId } from '@shared/contracts';

/** True if focus is on a text-editable element where the OS expects native editing semantics. */
function focusInFormField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.isContentEditable;
}

/**
 * If focus is in a text field, fall back to the browser's native edit command. Returns true if
 * the command was attempted (caller should NOT then fire the project-level edit).
 */
function routeNativeEdit(command: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'): boolean {
  if (!focusInFormField()) return false;
  try {
    document.execCommand(command);
  } catch {
    // Some browsers throw on unsupported commands — silently ignore.
  }
  return true;
}

export function App() {
  const project = useProjectStore((s) => s.project);
  const modal = useProjectStore((s) => s.modal);
  const openModal = useProjectStore((s) => s.openModal);
  const closeModal = useProjectStore((s) => s.closeModal);
  const setRecentProjects = useProjectStore((s) => s.setRecentProjects);

  const { newProject, openProject, saveProject, importMediaViaDialog } = useProjectActions();

  // Block stray window-level file drops so the renderer doesn't navigate away from the app.
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  // Native menu dispatch
  useEffect(() => {
    const off = window.api.onMenuAction(async (action: MenuActionId, payload?: unknown) => {
      switch (action) {
        case 'project:new':
          openModal({ kind: 'new-project' });
          break;
        case 'project:open':
          await openProject();
          break;
        case 'project:open-recent':
          if (typeof payload === 'string') await openProject(payload);
          break;
        case 'project:save': {
          const saved = await saveProject(false);
          // Honor "Save then quit" from the close confirmation.
          if (saved && payload && typeof payload === 'object' && (payload as { thenQuit?: boolean }).thenQuit) {
            window.api.confirmQuit();
          }
          break;
        }
        case 'project:save-as':
          await saveProject(true);
          break;
        case 'media:import':
          await importMediaViaDialog();
          break;
        case 'media:export':
          openModal({ kind: 'export' });
          break;
        case 'edit:undo':
          if (!routeNativeEdit('undo')) useProjectStore.getState().undo();
          break;
        case 'edit:redo':
          if (!routeNativeEdit('redo')) useProjectStore.getState().redo();
          break;
        case 'edit:copy':
          if (!routeNativeEdit('copy')) copySelection(false);
          break;
        case 'edit:cut':
          if (!routeNativeEdit('cut')) copySelection(true);
          break;
        case 'edit:paste':
          if (!routeNativeEdit('paste')) pasteAtPlayhead();
          break;
        case 'edit:select-all':
          if (!routeNativeEdit('selectAll')) selectAllClips();
          break;
        case 'edit:delete':
          if (focusInFormField()) return;
          deleteSelected(false);
          break;
        case 'edit:ripple-delete':
          if (focusInFormField()) return;
          deleteSelected(true);
          break;
        case 'app:about':
          openModal({ kind: 'about' });
          break;
        case 'app:shortcuts':
          openModal({ kind: 'shortcuts' });
          break;
        case 'app:preferences':
          openModal({ kind: 'preferences' });
          break;
      }
    });
    return off;
  }, [openModal, openProject, saveProject, importMediaViaDialog]);

  // Seed recent-projects list once at startup.
  useEffect(() => {
    window.api.project.recentList().then(setRecentProjects);
  }, [setRecentProjects]);

  // FR-140: apply user theme on launch and whenever the Preferences dialog edits it. We poll
  // the settings store on every modal close — cheap enough for a single read.
  useEffect(() => {
    const applyTheme = async () => {
      try {
        const theme = await window.api.settings.get('theme');
        document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
      } catch {/* settings not ready yet — default dark already applied via :root */}
    };
    applyTheme();
  }, [modal]);

  // Ctrl+S / Ctrl+Shift+S / Ctrl+N / Ctrl+O / Ctrl+I keyboard shortcuts (also wired in the native menu,
  // but having both means dev-tools-focused windows still respond).
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      // FR-141: ? opens the shortcut reference (no Ctrl). Skip in form fields.
      if (e.key === '?' && !focusInFormField()) {
        e.preventDefault();
        openModal({ kind: 'shortcuts' });
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key.toLowerCase() === 's' && e.shiftKey) {
        e.preventDefault();
        await saveProject(true);
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        await saveProject(false);
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        openModal({ kind: 'new-project' });
      } else if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        await openProject();
      } else if (e.key.toLowerCase() === 'i' && project) {
        e.preventDefault();
        await importMediaViaDialog();
      } else if (e.key.toLowerCase() === 'e' && project) {
        e.preventDefault();
        openModal({ kind: 'export' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project, saveProject, openProject, importMediaViaDialog, openModal]);

  return (
    <>
      {project ? <EditorShell /> : <StartScreen />}

      {modal?.kind === 'new-project' && (
        <NewProjectDialog onCreate={newProject} onCancel={closeModal} />
      )}
      {modal?.kind === 'relink' && (
        <RelinkDialog missingPaths={modal.missingPaths} onClose={closeModal} />
      )}
      {modal?.kind === 'about' && <AboutDialog onClose={closeModal} />}
      {modal?.kind === 'export' && <ExportDialog onClose={closeModal} />}
      {modal?.kind === 'shortcuts' && <ShortcutsDialog onClose={closeModal} />}
      {modal?.kind === 'preferences' && <PreferencesDialog onClose={closeModal} />}
      {modal?.kind === 'error' && (
        <ErrorDialog title={modal.title} message={modal.message} onClose={closeModal} />
      )}
    </>
  );
}
