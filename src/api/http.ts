export class HttpError extends Error {
  constructor(
    public readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

type FetchImpl = typeof fetch;

let fetchImpl: FetchImpl | null = null;

/** Test seam: swap the fetch implementation (null restores the global). */
export function setFetchImpl(fn: FetchImpl | null): void {
  fetchImpl = fn;
}

function doFetch(url: string, init?: RequestInit): Promise<Response> {
  return (fetchImpl ?? fetch)(url, init);
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await doFetch(url, { mode: 'cors', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new HttpError(res.status, url);
  return (await res.json()) as T;
}

/** Fetch image bytes over CORS and encode as a data URL (localStorage-friendly). */
export async function getBlobAsDataUrl(url: string): Promise<string> {
  const res = await doFetch(url, { mode: 'cors' });
  if (!res.ok) throw new HttpError(res.status, url);
  const blob = await res.blob();
  const type = blob.type || 'image/png';
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${type};base64,${btoa(binary)}`;
}
