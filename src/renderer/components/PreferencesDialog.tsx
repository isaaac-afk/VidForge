import { useEffect, useState } from 'react';
import type { UserSettings } from '@shared/models';
import { Modal } from './shared/Modal';

interface PreferencesDialogProps {
  onClose: () => void;
}

type Section = 'general' | 'editing' | 'audio' | 'hardware' | 'shortcuts';

export function PreferencesDialog({ onClose }: PreferencesDialogProps) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [section, setSection] = useState<Section>('general');
  const [encoders, setEncoders] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await window.api.settings.getAll();
      if (cancelled) return;
      setSettings(all);
      const e = await window.api.system.detectEncoders();
      if (!cancelled) setEncoders(e);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings) {
    return (
      <Modal onClose={onClose} title="Preferences">
        <div className="text-xs text-[var(--text-secondary)]">Loading…</div>
      </Modal>
    );
  }

  const update = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings({ ...settings, [key]: value });
    await window.api.settings.set(key, value);
  };

  return (
    <Modal onClose={onClose} title="Preferences">
      <div className="flex gap-4 text-xs">
        <nav className="flex w-32 flex-shrink-0 flex-col gap-0.5">
          {(['general', 'editing', 'audio', 'hardware', 'shortcuts'] as Section[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`rounded px-2 py-1 text-left capitalize ${
                section === s
                  ? 'bg-[var(--accent)]/20 text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="flex-1 space-y-3 text-[var(--text-primary)]">
          {section === 'general' && (
            <>
              <Row label="Theme">
                <select
                  value={settings.theme}
                  onChange={(e) => update('theme', e.target.value as 'dark' | 'light')}
                  className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-0.5"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </Row>
              <Row label="Default export preset">
                <select
                  value={settings.defaultExportPreset}
                  onChange={(e) => update('defaultExportPreset', e.target.value)}
                  className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-0.5"
                >
                  <option value="mp4_1080p">1080p MP4</option>
                  <option value="mp4_720p">720p MP4</option>
                  <option value="mp4_4k">4K MP4</option>
                </select>
              </Row>
            </>
          )}
          {section === 'editing' && (
            <Row label="Autosave interval (seconds)">
              <input
                type="number"
                min={10}
                max={3600}
                value={settings.autoSaveIntervalSeconds}
                onChange={(e) => update('autoSaveIntervalSeconds', Math.max(10, Math.min(3600, Number(e.target.value))))}
                className="w-24 rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-0.5"
              />
            </Row>
          )}
          {section === 'audio' && (
            <Row label="Proxy resolution (height)">
              <select
                value={settings.proxyResolution}
                onChange={(e) => update('proxyResolution', Number(e.target.value) as 360 | 540 | 720)}
                className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-0.5"
              >
                <option value={360}>360p</option>
                <option value={540}>540p</option>
                <option value={720}>720p</option>
              </select>
            </Row>
          )}
          {section === 'hardware' && (
            <>
              <Row label="Hardware encoding">
                <select
                  value={settings.hardwareAcceleration}
                  onChange={(e) =>
                    update(
                      'hardwareAcceleration',
                      e.target.value as UserSettings['hardwareAcceleration']
                    )
                  }
                  className="rounded border border-[var(--border)] bg-[var(--bg-app)] px-2 py-0.5"
                >
                  <option value="auto">Auto</option>
                  <option value="nvenc" disabled={!encoders.includes('h264_nvenc')}>
                    NVENC{encoders.includes('h264_nvenc') ? '' : ' (not detected)'}
                  </option>
                  <option value="qsv" disabled={!encoders.includes('h264_qsv')}>
                    QuickSync{encoders.includes('h264_qsv') ? '' : ' (not detected)'}
                  </option>
                  <option value="amf" disabled={!encoders.includes('h264_amf')}>
                    AMF{encoders.includes('h264_amf') ? '' : ' (not detected)'}
                  </option>
                  <option value="off">Off (software only)</option>
                </select>
              </Row>
              <div className="text-[10px] text-[var(--text-secondary)]">
                Detected: {encoders.length ? encoders.join(', ') : 'none'}
              </div>
            </>
          )}
          {section === 'shortcuts' && (
            <p className="text-[var(--text-secondary)]">
              Press <span className="font-mono text-[var(--text-primary)]">?</span> anywhere in the editor to open
              the full shortcut reference. Custom remapping is planned for a future release.
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-[var(--border)] px-3 py-1 hover:bg-white/5"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

interface RowProps {
  label: string;
  children: React.ReactNode;
}

function Row({ label, children }: RowProps) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
