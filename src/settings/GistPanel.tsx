import { useState } from 'react';
import { describeGistError } from '@/api/gist';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useSettingsStore, type AutoSyncMinutes } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { pushToGist, summarizeGistSync, syncWithGist } from '@/sync/gistSync';

function ago(timestamp: number | null): string {
  if (!timestamp) return 'never';
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute(s) ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hour(s) ago` : new Date(timestamp).toLocaleDateString();
}

/**
 * Two-way sync through one private gist. Both devices point at the same gist
 * id; each sync pulls, merges locally, and pushes the result back.
 */
export function GistPanel() {
  const pushToast = useUiStore((s) => s.pushToast);
  const token = useSettingsStore((s) => s.gistToken);
  const setToken = useSettingsStore((s) => s.setGistToken);
  const gistId = useSettingsStore((s) => s.gistId);
  const gistUrl = useSettingsStore((s) => s.gistUrl);
  const setGistLink = useSettingsStore((s) => s.setGistLink);
  const clearGistLink = useSettingsStore((s) => s.clearGistLink);
  const minutes = useSettingsStore((s) => s.gistSyncMinutes);
  const setMinutes = useSettingsStore((s) => s.setGistSyncMinutes);
  const lastSyncAt = useSettingsStore((s) => s.gistLastSyncAt);

  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      pushToast('success', await action());
    } catch (error) {
      pushToast('error', describeGistError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="form-row">
        <span className="form-row__label">Cloud sync (private GitHub gist)</span>
        <span className="icon-preview__note">
          Keeps every device in step through one secret gist. Paste a{' '}
          <a
            href="https://github.com/settings/tokens/new?scopes=gist&description=OSRS%20Task%20List"
            target="_blank"
            rel="noreferrer noopener"
          >
            personal access token
          </a>{' '}
          with only the <strong>gist</strong> scope. The token is stored in this browser's
          localStorage — use a token you can revoke, and skip this on a shared machine.
        </span>
        <div className="form-row form-row--inline">
          <input
            className="osrs-input"
            style={{ flex: 1 }}
            type={showToken ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder="github_pat_… / ghp_…"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
          />
          <button type="button" className="osrs-btn" onClick={() => setShowToken((v) => !v)}>
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>

        <span className="icon-preview__note">
          Gist id — leave empty on the first device (one is created for you), then paste that same
          id here on your other devices.
        </span>
        <input
          className="osrs-input"
          spellCheck={false}
          placeholder="Created on first sync"
          value={gistId}
          // A hand-typed id points somewhere else, so the stored link is stale.
          onChange={(e) => setGistLink({ id: e.target.value.trim(), url: '' })}
        />

        <div className="form-row form-row--inline">
          <button
            type="button"
            className="osrs-btn osrs-btn--primary"
            disabled={busy || !token.trim()}
            onClick={() =>
              void run(async () => {
                const report = await syncWithGist();
                return summarizeGistSync(report);
              })
            }
          >
            {busy ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            type="button"
            className="osrs-btn"
            disabled={busy || !token.trim()}
            onClick={() => setConfirmOverwrite(true)}
          >
            Overwrite gist
          </button>
          {gistId && (
            <button type="button" className="osrs-btn" disabled={busy} onClick={clearGistLink}>
              Disconnect
            </button>
          )}
        </div>
        <span className="icon-preview__note">
          Last sync: {ago(lastSyncAt)}
          {gistUrl && (
            <>
              {' · '}
              <a href={gistUrl} target="_blank" rel="noreferrer noopener">
                open the gist
              </a>
            </>
          )}
        </span>
      </div>

      <label className="form-row">
        <span className="form-row__label">Auto-sync with the gist</span>
        <select
          className="osrs-select"
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value) as AutoSyncMinutes)}
        >
          <option value={0}>Off</option>
          <option value={5}>Every 5 minutes</option>
          <option value={15}>Every 15 minutes</option>
          <option value={60}>Every hour</option>
        </select>
        <span className="icon-preview__note">
          Also syncs once when the app loads while this is on.
        </span>
      </label>

      <ConfirmDialog
        open={confirmOverwrite}
        title="Overwrite the gist"
        message="This replaces the gist's contents with this device's tasks — no merge. Tasks that exist only on your other devices will be gone from the gist (and will come back the next time those devices sync)."
        confirmLabel="Overwrite"
        danger
        onCancel={() => setConfirmOverwrite(false)}
        onConfirm={() => {
          setConfirmOverwrite(false);
          void run(async () => {
            await pushToGist();
            return 'Gist overwritten with this device’s tasks.';
          });
        }}
      />
    </>
  );
}
