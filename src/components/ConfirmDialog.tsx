import type { ReactNode } from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title?: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p style={{ marginTop: 0 }}>{message}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="osrs-btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? 'osrs-btn osrs-btn--danger' : 'osrs-btn osrs-btn--primary'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
