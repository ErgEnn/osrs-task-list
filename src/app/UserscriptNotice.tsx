import { noticeKey } from '@/capture/userscriptStatus';
import { useUserscriptStatus } from '@/capture/useUserscriptStatus';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';

/**
 * Toolbar warning for a capture userscript that is out of date, or that never
 * announced itself (see `userscriptStatus`). Clicking it opens Settings, where
 * the panel hands out the current script; × silences that one notice for good.
 *
 * Nothing renders while the check is still open, so an up-to-date install — or
 * a slow one — never flashes a warning.
 */
export function UserscriptNotice() {
  const status = useUserscriptStatus();
  const dismissed = useSettingsStore((s) => s.dismissedUserscriptNotice);
  const dismiss = useSettingsStore((s) => s.dismissUserscriptNotice);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const key = noticeKey(status);
  if (!key || key === dismissed) return null;

  const outdated = status.state === 'outdated';
  return (
    <div className="userscript-notice">
      <button
        type="button"
        className="osrs-btn userscript-notice__open"
        title={
          outdated
            ? `Wiki capture userscript ${status.installed} is installed, but this app ships ` +
              `${status.expected}. Click to open the userscript panel.`
            : 'Wiki capture userscript not detected on this page. Click to open the userscript ' +
              'panel and install it.'
        }
        onClick={() => setSettingsOpen(true)}
      >
        ⚠ {outdated ? 'Userscript outdated' : 'No userscript'}
      </button>
      <button
        type="button"
        className="osrs-btn userscript-notice__dismiss"
        title="Hide this warning"
        aria-label="Hide the userscript warning"
        onClick={() => dismiss(key)}
      >
        ×
      </button>
    </div>
  );
}
