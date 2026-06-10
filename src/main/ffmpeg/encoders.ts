import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveFfmpeg } from './resolver';

const execFileAsync = promisify(execFile);

const CANDIDATES = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'hevc_nvenc', 'hevc_qsv', 'hevc_amf'] as const;
export type HardwareEncoder = (typeof CANDIDATES)[number];

let cached: HardwareEncoder[] | null = null;

/**
 * Run `ffmpeg -encoders` once and cache which hardware encoders the system advertises.
 * Presence in this list means ffmpeg can list them — it does NOT guarantee the encode
 * succeeds (drivers may be missing). We surface that as an error at export time.
 */
export async function detectEncoders(): Promise<HardwareEncoder[]> {
  if (cached) return cached;
  const { ffmpeg } = resolveFfmpeg();
  try {
    const { stdout } = await execFileAsync(ffmpeg, ['-hide_banner', '-encoders'], {
      maxBuffer: 8 * 1024 * 1024
    });
    const present: HardwareEncoder[] = [];
    for (const name of CANDIDATES) {
      // ffmpeg -encoders rows look like " V..... h264_nvenc           NVIDIA NVENC H.264 encoder"
      const re = new RegExp(`\\s${name}\\s`, 'i');
      if (re.test(stdout)) present.push(name);
    }
    cached = present;
    return present;
  } catch {
    cached = [];
    return [];
  }
}

export function resetEncoderCache(): void {
  cached = null;
}
