import { useState, type DragEvent } from 'react';
import { useProjectStore } from '../../store/project';
import { useProjectActions } from '../../hooks/useProjectActions';
import { formatDuration } from '../../lib/timecode';
import type { MediaAsset } from '@shared/models';

interface ContextMenuState {
  x: number;
  y: number;
  asset: MediaAsset;
}

export function MediaBin() {
  const project = useProjectStore((s) => s.project);
  const removeMediaAsset = useProjectStore((s) => s.removeMediaAsset);
  const setMediaProxyPath = useProjectStore((s) => s.setMediaProxyPath);
  const { importMediaByPaths, importMediaViaDialog } = useProjectActions();
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [ctx, setCtx] = useState<ContextMenuState | null>(null);
  const [proxyingId, setProxyingId] = useState<string | null>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const paths = files
      .map((f) => window.api.system.getPathForFile(f))
      .filter((p): p is string => Boolean(p));
    if (paths.length === 0) return;
    setImporting(true);
    try {
      await importMediaByPaths(paths);
    } finally {
      setImporting(false);
    }
  };

  const handlePickClick = async () => {
    setImporting(true);
    try {
      await importMediaViaDialog();
    } finally {
      setImporting(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, asset: MediaAsset) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, asset });
  };

  const closeContextMenu = () => setCtx(null);

  if (!project) return null;

  return (
    <aside
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={ctx ? closeContextMenu : undefined}
      className={`flex h-full w-[280px] flex-col border-r border-[var(--border)] bg-[var(--bg-panel)] ${
        dragOver ? 'ring-2 ring-inset ring-[var(--accent)]' : ''
      }`}
    >
      <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Media</h2>
        <button
          type="button"
          onClick={handlePickClick}
          disabled={importing}
          className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-white/5 disabled:opacity-50"
        >
          {importing ? 'Importing…' : '+ Import'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {project.mediaPool.length === 0 ? (
          <div className="m-3 rounded border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--text-secondary)]">
            Drop video, audio, or images here.
            <br />
            <span className="text-xs">or use + Import above</span>
          </div>
        ) : (
          <ul className="flex flex-col">
            {project.mediaPool.map((asset) => (
              <li
                key={asset.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData('application/x-vidforge-asset', asset.id);
                }}
                onContextMenu={(e) => handleContextMenu(e, asset)}
                className="flex cursor-grab items-start gap-2 border-b border-[var(--border)] px-2 py-2 hover:bg-white/5 active:cursor-grabbing"
              >
                <div className="h-12 w-20 flex-shrink-0 overflow-hidden rounded bg-[var(--bg-app)] text-[10px] text-[var(--text-secondary)]">
                  {asset.thumbnailPath ? (
                    <img
                      src={asset.thumbnailPath}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      {asset.type === 'audio' ? '♪' : asset.type}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-xs font-medium" title={asset.fileName}>
                    <span className="truncate">{asset.fileName}</span>
                    {asset.isVfr && (
                      <span
                        title="Variable frame rate — audio/video sync may drift after edits."
                        className="text-amber-400"
                      >
                        ⚠
                      </span>
                    )}
                    {asset.proxyPath && (
                      <span
                        title="Proxy generated — Preview uses it; export uses the original."
                        className="rounded bg-[var(--accent)]/30 px-1 text-[9px] uppercase text-[var(--accent)]"
                      >
                        P
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {formatDuration(asset.duration)}
                    {asset.metadata.width && asset.metadata.height
                      ? ` · ${asset.metadata.width}×${asset.metadata.height}`
                      : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ctx && (
        <div
          className="fixed z-50 min-w-[180px] overflow-hidden rounded border border-[var(--border)] bg-[var(--bg-panel)] py-1 shadow-xl"
          style={{ left: ctx.x, top: ctx.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              window.api.system.openInExplorer(ctx.asset.filePath);
              closeContextMenu();
            }}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-white/5"
          >
            Reveal in Explorer
          </button>
          {ctx.asset.type === 'video' && (
            <button
              type="button"
              disabled={proxyingId === ctx.asset.id}
              onClick={async () => {
                const asset = ctx.asset;
                closeContextMenu();
                setProxyingId(asset.id);
                try {
                  const proxyPath = await window.api.media.generateProxy(asset.id, asset.filePath);
                  setMediaProxyPath(asset.id, proxyPath);
                } catch (err) {
                  console.error('[proxy] generation failed', err);
                } finally {
                  setProxyingId(null);
                }
              }}
              className="block w-full px-3 py-1.5 text-left text-xs hover:bg-white/5 disabled:opacity-50"
            >
              {ctx.asset.proxyPath ? 'Regenerate proxy' : 'Generate proxy'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              removeMediaAsset(ctx.asset.id);
              closeContextMenu();
            }}
            className="block w-full px-3 py-1.5 text-left text-xs hover:bg-white/5"
          >
            Remove from project
          </button>
        </div>
      )}
      {proxyingId && (
        <div className="border-t border-[var(--border)] bg-[var(--accent)]/10 px-2 py-1 text-[10px] text-[var(--accent)]">
          Generating proxy…
        </div>
      )}
    </aside>
  );
}
