import { useEffect } from 'react';
import clsx from 'clsx';
import type { Toast } from '@/store/uiStore';
import { useUiStore } from '@/store/uiStore';

const TOAST_MS = 6000;

function ToastItem({ toast }: { toast: Toast }) {
  const dismissToast = useUiStore((s) => s.dismissToast);
  useEffect(() => {
    const handle = setTimeout(() => dismissToast(toast.id), TOAST_MS);
    return () => clearTimeout(handle);
  }, [toast.id, dismissToast]);
  return (
    <div
      className={clsx('toast', 'osrs-panel', `toast--${toast.kind}`)}
      onClick={() => dismissToast(toast.id)}
      role="status"
    >
      {toast.text}
    </div>
  );
}

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
