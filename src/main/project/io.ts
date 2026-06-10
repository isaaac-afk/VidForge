import { writeFile, rename, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Project } from '@shared/models';
import { migrate, CURRENT_SCHEMA_VERSION } from './migrations';

/**
 * Atomic project write per NFR-012: write to a sibling .tmp file, then rename.
 * Rename is atomic on Windows when source + dest are on the same volume.
 */
export async function writeProjectFile(filePath: string, project: Project): Promise<void> {
  const stamped: Project = {
    ...project,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    modifiedAt: new Date().toISOString()
  };
  const json = JSON.stringify(stamped, null, 2);

  // Use a sibling .tmp file so rename stays on the same volume.
  const tmpName = `.${basename(filePath)}.${randomBytes(4).toString('hex')}.tmp`;
  const tmpPath = join(filePath, '..', tmpName);
  try {
    await writeFile(tmpPath, json, 'utf8');
    await rename(tmpPath, filePath);
  } catch (err) {
    // If write/rename failed, do not leave the .tmp file lingering.
    try {
      await rename(tmpPath, join(tmpdir(), tmpName));
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
}

export async function readProjectFile(filePath: string): Promise<Project> {
  const raw = await readFile(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ${filePath} as JSON: ${message}`);
  }
  return migrate(parsed);
}
