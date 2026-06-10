import { Modal } from './shared/Modal';

interface ShortcutsDialogProps {
  onClose: () => void;
}

interface Row { keys: string; action: string }
interface Section { title: string; rows: Row[] }

const SECTIONS: Section[] = [
  {
    title: 'Playback',
    rows: [
      { keys: 'Space', action: 'Play / Pause' },
      { keys: 'K', action: 'Pause (shuttle reset to 1×)' },
      { keys: 'J', action: 'Reverse playback (frame-stepped)' },
      { keys: 'L', action: 'Forward playback / increase speed' },
      { keys: '←  /  →', action: 'Step 1 frame back / forward' },
      { keys: 'Shift+←  /  Shift+→', action: 'Step 10 frames back / forward' },
      { keys: 'Home / End', action: 'Jump to start / end' },
      { keys: 'I / O', action: 'Set in / out point at playhead' },
      { keys: 'Ctrl+L', action: 'Toggle loop between in/out' }
    ]
  },
  {
    title: 'Editing',
    rows: [
      { keys: 'V', action: 'Selection tool' },
      { keys: 'C', action: 'Razor tool (click clip to split)' },
      { keys: 'Delete', action: 'Delete selected clips (leave gap)' },
      { keys: 'Shift+Delete', action: 'Ripple delete (close gap)' },
      { keys: 'Ctrl+C / Ctrl+X / Ctrl+V', action: 'Copy / Cut / Paste at playhead' },
      { keys: 'Ctrl+Z / Ctrl+Shift+Z', action: 'Undo / Redo' },
      { keys: 'Ctrl+A', action: 'Select all clips' },
      { keys: 'Esc', action: 'Clear selection' }
    ]
  },
  {
    title: 'View',
    rows: [
      { keys: '+ / −', action: 'Zoom timeline in / out' },
      { keys: 'Ctrl+scroll', action: 'Zoom under cursor' }
    ]
  },
  {
    title: 'Project',
    rows: [
      { keys: 'Ctrl+N', action: 'New project' },
      { keys: 'Ctrl+O', action: 'Open project' },
      { keys: 'Ctrl+S', action: 'Save' },
      { keys: 'Ctrl+Shift+S', action: 'Save as' },
      { keys: 'Ctrl+I', action: 'Import media' },
      { keys: 'Ctrl+E', action: 'Export' },
      { keys: '?', action: 'Show this shortcut reference' }
    ]
  }
];

export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  return (
    <Modal onClose={onClose} title="Keyboard Shortcuts">
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1 text-xs">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              {section.title}
            </h3>
            <table className="w-full">
              <tbody>
                {section.rows.map((row) => (
                  <tr key={row.keys} className="align-top">
                    <td className="whitespace-nowrap py-0.5 pr-3 font-mono text-[var(--text-primary)]">{row.keys}</td>
                    <td className="py-0.5 text-[var(--text-secondary)]">{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Modal>
  );
}
