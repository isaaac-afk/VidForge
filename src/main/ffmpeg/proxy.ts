import { spawn } from 'node:child_process';
import { mkdir, access, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveFfmpeg } from './resolver';
import { proxyCachePath } from '../cache';

export interface ProxyResult {
  /** Absolute path to the generated proxy file. */
  filePath: string;
  /** Already existed at the start of the call. */
  cached: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const inFlight = new Map<string, Promise<ProxyResult>>();

/**
 * Generate a 540p H.264 proxy for the given source. Subsequent calls for the same media ID
 * deduplicate via an in-flight promise map, and cached results return instantly. Per
 * the TRD's example command in Appendix B.
 */
export function generateProxy(mediaId: string, sourcePath: string, resolutionHeight = 540): Promise<ProxyResult> {
  const existing = inFlight.get(mediaId);
  if (existing) return existing;
  const promise = (async (): Promise<ProxyResult> => {
    const out = proxyCachePath(mediaId);
    if (await exists(out)) {
      const st = await stat(out);
      if (st.size > 0) {
        return { filePath: out, cached: true };
      }
    }
    await mkdir(dirname(out), { recursive: true });
    const { ffmpeg } = resolveFfmpeg();
    const args = [
      '-hide_banner', '-y',
      '-i', sourcePath,
      '-vf', `scale=-2:${resolutionHeight}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      out
    ];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (c: Buffer) => {
        stderr += c.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`proxy generation failed (${code}): ${stderr.slice(-500)}`));
      });
    });
    return { filePath: out, cached: false };
  })();
  inFlight.set(mediaId, promise);
  promise.finally(() => inFlight.delete(mediaId));
  return promise;
}
