import { spawn, type ChildProcess } from 'node:child_process';
import { nanoid } from 'nanoid';
import type { Clip, Project, Track } from '@shared/models';
import type { ExportOptions } from '@shared/contracts';
import { ffmpegColorFilter } from '@shared/colorCorrection';
import { resolveFfmpeg } from './resolver';

const EPS = 0.001;

export interface RenderProgress {
  jobId: string;
  percent: number;
  eta: number;
}

export interface RenderEvents {
  onProgress: (p: RenderProgress) => void;
  onError: (jobId: string, message: string) => void;
  onComplete: (jobId: string, outputPath: string) => void;
}

interface RunningJob {
  jobId: string;
  child: ChildProcess;
}

const running = new Map<string, RunningJob>();

interface PresetSpec {
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  videoArgs: string[];
  audioCodec: string;
  audioArgs: string[];
}

function presetSpec(project: Project, options: ExportOptions): PresetSpec {
  if (options.preset === 'custom' && options.customSettings) {
    const c = options.customSettings;
    return {
      width: c.width,
      height: c.height,
      fps: c.fps,
      videoCodec: c.videoCodec,
      videoArgs: videoCodecArgs(c.videoCodec, c.crf, c.bitrate),
      audioCodec: c.audioCodec,
      audioArgs: ['-b:a', c.bitrate ?? '192k']
    };
  }
  const fps = project.settings.fps;
  const dims = options.preset === 'mp4_4k'
    ? { width: 3840, height: 2160 }
    : options.preset === 'mp4_720p'
      ? { width: 1280, height: 720 }
      : { width: 1920, height: 1080 };
  return {
    width: dims.width,
    height: dims.height,
    fps,
    videoCodec: 'libx264',
    videoArgs: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p'],
    audioCodec: 'aac',
    audioArgs: ['-c:a', 'aac', '-b:a', '192k']
  };
}

function videoCodecArgs(codec: string, crf?: number, bitrate?: string): string[] {
  // Hardware encoders ignore CRF; use bitrate or default.
  if (codec === 'libx264' || codec === 'libx265') {
    return ['-c:v', codec, '-preset', 'medium', '-crf', String(crf ?? 20), '-pix_fmt', 'yuv420p'];
  }
  return ['-c:v', codec, '-b:v', bitrate ?? '8M', '-pix_fmt', 'yuv420p'];
}

/** Range of the timeline being exported (after honouring inPoint/outPoint). */
function exportRange(project: Project, options: ExportOptions): { start: number; end: number } {
  const totalEnd = projectDuration(project);
  if (options.useInOutPoints && project.inPoint !== null && project.outPoint !== null
    && project.outPoint > project.inPoint) {
    return { start: project.inPoint, end: Math.min(project.outPoint, totalEnd) };
  }
  return { start: 0, end: totalEnd };
}

function projectDuration(project: Project): number {
  let max = 0;
  for (const t of project.tracks) {
    for (const c of t.clips) {
      const end = c.trackTime + c.duration;
      if (end > max) max = end;
    }
  }
  return max;
}

function visibleVideoTracksTopFirst(project: Project): Track[] {
  return project.tracks.filter((t) => t.kind === 'video' && !t.hidden);
}

function activeAudioTracks(project: Project): Track[] {
  const soloed = project.tracks.some((t) => t.kind === 'audio' && t.soloed);
  return project.tracks.filter(
    (t) => t.kind === 'audio' && !t.muted && (!soloed || t.soloed)
  );
}

function topmostVideoClipAt(project: Project, time: number): { track: Track; clip: Clip } | null {
  for (const track of visibleVideoTracksTopFirst(project)) {
    const c = track.clips.find((cl) => cl.trackTime - EPS <= time && time < cl.trackTime + cl.duration - EPS);
    if (c) return { track, clip: c };
  }
  return null;
}

/**
 * Check the FR-128 fast path: single video clip, single audio clip (or none), no effects,
 * no speed/reversal, no fades, no In/Out trimming, and the source codecs already match the
 * target. When this holds, we can stream-copy the file instead of re-encoding.
 */
export function detectFastPath(project: Project, options: ExportOptions): {
  filePath: string;
  startSeconds: number;
  durationSeconds: number;
} | null {
  if (options.useInOutPoints) return null;
  const videoTracks = project.tracks.filter((t) => t.kind === 'video');
  const audioTracks = project.tracks.filter((t) => t.kind === 'audio');
  const videoClips = videoTracks.flatMap((t) => t.clips);
  const audioClips = audioTracks.flatMap((t) => t.clips);
  if (videoClips.length !== 1) return null;
  if (audioClips.length > 1) return null;
  const v = videoClips[0];
  if (v.speed !== 1 || v.reversed) return null;
  if (v.fadeInDuration > 0 || v.fadeOutDuration > 0) return null;
  if (v.effects.length > 0) return null;
  if (audioClips.length === 1) {
    const a = audioClips[0];
    // Must be the same source media as the video clip, in sync.
    if (a.mediaId !== v.mediaId) return null;
    if (a.trackTime !== v.trackTime || Math.abs(a.duration - v.duration) > EPS) return null;
    if (a.speed !== 1 || a.reversed) return null;
  }
  const asset = project.mediaPool.find((m) => m.id === v.mediaId);
  if (!asset) return null;
  if (asset.metadata.videoCodec !== 'h264') return null;
  if (asset.metadata.audioCodec && asset.metadata.audioCodec !== 'aac') return null;
  // Only safe to copy when the target preset isn't asking for a different resolution/fps.
  const target = presetSpec(project, options);
  if (target.width !== asset.metadata.width || target.height !== asset.metadata.height) return null;
  if (asset.metadata.fps && Math.abs(target.fps - asset.metadata.fps) > 0.5) return null;
  return {
    filePath: asset.filePath,
    startSeconds: v.sourceIn,
    durationSeconds: v.duration
  };
}

interface BuiltGraph {
  args: string[];
  totalDuration: number;
}

/**
 * Build the ffmpeg command line for a re-encode export. The graph rebuilds the timeline as a
 * sequence of segments (split at every clip boundary on any track). Each segment's video comes
 * from the topmost-active video track; audio is the sum of all enabled audio tracks during it.
 */
export function buildExportCommand(
  project: Project,
  options: ExportOptions
): BuiltGraph {
  const target = presetSpec(project, options);
  const { width: W, height: H, fps: FPS } = target;
  const { start: rangeStart, end: rangeEnd } = exportRange(project, options);
  const totalDuration = Math.max(0.04, rangeEnd - rangeStart);

  // Collect unique source media paths used by clips within the range; build input indices.
  const inputPaths: string[] = [];
  const inputIndex = new Map<string, number>(); // mediaId → input index
  const indexFor = (mediaId: string): number | null => {
    const existing = inputIndex.get(mediaId);
    if (existing !== undefined) return existing;
    const asset = project.mediaPool.find((m) => m.id === mediaId);
    if (!asset) return null;
    const idx = inputPaths.length;
    inputPaths.push(asset.filePath);
    inputIndex.set(mediaId, idx);
    return idx;
  };

  // Compute boundaries — every clip-start and clip-end intersected with the range.
  const boundaries = new Set<number>([rangeStart, rangeEnd]);
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const a = clip.trackTime;
      const b = clip.trackTime + clip.duration;
      if (b <= rangeStart + EPS || a >= rangeEnd - EPS) continue;
      boundaries.add(Math.max(rangeStart, a));
      boundaries.add(Math.min(rangeEnd, b));
    }
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  // --- Build video segment chain ---
  const videoLabels: string[] = [];
  const filterParts: string[] = [];
  let segIdx = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i];
    const segEnd = sorted[i + 1];
    const segDur = segEnd - segStart;
    if (segDur <= EPS) continue;
    const segLabel = `vseg${segIdx}`;
    segIdx++;
    const topmost = topmostVideoClipAt(project, segStart + EPS);
    if (topmost) {
      const idx = indexFor(topmost.clip.mediaId);
      if (idx === null) continue;
      const sourceStart = topmost.clip.sourceIn + (segStart - topmost.clip.trackTime);
      const sourceEnd = sourceStart + segDur;
      const color = ffmpegColorFilter(topmost.clip);
      const colorPart = color ? `,${color}` : '';
      filterParts.push(
        `[${idx}:v]trim=start=${sourceStart.toFixed(6)}:end=${sourceEnd.toFixed(6)},` +
          `setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
          `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1${colorPart},fps=${FPS}[${segLabel}]`
      );
    } else {
      filterParts.push(
        `color=c=black:s=${W}x${H}:d=${segDur.toFixed(6)}:rate=${FPS}[${segLabel}]`
      );
    }
    videoLabels.push(segLabel);
  }

  if (videoLabels.length === 0) {
    // Nothing to render — emit one black frame.
    filterParts.push(`color=c=black:s=${W}x${H}:d=${totalDuration.toFixed(6)}:rate=${FPS}[vseg0]`);
    videoLabels.push('vseg0');
  }

  if (videoLabels.length === 1) {
    filterParts.push(`[${videoLabels[0]}]copy[out_v]`);
  } else {
    filterParts.push(
      `${videoLabels.map((l) => `[${l}]`).join('')}concat=n=${videoLabels.length}:v=1:a=0[out_v]`
    );
  }

  // --- Build audio mix ---
  const SR = project.settings.sampleRate;
  const audioClipLabels: string[] = [];
  let aIdx = 0;
  for (const track of activeAudioTracks(project)) {
    for (const clip of track.clips) {
      // Skip clips that don't intersect the export range.
      const cStart = clip.trackTime;
      const cEnd = clip.trackTime + clip.duration;
      if (cEnd <= rangeStart + EPS || cStart >= rangeEnd - EPS) continue;
      const idx = indexFor(clip.mediaId);
      if (idx === null) continue;
      const overlapStart = Math.max(rangeStart, cStart);
      const overlapEnd = Math.min(rangeEnd, cEnd);
      const sourceStart = clip.sourceIn + (overlapStart - cStart);
      const sourceEnd = sourceStart + (overlapEnd - overlapStart);
      const delayMs = Math.max(0, (overlapStart - rangeStart) * 1000);
      const label = `ac${aIdx++}`;
      const vol = clip.volume.toFixed(4);
      const adelay = delayMs > 0 ? `,adelay=${delayMs.toFixed(0)}|${delayMs.toFixed(0)}` : '';
      filterParts.push(
        `[${idx}:a]atrim=start=${sourceStart.toFixed(6)}:end=${sourceEnd.toFixed(6)},` +
          `asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo,volume=${vol}${adelay}[${label}]`
      );
      audioClipLabels.push(label);
    }
  }

  if (audioClipLabels.length === 0) {
    filterParts.push(
      `anullsrc=channel_layout=stereo:sample_rate=${SR}:duration=${totalDuration.toFixed(6)}[out_a]`
    );
  } else if (audioClipLabels.length === 1) {
    filterParts.push(
      `[${audioClipLabels[0]}]aresample=${SR},apad,atrim=0:${totalDuration.toFixed(6)},asetpts=PTS-STARTPTS[out_a]`
    );
  } else {
    filterParts.push(
      `${audioClipLabels.map((l) => `[${l}]`).join('')}` +
        `amix=inputs=${audioClipLabels.length}:duration=longest:normalize=0,` +
        `aresample=${SR},apad,atrim=0:${totalDuration.toFixed(6)},asetpts=PTS-STARTPTS[out_a]`
    );
  }

  const args: string[] = ['-hide_banner', '-y'];
  for (const p of inputPaths) {
    args.push('-i', p);
  }
  args.push('-filter_complex', filterParts.join(';'));
  args.push('-map', '[out_v]', '-map', '[out_a]');
  args.push(...target.videoArgs);
  args.push(...target.audioArgs);
  args.push('-movflags', '+faststart');
  args.push('-r', String(FPS));
  args.push(options.outputPath);

  return { args, totalDuration };
}

/**
 * Build the fast-path -c copy command for trivial single-clip exports (FR-128).
 */
function buildFastPathCommand(fp: { filePath: string; startSeconds: number; durationSeconds: number }, outputPath: string): { args: string[]; totalDuration: number } {
  const args = [
    '-hide_banner', '-y',
    '-ss', fp.startSeconds.toFixed(6),
    '-i', fp.filePath,
    '-t', fp.durationSeconds.toFixed(6),
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    outputPath
  ];
  return { args, totalDuration: fp.durationSeconds };
}

const TIME_RE = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/;

/** Spawn ffmpeg and stream progress until completion. Returns the jobId synchronously. */
export function startExport(project: Project, options: ExportOptions, events: RenderEvents): string {
  const fastPath = detectFastPath(project, options);
  const built = fastPath
    ? buildFastPathCommand(fastPath, options.outputPath)
    : buildExportCommand(project, options);
  const { ffmpeg } = resolveFfmpeg();
  const jobId = nanoid();
  const child = spawn(ffmpeg, built.args, { stdio: ['ignore', 'pipe', 'pipe'] });
  running.set(jobId, { jobId, child });

  const startedAt = Date.now();
  let lastErr = '';
  let leftover = '';

  child.stderr.on('data', (chunk: Buffer) => {
    const text = leftover + chunk.toString('utf8');
    const lines = text.split(/\r?\n|\r/);
    leftover = lines.pop() ?? '';
    for (const line of [...lines, leftover]) {
      lastErr = line.slice(0, 1000);
      const m = TIME_RE.exec(line);
      if (!m) continue;
      const h = Number(m[1]);
      const min = Number(m[2]);
      const s = Number(m[3]);
      const currentSec = h * 3600 + min * 60 + s;
      const total = Math.max(0.01, built.totalDuration);
      const percent = Math.max(0, Math.min(100, (currentSec / total) * 100));
      const elapsed = (Date.now() - startedAt) / 1000;
      const eta = percent > 1 ? Math.max(0, (elapsed / (percent / 100)) - elapsed) : 0;
      events.onProgress({ jobId, percent, eta });
    }
  });

  child.on('error', (err) => {
    running.delete(jobId);
    events.onError(jobId, err.message);
  });
  child.on('close', (code, signal) => {
    running.delete(jobId);
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      events.onError(jobId, 'Export cancelled');
      return;
    }
    if (code === 0) {
      events.onProgress({ jobId, percent: 100, eta: 0 });
      events.onComplete(jobId, options.outputPath);
    } else {
      const tail = lastErr || `ffmpeg exited with code ${code}`;
      events.onError(jobId, tail);
    }
  });

  return jobId;
}

export function cancelExport(jobId: string): boolean {
  const job = running.get(jobId);
  if (!job) return false;
  try {
    job.child.kill('SIGTERM');
    return true;
  } catch {
    return false;
  }
}
