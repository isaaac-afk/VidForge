import { useEffect } from 'react';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  projectDuration,
  useProjectStore
} from '../store/project';
import { usePlaybackStore } from '../store/playback';
import { copySelection, deleteSelected, pasteAtPlayhead, selectAllClips } from '../lib/editActions';

/** Keyboard shortcuts for the timeline (TRD Appendix A). */
export function useTimelineShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const project = useProjectStore.getState().project;
      if (!project) return;
      // Don't steal keys from inputs / contenteditable.
      const tgt = e.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.tagName === 'SELECT' ||
          tgt.isContentEditable)
      ) {
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      const fps = project.settings.fps;
      const frame = 1 / Math.max(fps, 1);
      const dur = projectDuration(project);
      const projectStore = useProjectStore.getState();
      const { setPlayhead, setInPoint, setOutPoint, setZoom, zoom } = projectStore;
      const playback = usePlaybackStore.getState();

      // Reject anything that's bound at the App level (Ctrl+S/O/N/I).
      if (ctrl && ['s', 'o', 'n'].includes(e.key.toLowerCase())) return;
      // Ctrl+I is the App's import shortcut, BUT only when a project is loaded with media context.
      // The 'i' single-key (in-point) is handled below.

      // Editing shortcuts (Ctrl+chord) — handle first to avoid clashes with single-letter cases.
      if (ctrl) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) projectStore.redo();
            else projectStore.undo();
            return;
          case 'y':
            // Common Windows redo binding.
            e.preventDefault();
            projectStore.redo();
            return;
          case 'c':
            e.preventDefault();
            copySelection(false);
            return;
          case 'x':
            e.preventDefault();
            copySelection(true);
            return;
          case 'v':
            e.preventDefault();
            pasteAtPlayhead();
            return;
          case 'a':
            e.preventDefault();
            selectAllClips();
            return;
        }
      }

      switch (e.key) {
        case ' ': // Space — play/pause
          e.preventDefault();
          playback.togglePlay();
          return;
        case 'ArrowLeft':
          e.preventDefault();
          setPlayhead(Math.max(0, project.playhead - (e.shiftKey ? 10 : 1) * frame));
          return;
        case 'ArrowRight':
          e.preventDefault();
          setPlayhead(Math.min(dur, project.playhead + (e.shiftKey ? 10 : 1) * frame));
          return;
        case 'Home':
          e.preventDefault();
          setPlayhead(0);
          return;
        case 'End':
          e.preventDefault();
          setPlayhead(dur);
          return;
        case '+':
        case '=':
          e.preventDefault();
          setZoom(Math.min(MAX_ZOOM, zoom * 1.5));
          return;
        case '-':
        case '_':
          e.preventDefault();
          setZoom(Math.max(MIN_ZOOM, zoom / 1.5));
          return;
        case 'Delete':
        case 'Backspace': {
          if (projectStore.selectedClipIds.length === 0) return;
          e.preventDefault();
          deleteSelected(e.shiftKey);
          return;
        }
        case 'Escape':
          if (projectStore.selectedClipIds.length > 0) {
            e.preventDefault();
            projectStore.clearSelection();
          }
          return;
      }

      switch (e.key.toLowerCase()) {
        case 'i':
          if (ctrl) return; // import shortcut, owned by App
          e.preventDefault();
          setInPoint(project.playhead);
          return;
        case 'o':
          if (ctrl) return;
          e.preventDefault();
          setOutPoint(project.playhead);
          return;
        case 'j':
          e.preventDefault();
          playback.shuttle('j');
          return;
        case 'k':
          e.preventDefault();
          playback.shuttle('k');
          return;
        case 'l':
          e.preventDefault();
          if (ctrl) {
            playback.toggleLoop();
          } else {
            playback.shuttle('l');
          }
          return;
        case 'v':
          if (ctrl) return; // paste, handled above
          e.preventDefault();
          projectStore.setToolMode('select');
          return;
        case 'c':
          if (ctrl) return; // copy, handled above
          e.preventDefault();
          projectStore.setToolMode('razor');
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
