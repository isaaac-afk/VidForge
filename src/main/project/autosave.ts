import { writeFile, rename, readFile, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Project } from '@shared/models';
import { migrate, CURRENT_SCHEMA_VERSION } from './migrations';

export function autosavePathFor(projectFilePath: string): string {
  return `${projectFilePath}.autosave`;
}

/** Write a Project snapshot to `<path>.autosave` atomically. Independent from regular save. */
export async function writeAutosave(projectFilePath: string, project: Project): Promise<void> {
  const stamped: Project = {
    ...project,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    modifiedAt: new Date().toISOString()
  };
  const json = JSON.stringify(stamped);
  const out = autosavePathFor(projectFilePath);
  const tmpName = `.${basename(out)}.${randomBytes(4).toString('hex')}.tmp`;
  const tmpPath = join(dirname(out), tmpName);
  await writeFile(tmpPath, json, 'utf8');
  await rename(tmpPath, out);
}

/** Remove the autosave sidecar (e.g. after a successful manual save). Best-effort. */
export async function clearAutosave(projectFilePath: string): Promise<void> {
  const out = autosavePathFor(projectFilePath);
  try {
    if (existsSync(out)) await unlink(out);
  } catch {
    // best-effort
  }
}

/**
 * Return the autosave Project if it's strictly newer than the saved .vedit.
 * Returns null if no autosave, autosave is older, or autosave can't be parsed.
 */
export async function loadIfNewerAutosave(projectFilePath: string): Promise<Project | null> {
  const autoPath = autosavePathFor(projectFilePath);
  if (!existsSync(autoPath)) return null;
  let savedMtime = 0;
  if (existsSync(projectFilePath)) {
    try {
      savedMtime = (await stat(projectFilePath)).mtimeMs;
    } catch {
      // ignore
    }
  }
  try {
    const autoStat = await stat(autoPath);
    if (autoStat.mtimeMs <= savedMtime) return null;
    const raw = await readFile(autoPath, 'utf8');
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}
