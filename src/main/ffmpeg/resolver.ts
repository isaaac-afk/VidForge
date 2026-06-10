import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface FfmpegPaths {
  ffmpeg: string;
  ffprobe: string;
  source: 'bundled' | 'dev-resources' | 'path';
}

let cached: FfmpegPaths | null = null;

function fromBundled(): FfmpegPaths | null {
  if (!app.isPackaged) return null;
  const root = join(process.resourcesPath, 'ffmpeg');
  const ffmpeg = join(root, 'ffmpeg.exe');
  const ffprobe = join(root, 'ffprobe.exe');
  return existsSync(ffmpeg) && existsSync(ffprobe)
    ? { ffmpeg, ffprobe, source: 'bundled' }
    : null;
}

function fromDevResources(): FfmpegPaths | null {
  if (app.isPackaged) return null;
  const root = join(process.cwd(), 'resources', 'ffmpeg');
  const ffmpeg = join(root, 'ffmpeg.exe');
  const ffprobe = join(root, 'ffprobe.exe');
  return existsSync(ffmpeg) && existsSync(ffprobe)
    ? { ffmpeg, ffprobe, source: 'dev-resources' }
    : null;
}

function fromPath(): FfmpegPaths {
  // Fallback for dev: trust ffmpeg/ffprobe on PATH (child_process resolves via PATH).
  return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', source: 'path' };
}

export function resolveFfmpeg(): FfmpegPaths {
  if (cached) return cached;
  cached = fromBundled() ?? fromDevResources() ?? fromPath();
  return cached;
}

export function resetFfmpegCache(): void {
  cached = null;
}
