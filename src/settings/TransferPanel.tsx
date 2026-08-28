import { useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useSettingsStore } from '@/store/settingsStore';
import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { exportBundle } from '@/sync/apply';
import { subsetWithDeps, type SyncBundle } from '@/sync/bundle';
import { mergeIntoStore } from '@/sync/apply';
import { describeMergePlan, mergeBundles, summarizeReport } from '@/sync/merge';
import { decodeTransfer, encodeTransfer, LINK_LENGTH_WARN, transferLink } from '@/sync/transfer';
import { copyToClipboard } from './clipboard';

function fmt(timestamp: number | null): string {
  return timestamp ? new Date(timestamp).toLocaleString() : 'never';
}

/**
 * Hand-carried sync: turn tasks into a code (or link) on the machine you write
 * them on, paste it on the machine you play on. The paste side merges, so the
 * playing device never loses its own progress.
 */
export function TransferPanel() {
  const pushToast = useUiStore((s) => s.pushToast);
  const tasks = useTaskStore((s) => s.tasks);
  const lastTransferAt = useSettingsStore((s) => s.lastTransferAt);
  const setLastTransferAt = useSettingsStore((s) => s.setLastTransferAt);

  const [onlyNew, setOnlyNew] = useState(false);
  const [code, setCode] = useState('');
  const [incoming, setIncoming] = useState('');
  const [pending, setPending] = useState<SyncBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLTextAreaElement>(null);

  const newSince = useMemo(() => {
    if (!lastTransferAt) return Object.keys(tasks).length;
    return Object.values(tasks).filter((t) => t.updatedAt > lastTransferAt).length;
  }, [tasks, lastTransferAt]);

  function bundleToSend(): SyncBundle {
    const full = exportBundle();
    if (!onlyNew || !lastTransferAt) return full;
    const ids = Object.values(full.tasks)
      .filter((task) => task.updatedAt > lastTransferAt)
      .map((task) => task.id);
    return subsetWithDeps(full, ids);
  }

  async function generate(asLink: boolean) {
    const bundle = bundleToSend();
    if (Object.keys(bundle.tasks).length === 0 && Object.keys(bundle.deleted).length === 0) {
      pushToast('info', 'Nothing to send — no tasks match.');
      return;
    }
    setBusy(true);
    try {
      const generated = await encodeTransfer(bundle);
      const payload = asLink ? transferLink(generated) : generated;
      setCode(payload);
      setLastTransferAt(Date.now());
      const copied = await copyToClipboard(payload);
      if (copied) {
        pushToast('success', `${asLink ? 'Link' : 'Code'} copied — paste it on your other device.`);
      } else {
        pushToast('info', 'Clipboard blocked — select the text below and copy it manually.');
        codeRef.current?.select();
      }
      if (asLink && payload.length > LINK_LENGTH_WARN) {
        pushToast(
          'info',
          'That link is long; some chat apps will cut it. Send the code instead if it fails.',
        );
      }
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Could not build a code.');
    } finally {
      setBusy(false);
    }
  }

  async function review() {
    setBusy(true);
    try {
      const { bundle, skipped } = await decodeTransfer(incoming);
      if (skipped > 0) pushToast('info', `Ignored ${skipped} unreadable task(s) in that code.`);
      setPending(bundle);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Could not read that code.');
    } finally {
      setBusy(false);
    }
  }

  function applyPending() {
    if (!pending) return;
    const report = mergeIntoStore(pending);
    pushToast('success', `Merged — ${summarizeReport(report)}.`);
    setPending(null);
    setIncoming('');
  }

  const plan = pending ? mergeBundles(exportBundle(), pending).report : null;

  return (
    <>
      <div className="form-row">
        <span className="form-row__label">Send tasks to another device</span>
        <span className="icon-preview__note">
          Builds a code (or a link) holding the tasks below. Paste it into this same panel on your
          other device — dependencies of the tasks you send always come along.
        </span>
        <label className="form-row form-row--inline" style={{ alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={onlyNew}
            disabled={!lastTransferAt}
            onChange={(e) => setOnlyNew(e.target.checked)}
          />
          <span className="icon-preview__note" style={{ flex: 1 }}>
            {lastTransferAt
              ? `Only tasks changed since my last send (${newSince} of ${Object.keys(tasks).length}) — last sent ${fmt(lastTransferAt)}`
              : 'Only tasks changed since my last send — available after your first send'}
          </span>
        </label>
        <div className="form-row form-row--inline">
          <button
            type="button"
            className="osrs-btn osrs-btn--primary"
            disabled={busy}
            onClick={() => void generate(false)}
          >
            Copy transfer code
          </button>
          <button
            type="button"
            className="osrs-btn"
            disabled={busy}
            onClick={() => void generate(true)}
          >
            Copy link
          </button>
        </div>
        {code && (
          <>
            <textarea
              ref={codeRef}
              className="osrs-textarea"
              readOnly
              rows={3}
              value={code}
              onFocus={(e) => e.target.select()}
            />
            <span className="icon-preview__note">{code.length} characters</span>
          </>
        )}
      </div>

      <div className="form-row">
        <span className="form-row__label">Receive tasks from another device</span>
        <textarea
          className="osrs-textarea"
          rows={3}
          placeholder="Paste a transfer code (OSTL2…) or a transfer link"
          value={incoming}
          onChange={(e) => setIncoming(e.target.value)}
        />
        <div className="form-row form-row--inline">
          <button
            type="button"
            className="osrs-btn osrs-btn--primary"
            disabled={busy || !incoming.trim()}
            onClick={() => void review()}
          >
            Review &amp; merge…
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title="Merge incoming tasks"
        message={plan ? describeMergePlan(plan) : ''}
        confirmLabel="Merge"
        onCancel={() => setPending(null)}
        onConfirm={applyPending}
      />
    </>
  );
}
