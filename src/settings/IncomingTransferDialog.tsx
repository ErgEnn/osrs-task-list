import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useUiStore } from '@/store/uiStore';
import { mergeIntoStore } from '@/sync/apply';
import { exportBundle, type SyncBundle } from '@/sync/bundle';
import { describeMergePlan, mergeBundles, summarizeReport } from '@/sync/merge';
import { decodeTransfer, readTransferHash } from '@/sync/transfer';

/**
 * Handles `#transfer=…` links: decode on load, show what the merge would do,
 * and clear the fragment either way so a reload does not re-prompt.
 */
export function IncomingTransferDialog() {
  const pushToast = useUiStore((s) => s.pushToast);
  const [pending, setPending] = useState<SyncBundle | null>(null);

  useEffect(() => {
    const handle = () => {
      const code = readTransferHash(window.location.hash);
      if (!code) return;
      // Drop the fragment straight away: a reload should not re-prompt, and the
      // code has no business sitting in the address bar afterwards.
      history.replaceState(null, '', window.location.pathname + window.location.search);
      decodeTransfer(code)
        .then(({ bundle, skipped }) => {
          if (skipped > 0) pushToast('info', `Ignored ${skipped} unreadable task(s) in that link.`);
          setPending(bundle);
        })
        .catch((error: unknown) => {
          pushToast(
            'error',
            error instanceof Error ? error.message : 'That transfer link is broken.',
          );
        });
    };

    handle();
    // A link opened while the app is already running only changes the hash.
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, [pushToast]);

  const plan = pending ? mergeBundles(exportBundle(), pending).report : null;

  return (
    <ConfirmDialog
      open={pending !== null}
      title="Tasks from another device"
      message={plan ? describeMergePlan(plan) : ''}
      confirmLabel="Merge"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (!pending) return;
        const report = mergeIntoStore(pending);
        pushToast('success', `Merged — ${summarizeReport(report)}.`);
        setPending(null);
      }}
    />
  );
}
