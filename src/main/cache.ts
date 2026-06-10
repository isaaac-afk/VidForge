import { app, net, protocol } from 'electron';
import { mkdir } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_PROTOCOL = 'app';

/**
 * Absolute media file paths the renderer is allowed to stream via app://media-source/.
 * Populated from media imports + project loads. Bounded by user actions: only paths the
 * user picked through the import dialog (or paths already saved in a project they opened)
 * are streamable.
 */
const mediaAllowlist = new Set<string>();

export function allowMediaPath(filePath: string): void {
  mediaAllowlist.add(normalize(filePath));
}

export function allowMediaPaths(filePaths: Iterable<string>): void {
  for (const p of filePaths) allowMediaPath(p);
}

export function cacheRoot(): string {
  return join(app.getPath('userData'), 'cache');
}

export function thumbnailCachePath(mediaId: string): string {
  return join(cacheRoot(), 'thumbnails', `${mediaId}.jpg`);
}

export function thumbnailUrl(mediaId: string): string {
  return `app://thumbnails/${mediaId}.jpg`;
}

export function waveformCachePath(mediaId: string): string {
  return join(cacheRoot(), 'waveforms', `${mediaId}.json`);
}

export function proxyCachePath(mediaId: string): string {
  return join(cacheRoot(), 'proxies', `${mediaId}.mp4`);
}

/** URL the renderer hands to <video src> when a proxy is being previewed. */
export function proxyUrl(mediaId: string): string {
  return `app://proxies/${mediaId}.mp4`;
}

/**
 * Build the streaming URL for an absolute media path.
 * Renderer assigns this to <video src> / <audio src>.
 */
export function mediaSourceUrl(filePath: string): string {
  // Encode the absolute path as a single URL-safe path segment so the protocol handler
  // can reverse it without ambiguity. encodeURIComponent escapes /, \, : and spaces.
  return `app://media-source/${encodeURIComponent(filePath)}`;
}

export async function ensureCacheDirs(): Promise<void> {
  await mkdir(join(cacheRoot(), 'thumbnails'), { recursive: true });
  await mkdir(join(cacheRoot(), 'waveforms'), { recursive: true });
  await mkdir(join(cacheRoot(), 'proxies'), { recursive: true });
}

/**
 * Privileged scheme registration. Must be called BEFORE app.whenReady().
 */
export function registerAppProtocol(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: false
      }
    }
  ]);
}

/**
 * Mount the `app://` protocol. Two hosts:
 *   - app://media-source/<encoded-abs-path>  → stream user media files (allowlist gated)
 *   - app://<anything-else>/<rel-path>       → serve cache subdir (thumbnails, waveforms, …)
 *
 * Call inside app.whenReady().
 */
export function mountAppProtocol(): void {
  const root = cacheRoot();
  protocol.handle(APP_PROTOCOL, async (req) => {
    const url = new URL(req.url);
    const host = url.host;

    if (host === 'media-source') {
      // The full path-after-host is a single encoded segment.
      const encoded = url.pathname.replace(/^\/+/, '');
      let abs: string;
      try {
        abs = decodeURIComponent(encoded);
      } catch {
        return new Response('bad path', { status: 400 });
      }
      const normalized = normalize(abs);
      if (!mediaAllowlist.has(normalized)) {
        return new Response('forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(normalized).href);
    }

    const decoded = decodeURIComponent(url.pathname);
    const safe = normalize(decoded).replace(/^[\\/]+/, '');
    if (safe.includes('..')) {
      return new Response('forbidden', { status: 403 });
    }
    const filePath = join(root, host, safe);
    return net.fetch(pathToFileURL(filePath).href);
  });
}
