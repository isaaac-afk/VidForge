import { registerProjectIpc } from './project';
import { registerMediaIpc } from './media';
import { registerSystemIpc } from './system';
import { registerSettingsIpc } from './settings';
import { registerExportIpc } from './export';

export function registerIpcHandlers(): void {
  registerProjectIpc();
  registerMediaIpc();
  registerSystemIpc();
  registerSettingsIpc();
  registerExportIpc();
}
