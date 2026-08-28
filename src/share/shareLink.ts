/**
 * Read-only sharing: a link that carries nothing but the id of the sync gist.
 *
 *   https://…/osrs-task-list/?share=<gistId>
 *
 * Opening it fetches that gist anonymously (a secret gist is readable by
 * anyone holding its id) and renders the bundle as a read-only board — the
 * viewer's own tasks are never touched, and no token ever rides along.
 */
export const SHARE_PARAM = 'share';

/** Gist ids are hex today; stay a little wider, but never accept path tricks. */
const GIST_ID = /^[A-Za-z0-9]{1,64}$/;

export function isGistId(value: string): boolean {
  return GIST_ID.test(value);
}

/** Build the share link for a gist id, hanging it off this deployment's URL. */
export function shareLink(gistId: string, base = window.location.href): string {
  const url = new URL(base);
  // A capture/transfer fragment on the current URL is not part of the share.
  url.hash = '';
  url.searchParams.set(SHARE_PARAM, gistId);
  return url.toString();
}

/** The gist id a share link points at, or null when this is a normal load. */
export function readShareParam(search: string): string | null {
  const id = new URLSearchParams(search).get(SHARE_PARAM)?.trim();
  return id && isGistId(id) ? id : null;
}

/** The same page without the share parameter — the viewer's own task list. */
export function ownListLink(base = window.location.href): string {
  const url = new URL(base);
  url.searchParams.delete(SHARE_PARAM);
  return url.toString();
}
