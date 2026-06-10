/**
 * Format seconds as HH:MM:SS:FF using the given fps.
 * Frame component is floor(fraction * fps).
 */
export function formatTimecode(seconds: number, fps: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  if (!Number.isFinite(fps) || fps <= 0) fps = 30;
  const totalFrames = Math.round(seconds * fps);
  const frames = totalFrames % Math.round(fps);
  const totalSeconds = Math.floor(totalFrames / Math.round(fps));
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return [h, m, s, frames].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Format seconds as a friendly H:MM:SS or M:SS — used for clip durations in Media Bin.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Parse a timecode string ("HH:MM:SS:FF" or "MM:SS") back to seconds. Returns null on bad input.
 */
export function parseTimecode(input: string, fps: number): number | null {
  const parts = input.trim().split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 4) {
    const [h, m, s, f] = parts;
    return h * 3600 + m * 60 + s + f / Math.max(fps, 1);
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  if (parts.length === 1) return parts[0];
  return null;
}
