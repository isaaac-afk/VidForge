import { Modal } from './shared/Modal';

interface ErrorDialogProps {
  title: string;
  message: string;
  onClose: () => void;
}

export function ErrorDialog({ title, message, onClose }: ErrorDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black"
        >
          OK
        </button>
      }
    >
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm text-[var(--text-primary)]">
        {message}
      </pre>
    </Modal>
  );
}
