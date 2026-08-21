import { useEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Native <dialog> skinned as an OSRS panel: focus trap and Esc for free. */
export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={clsx('osrs-modal', className)}
      onClose={onClose}
      onMouseDown={(event) => {
        // A click on the dialog element itself is a click on the backdrop.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="osrs-modal__frame osrs-panel">
        <h2 className="osrs-panel__title">
          {title}
          <button type="button" className="osrs-modal__x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </h2>
        <div className="osrs-modal__body">{open ? children : null}</div>
      </div>
    </dialog>
  );
}
