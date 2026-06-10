import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveFfmpeg } from './resolver';

const execFileAsync = promisify(execFile);

export interface ThumbnailOptions {
  /** Source media absolute path */
  source: string;
  /** Output JPG absolute path */
  output: string;
  /** Width of the thumbnail in pixels (height auto by aspect ratio). Default 320. */
  width?: number;
  /** Seek to this many seconds before grabbing the frame. Default 0. */
  seekSeconds?: number;
  /** Reuse existing thumbnail if present (default true). */
  reuseExisting?: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function generateThumbnail(opts: ThumbnailOptions): Promise<string> {
  const { source, output, width = 320, seekSeconds = 0, reuseExisting = true } = opts;

  if (reuseExisting && (await exists(output))) {
    return output;
  }

  await mkdir(dirname(output), { recursive: true });

  const { ffmpeg } = resolveFfmpeg();
  // -ss before -i is the fast seek (uses keyframe); for thumbnails that's fine.
  // We use the "thumbnail" filter to pick a representative frame from a short window —
  // this is what FFmpeg recommends to avoid all-black opening frames.
  const args = [
    '-ss', String(seekSeconds),
    '-i', source,
    '-frames:v', '1',
    '-vf', `thumbnail,scale=${width}:-1`,
    '-q:v', '3',
    '-y',
    output
  ];

  try {
    await execFileAsync(ffmpeg, args, { maxBuffer: 8 * 1024 * 1024 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`ffmpeg thumbnail failed for ${source}: ${message}`);
  }

  return output;
}
