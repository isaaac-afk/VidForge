import type { Project } from '@shared/models';

export const CURRENT_SCHEMA_VERSION = 1 as const;

type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations are pure JSON-to-JSON transforms keyed by the OUTPUT schemaVersion.
 * To bump from v1 → v2, add an entry under key 2.
 */
const migrations: Record<number, Migration> = {
  // 1: initial — no transform needed
};

export function migrate(input: unknown): Project {
  if (!input || typeof input !== 'object') {
    throw new Error('Project file does not contain a JSON object');
  }
  const obj = input as Record<string, unknown>;
  let version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 0;
  let working: Record<string, unknown> = obj;

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Project schema v${version} is newer than this build (v${CURRENT_SCHEMA_VERSION}). Update the app to open it.`
    );
  }

  while (version < CURRENT_SCHEMA_VERSION) {
    version += 1;
    const step = migrations[version];
    if (!step) {
      throw new Error(`No migration defined for schema v${version}`);
    }
    working = step(working);
    working.schemaVersion = version;
  }

  return working as unknown as Project;
}
