import { useState } from 'react';
import { Modal } from './shared/Modal';
import { useProjectStore } from '../store/project';

interface RelinkDialogProps {
  missingPaths: string[];
  onClose: () => void;
}

export function RelinkDialog({ missingPaths, onClose }: RelinkDialogProps) {
  const relinkMedia = useProjectStore((s) => s.relinkMedia);
  const [resolved, setResolved] = useState<Record<string, string>>({});

  const handleBrowse = async (originalPath: string) => {
    const newPath = await window.api.system.browseForMedia(originalPath);
    if (!newPath) return;
    relinkMedia(originalPath, newPath);
    setResolved((prev) => ({ ...prev, [originalPath]: newPath }));
  };

  const remaining = missingPaths.filter((p) => !resolved[p]);

  return (
    <Modal
      title={`${missingPaths.length} missing media file${missingPaths.length === 1 ? '' : 's'}`}
      onClose={onClose}
      escClosable={false}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black"
        >
          {remaining.length > 0 ? 'Continue anyway' : 'Done'}
        </button>
      }
    >
      <p className="mb-3 text-[var(--text-secondary)]">
        These media files were referenced by the project but could not be found on disk. Click Browse to point each one at its new location.
      </p>
      <ul className="flex flex-col gap-2">
        {missingPaths.map((p) => {
          const replacement = resolved[p];
          return (
            <li
              key={p}
              className="flex items-center justify-between gap-3 rounded border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{p.split(/[\\/]/).pop()}</div>
                <div className="truncate text-xs text-[var(--text-secondary)]">
                  {replacement ? `→ ${replacement}` : p}
                </div>
              </div>
              {replacement ? (
                <span className="text-xs text-emerald-400">Relinked</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleBrowse(p)}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-white/5"
                >
                  Browse…
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
