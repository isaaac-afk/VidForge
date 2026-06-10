import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveFfmpeg } from './resolver';

const execFileAsync = promisify(execFile);

interface FfprobeStream {
  index: number;
  codec_type: 'video' | 'audio' | 'subtitle' | 'data';
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
  bit_rate?: string;
  channels?: number;
  sample_rate?: string;
}

interface FfprobeFormat {
  filename: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
  format_name?: string;
}

interface FfprobeOutput {
  streams: FfprobeStream[];
  format: FfprobeFormat;
}

export interface ProbeResult {
  type: 'video' | 'audio' | 'image';
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  bitrate?: number;
  isVfr: boolean;
}

function parseRational(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const [num, den] = value.split('/').map(Number);
  if (!num || !den) return undefined;
  return num / den;
}

const IMAGE_FORMATS = new Set(['png_pipe', 'image2', 'mjpeg', 'jpeg_pipe', 'gif']);

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const { ffprobe } = resolveFfmpeg();
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ];

  let stdout: string;
  try {
    const result = await execFileAsync(ffprobe, args, { maxBuffer: 16 * 1024 * 1024 });
    stdout = result.stdout;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`ffprobe failed for ${filePath}: ${message}`);
  }

  let data: FfprobeOutput;
  try {
    data = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new Error(`ffprobe returned malformed JSON for ${filePath}`);
  }

  const videoStream = data.streams.find((s) => s.codec_type === 'video');
  const audioStream = data.streams.find((s) => s.codec_type === 'audio');
  const format = data.format;
  const isImage = videoStream && IMAGE_FORMATS.has(format.format_name ?? '');

  const duration = Number(format.duration ?? videoStream?.duration ?? audioStream?.duration ?? 0);
  const bitrate = format.bit_rate ? Number(format.bit_rate) : undefined;

  let type: 'video' | 'audio' | 'image';
  if (isImage) type = 'image';
  else if (videoStream) type = 'video';
  else if (audioStream) type = 'audio';
  else throw new Error(`ffprobe found no video or audio stream in ${filePath}`);

  const result: ProbeResult = {
    type,
    duration: Number.isFinite(duration) ? duration : 0,
    bitrate: bitrate && Number.isFinite(bitrate) ? bitrate : undefined,
    isVfr: false
  };

  if (videoStream) {
    result.width = videoStream.width;
    result.height = videoStream.height;
    result.videoCodec = videoStream.codec_name;
    const r = parseRational(videoStream.r_frame_rate);
    const avg = parseRational(videoStream.avg_frame_rate);
    result.fps = avg ?? r;
    if (r && avg && Math.abs(r - avg) / Math.max(r, avg) > 0.01) {
      result.isVfr = true;
    }
  }

  if (audioStream) {
    result.audioCodec = audioStream.codec_name;
    result.audioChannels = audioStream.channels;
    result.audioSampleRate = audioStream.sample_rate ? Number(audioStream.sample_rate) : undefined;
  }

  return result;
}
