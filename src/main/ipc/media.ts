import { BrowserWindow, dialog, ipcMain } from 'electron';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { nanoid } from 'nanoid';
import type { MediaAsset } from '@shared/models';
import { probeMedia } from '../ffmpeg/probe';
import { generateThumbnail } from '../ffmpeg/thumbnail';
import { generateWaveformPeaks, type WaveformPeaks } from '../ffmpeg/waveform';
import { generateProxy } from '../ffmpeg/proxy';
import { allowMediaPath, thumbnailCachePath, thumbnailUrl } from '../cache';

const ACCEPTED_EXTS = new Set([
  '.mp4', '.mov', '.mkv', '.avi', '.webm',
  '.mp3', '.wav', '.aac', '.flac', '.m4a', '.ogg',
  '.png', '.jpg', '.jpeg', '.bmp', '.gif'
]);

const IMPORT_FILTERS: Electron.FileFilter[] = [
  { name: 'Media files', extensions: ['mp4','mov','mkv','avi','webm','mp3','wav','aac','flac','m4a','ogg','png','jpg','jpeg','bmp','gif'] },
  { name: 'Video', extensions: ['mp4','mov','mkv','avi','webm'] },
  { name: 'Audio', extensions: ['mp3','wav','aac','flac','m4a','ogg'] },
  { name: 'Images', extensions: ['png','jpg','jpeg','bmp','gif'] }
];

function isAcceptedFile(filePath: string): boolean {
  return ACCEPTED_EXTS.has(extname(filePath).toLowerCase());
}

async function importOne(filePath: string): Promise<MediaAsset> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`${filePath} is not a regular file`);
  }

  const probed = await probeMedia(filePath);
  const id = nanoid();
  const now = new Date().toISOString();

  const asset: MediaAsset = {
    id,
    filePath,
    fileName: basename(filePath),
    fileSize: fileStat.size,
    type: probed.type,
    duration: probed.duration,
    metadata: {
      width: probed.width,
      height: probed.height,
      fps: probed.fps,
      videoCodec: probed.videoCodec,
      audioCodec: probed.audioCodec,
      audioChannels: probed.audioChannels,
      audioSampleRate: probed.audioSampleRate,
      bitrate: probed.bitrate
    },
    importedAt: now
  };

  // Thumbnails only for video + image assets. Audio gets a waveform later (Phase 2).
  if (probed.type === 'video' || probed.type === 'image') {
    try {
      const outPath = thumbnailCachePath(id);
      // For images, seek=0 is fine; for video, seek to 1s (or 10% in if shorter) to skip the often-black opener.
      const seek = probed.type === 'image' ? 0 : Math.min(1, probed.duration * 0.1);
      await generateThumbnail({ source: filePath, output: outPath, width: 320, seekSeconds: seek });
      asset.thumbnailPath = thumbnailUrl(id);
    } catch (err) {
      // FR-022: probing must succeed. Thumbnails are best-effort — log but don't fail the whole import.
      console.error(`[media] thumbnail failed for ${filePath}:`, err);
    }
  }

  if (probed.isVfr) {
    asset.isVfr = true;
  }

  // Authorise the renderer to stream this absolute path via app://media-source/.
  allowMediaPath(filePath);

  return asset;
}

async function importMedia(filePaths: string[]): Promise<MediaAsset[]> {
  const accepted = filePaths.filter(isAcceptedFile);
  // Run imports in parallel — ffprobe is fast and ffmpeg thumbnails are I/O-bound.
  // We don't limit concurrency at this scale; a 5-file drop fits comfortably.
  const settled = await Promise.allSettled(accepted.map(importOne));
  const out: MediaAsset[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      out.push(r.value);
    } else {
      console.error('[media] import error:', r.reason);
    }
  }
  return out;
}

async function pickFiles(): Promise<string[]> {
  const focused = BrowserWindow.getFocusedWindow();
  const result = focused
    ? await dialog.showOpenDialog(focused, {
        title: 'Import Media',
        filters: IMPORT_FILTERS,
        properties: ['openFile', 'multiSelections']
      })
    : await dialog.showOpenDialog({
        title: 'Import Media',
        filters: IMPORT_FILTERS,
        properties: ['openFile', 'multiSelections']
      });
  if (result.canceled) return [];
  return result.filePaths;
}

async function generateWaveform(mediaId: string, filePath: string): Promise<WaveformPeaks> {
  // Renderer hands us the absolute path it has in the project — main verifies it exists
  // before passing to ffmpeg (probe.ts also throws cleanly if not).
  return generateWaveformPeaks(mediaId, filePath);
}

export function registerMediaIpc(): void {
  ipcMain.handle('media:import', (_event, filePaths: string[]) => importMedia(filePaths));
  ipcMain.handle('media:pickFiles', () => pickFiles());
  ipcMain.handle('media:generateWaveform', (_event, mediaId: string, filePath: string) =>
    generateWaveform(mediaId, filePath)
  );
  ipcMain.handle('media:generateProxy', async (_event, mediaId: string, filePath: string) => {
    const result = await generateProxy(mediaId, filePath);
    return result.filePath;
  });
}
