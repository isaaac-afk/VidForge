import { Modal } from './shared/Modal';

interface AboutDialogProps {
  onClose: () => void;
}

export function AboutDialog({ onClose }: AboutDialogProps) {
  return (
    <Modal
      title="About VidForge"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black"
        >
          Close
        </button>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <div className="text-base font-semibold">VidForge 0.1.0</div>
          <div className="text-[var(--text-secondary)]">Windows desktop video editor</div>
        </div>
        <p className="text-[var(--text-secondary)]">
          Bundles FFmpeg under the GPL. See the README for licensing details.
        </p>
      </div>
    </Modal>
  );
}
