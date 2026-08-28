import { useRef, useState, type ReactNode } from 'react';
import { bridgeVersion } from '@/api/wikiSyncBridge';
import {
  appBaseUrl,
  BRIDGE_USERSCRIPT_FILENAME,
  CANONICAL_APP_URL,
  fetchUserscript,
  isCanonicalDeployment,
  USERSCRIPT_FILENAME,
  userscriptUrl,
} from '@/capture/userscript';
import { useUiStore } from '@/store/uiStore';
import { copyToClipboard } from './clipboard';

/**
 * Hands out one of the app's userscripts: install it by URL (the manager then
 * keeps it updated) or copy the source, which is rewritten to point back at
 * this deployment. The installable file can only be served as it ships, so on
 * anything but the canonical deployment the copy is the one that works.
 */
function ScriptOffer({
  label,
  filename,
  blurb,
  status,
}: {
  label: string;
  filename: string;
  blurb: ReactNode;
  status?: ReactNode;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('');
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  async function copySource() {
    setBusy(true);
    try {
      const text = await fetchUserscript(undefined, filename);
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
    <div className="form-row userscript-offer">
      <span className="form-row__label">{label}</span>
      <span className="icon-preview__note">{blurb}</span>
      {status}
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
          href={userscriptUrl(undefined, filename)}
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

export function UserscriptPanel() {
  return (
    <ScriptOffer
      label="Wiki capture userscript"
      filename={USERSCRIPT_FILENAME}
      blurb={
        <>
          Puts an <em>add task</em> button next to every OSRS wiki article title, and a small one
          after every article link, so a wiki page becomes a task without leaving the wiki. Needs a
          userscript manager (Greasemonkey, Tampermonkey, Violentmonkey). <em>Install</em> lets the
          manager keep it up to date; <em>Copy source</em> is for managers that only take a paste.
        </>
      }
    />
  );
}

/**
 * The bridge is what makes every WikiSync feature work in a browser: the
 * service sends no CORS headers, so without it the app cannot read a profile
 * at all.
 */
export function WikiSyncBridgePanel() {
  const version = bridgeVersion();
  return (
    <ScriptOffer
      label="WikiSync bridge userscript"
      filename={BRIDGE_USERSCRIPT_FILENAME}
      blurb={
        <>
          WikiSync allows no other website to read it, so this page cannot fetch your profile on its
          own. This script runs alongside the app and makes that one request for it. It asks for
          nothing but your profile — the page cannot hand it a URL — and sends nothing anywhere.
          Needs a userscript manager. Reload the app after installing.
        </>
      }
      status={
        <span className="icon-preview__note">
          {version ? (
            <span style={{ color: 'var(--c-status-done)' }}>Installed — version {version}.</span>
          ) : (
            <span style={{ color: 'var(--c-status-todo)' }}>
              Not detected on this page. Without it, refreshes and the stats sidebar fall back to a
              direct request, which the browser will block.
            </span>
          )}
        </span>
      }
    />
  );
}
