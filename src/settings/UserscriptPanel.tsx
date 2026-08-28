import { useRef, useState } from 'react';
import {
  appBaseUrl,
  CANONICAL_APP_URL,
  fetchUserscript,
  isCanonicalDeployment,
  userscriptUrl,
} from '@/capture/userscript';
import { useUserscriptStatus } from '@/capture/useUserscriptStatus';
import { useUiStore } from '@/store/uiStore';
import { copyToClipboard } from './clipboard';

/**
 * Hands out the wiki capture userscript: install it by URL (the manager then
 * keeps it updated) or copy the source, which is rewritten to point back at
 * this deployment. The installable file can only be served as it ships, so on
 * anything but the canonical deployment the copy is the one that works.
 */
export function UserscriptPanel() {
  const pushToast = useUiStore((s) => s.pushToast);
  const status = useUserscriptStatus();
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('');
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  async function copySource() {
    setBusy(true);
    try {
      const text = await fetchUserscript();
      if (await copyToClipboard(text)) {
        pushToast('success', 'Userscript copied — paste it into a new Tampermonkey script.');
        setSource('');
      } else {
        // Clipboard blocked (no permission, or an insecure origin): show the
        // source so it can still be selected by hand.
        setSource(text);
        pushToast('info', 'Clipboard blocked — select the source below and copy it manually.');
        // The textarea renders on this same commit, so select after paint.
        requestAnimationFrame(() => sourceRef.current?.select());
      }
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Could not read the userscript.');
    } finally {
      setBusy(false);
    }
  }

  const canonical = isCanonicalDeployment();

  return (
    <div className="form-row">
      <span className="form-row__label">Wiki capture userscript</span>
      <span className="icon-preview__note">
        Puts an <em>add task</em> button next to every OSRS wiki article title, and a small one
        after every article link, so a wiki page becomes a task without leaving the wiki. Needs a
        userscript manager (Greasemonkey, Tampermonkey, Violentmonkey). <em>Install</em> lets the
        manager keep it up to date; <em>Copy source</em> is for managers that only take a paste.
      </span>
      {status.state !== 'checking' && (
        <span className="icon-preview__note">
          {status.state === 'ok' && `Installed: ${status.installed} — up to date.`}
          {status.state === 'outdated' &&
            `Installed: ${status.installed}, but this app ships ${status.expected}. Your userscript ` +
              `manager picks that up on its next update check; reinstalling below is quicker.`}
          {status.state === 'missing' &&
            `Not detected on this page (this app ships ${status.expected}). If you installed it ` +
              `from another deployment, it only announces itself on the app it was pointed at.`}
        </span>
      )}
      {!canonical && (
        <span className="icon-preview__note">
          Heads up: the installable file targets <code>{CANONICAL_APP_URL}</code>, so on this
          deployment use <em>Copy source</em> — that copy is pointed at <code>{appBaseUrl()}</code>{' '}
          instead.
        </span>
      )}
      <div className="form-row form-row--inline">
        <a
          className={canonical ? 'osrs-btn osrs-btn--primary' : 'osrs-btn'}
          href={userscriptUrl()}
          target="_blank"
          rel="noreferrer"
        >
          Install…
        </a>
        <button
          type="button"
          className={canonical ? 'osrs-btn' : 'osrs-btn osrs-btn--primary'}
          disabled={busy}
          onClick={() => void copySource()}
        >
          {busy ? 'Copying…' : 'Copy source'}
        </button>
      </div>
      {source && (
        <textarea
          ref={sourceRef}
          className="osrs-textarea"
          readOnly
          rows={4}
          value={source}
          onFocus={(e) => e.target.select()}
        />
      )}
    </div>
  );
}
