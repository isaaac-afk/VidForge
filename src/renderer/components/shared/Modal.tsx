import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Show the X close button. Defaults to true. */
  showClose?: boolean;
  /** Allow Esc to close. Defaults to true. */
  escClosable?: boolean;
}

export function Modal({ title, onClose, children, footer, showClose = true, escClosable = true }: ModalProps) {
  useEffect(() => {
    if (!escClosable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, escClosable]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
          {showClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </header>
        <div className="px-5 py-4 text-sm text-[var(--text-primary)]">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
