import { useRef, useState, useSyncExternalStore } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { iconCache } from '@/icons/iconCache';
import { refreshFromWikiSync } from '@/sync/wikiSyncService';
import { useSettingsStore, type AutoSyncMinutes } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { summarizeReport } from '@/sync/merge';
import { downloadBackup, mergeFromJson, restoreFromJson } from './backup';
import { GistPanel } from './GistPanel';
import { TransferPanel } from './TransferPanel';

function ago(timestamp: number | null): string {
  if (!timestamp) return 'never';
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const pushToast = useUiStore((s) => s.pushToast);
  const username = useSettingsStore((s) => s.username);
  const setUsername = useSettingsStore((s) => s.setUsername);
  const autoSyncMinutes = useSettingsStore((s) => s.autoSyncMinutes);
  const setAutoSyncMinutes = useSettingsStore((s) => s.setAutoSyncMinutes);
  const lastSyncAt = useSettingsStore((s) => s.lastSyncAt);
  const [syncing, setSyncing] = useState(false);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  /** How the picked file should be applied: replace everything, or merge in. */
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useSyncExternalStore(iconCache.subscribe, iconCache.getVersion);
  const cacheStats = iconCache.stats();

  function onImportFile(file: File | undefined) {
    if (!file) return;
    file
      .text()
      .then((text) => setPendingImport(text))
      .catch(() => pushToast('error', 'Could not read that file.'));
  }

  function openFilePicker(mode: 'replace' | 'merge') {
    setImportMode(mode);
    fileInputRef.current?.click();
  }

  function confirmImport() {
    if (!pendingImport) return;
    try {
      if (importMode === 'merge') {
        const { report, skipped } = mergeFromJson(pendingImport);
        pushToast(
          'success',
          `Merged — ${summarizeReport(report)}${skipped ? `, skipped ${skipped} invalid` : ''}.`,
        );
      } else {
        const report = restoreFromJson(pendingImport);
        pushToast(
          'success',
          `Imported ${report.imported} task(s)${report.skipped ? `, skipped ${report.skipped} invalid` : ''}.`,
        );
      }
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setPendingImport(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function refreshNow() {
    setSyncing(true);
    try {
      const report = await refreshFromWikiSync();
      pushToast(
        report.completedTitles.length > 0 ? 'success' : 'info',
        report.completedTitles.length > 0
          ? `WikiSync: completed ${report.completedTitles.length} task(s) — ${report.completedTitles.slice(0, 3).join(', ')}${report.completedTitles.length > 3 ? '…' : ''}`
          : 'WikiSync: everything already up to date.',
      );
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'WikiSync refresh failed.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Modal open={open} onClose={() => setSettingsOpen(false)} title="Settings">
      <div className="editor-form">
        <div className="form-row">
          <span className="form-row__label">WikiSync character</span>
          <span className="icon-preview__note">
            Auto-completes quest and level tasks from the OSRS wiki's WikiSync service. The
            character must log in with the WikiSync plugin (RuneLite/HDOS) at least once.
          </span>
          <div className="form-row form-row--inline">
            <input
              className="osrs-input"
              style={{ flex: 1 }}
              value={username}
              placeholder="Your username"
              onChange={(e) => setUsername(e.target.value)}
            />
            <button
              type="button"
              className="osrs-btn osrs-btn--primary"
              disabled={syncing || !username.trim()}
              onClick={() => void refreshNow()}
            >
              {syncing ? 'Refreshing…' : 'Refresh now'}
            </button>
          </div>
          <span className="icon-preview__note">Last refresh: {ago(lastSyncAt)}</span>
        </div>

        <label className="form-row">
          <span className="form-row__label">Auto-refresh</span>
          <select
            className="osrs-select"
            value={autoSyncMinutes}
            onChange={(e) => setAutoSyncMinutes(Number(e.target.value) as AutoSyncMinutes)}
          >
            <option value={0}>Off</option>
            <option value={5}>Every 5 minutes</option>
            <option value={15}>Every 15 minutes</option>
            <option value={60}>Every hour</option>
          </select>
        </label>

        <hr className="osrs-divider" />

        <TransferPanel />

        <hr className="osrs-divider" />

        <GistPanel />

        <hr className="osrs-divider" />

        <div className="form-row">
          <span className="form-row__label">Icon cache</span>
          <div className="form-row form-row--inline" style={{ alignItems: 'center' }}>
            <span className="icon-preview__note" style={{ flex: 1 }}>
              {cacheStats.count} icon(s), {(cacheStats.totalBytes / 1024).toFixed(0)} KB of
              localStorage
            </span>
            <button
              type="button"
              className="osrs-btn"
              onClick={() => {
                iconCache.clear();
                pushToast('info', 'Icon cache cleared — icons will refetch on demand.');
              }}
            >
              Clear cache
            </button>
          </div>
        </div>

        <hr className="osrs-divider" />

        <div className="form-row">
          <span className="form-row__label">Backup file</span>
          <span className="icon-preview__note">
            Tasks live in this browser's localStorage — export a JSON backup now and then. Import
            replaces everything; merge folds the file's tasks into what is already here (the same
            rules the transfer codes use).
          </span>
          <div className="form-row form-row--inline">
            <button type="button" className="osrs-btn" onClick={downloadBackup}>
              Export tasks…
            </button>
            <button type="button" className="osrs-btn" onClick={() => openFilePicker('merge')}>
              Merge file…
            </button>
            <button type="button" className="osrs-btn" onClick={() => openFilePicker('replace')}>
              Import (replace)…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => onImportFile(e.target.files?.[0])}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingImport !== null}
        title={importMode === 'merge' ? 'Merge backup file' : 'Import backup'}
        message={
          importMode === 'merge'
            ? "The file's tasks will be folded into this device's list; nothing here is dropped unless the file records it as deleted. Continue?"
            : "Importing replaces ALL current tasks with the backup's content. Continue?"
        }
        confirmLabel={importMode === 'merge' ? 'Merge tasks' : 'Replace tasks'}
        danger={importMode === 'replace'}
        onCancel={() => {
          setPendingImport(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
        onConfirm={confirmImport}
      />
    </Modal>
  );
}
