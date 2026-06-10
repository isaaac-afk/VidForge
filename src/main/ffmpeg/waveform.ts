import { spawn } from 'node:child_process';
import { writeFile, readFile, access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { resolveFfmpeg } from './resolver';
import { waveformCachePath } from '../cache';

export interface WaveformPeaks {
  /** Sample rate of the peaks (samples per second). */
  sampleRate: number;
  /** Number of audio channels collapsed to mono — always 1 in v1. */
  channels: 1;
  /** Peak amplitude (0..1) per bucket. Length = ceil(duration * sampleRate). */
  peaks: number[];
}

const PEAKS_PER_SECOND = 100;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pipe `ffmpeg -f s16le -ar <bucket-rate * N> -ac 1` raw PCM, then collapse to peaks-per-second.
 * For simplicity we resample directly to PEAKS_PER_SECOND × subsample, then take abs-max within each bucket.
 * For audio waveform display this is fine — we don't need RMS at this stage.
 */
export async function generateWaveformPeaks(
  mediaId: string,
  filePath: string
): Promise<WaveformPeaks> {
  const cachePath = waveformCachePath(mediaId);
  if (await exists(cachePath)) {
    try {
      const raw = await readFile(cachePath, 'utf8');
      return JSON.parse(raw) as WaveformPeaks;
    } catch {
      // Fall through to regenerate on corrupt cache.
    }
  }

  const { ffmpeg } = resolveFfmpeg();

  // Resample to 8 kHz mono int16 LE on stdout.
  const args = [
    '-v', 'error',
    '-i', filePath,
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    '-ac', '1',
    '-ar', '8000',
    '-'
  ];

  const samples: number[] = await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg waveform failed (${code}): ${stderr.slice(0, 500)}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      const out = new Array<number>(buf.length / 2);
      for (let i = 0; i < out.length; i++) {
        // little-endian int16 → normalized -1..1
        out[i] = buf.readInt16LE(i * 2) / 32768;
      }
      resolve(out);
    });
  });

  const sourceRate = 8000;
  const bucketSize = Math.max(1, Math.floor(sourceRate / PEAKS_PER_SECOND));
  const bucketCount = Math.ceil(samples.length / bucketSize);
  const peaks = new Array<number>(bucketCount);
  for (let b = 0; b < bucketCount; b++) {
    let max = 0;
    const start = b * bucketSize;
    const end = Math.min(start + bucketSize, samples.length);
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    peaks[b] = max;
  }

  const result: WaveformPeaks = {
    sampleRate: PEAKS_PER_SECOND,
    channels: 1,
    peaks
  };

  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(result), 'utf8');

  return result;
}
