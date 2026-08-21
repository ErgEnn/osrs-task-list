import { useState } from 'react';
import clsx from 'clsx';
import { getItemMapping, searchItems } from '@/api/prices';
import { searchWiki } from '@/api/wiki';
import { Icon } from '@/components/Icon';
import type { IconRef } from '@/domain/types';
import { BUILTIN_ICONS } from '@/icons/builtin';

interface WikiCandidate {
  iconRef: IconRef;
  label: string;
  hint: string;
}

interface IconPickerProps {
  current: IconRef;
  onPick: (ref: IconRef) => void;
  onReset: () => void;
}

/** Inline expandable icon picker: built-in icons or any wiki item/page image. */
export function IconPicker({ current, onPick, onReset }: IconPickerProps) {
  const [tab, setTab] = useState<'builtin' | 'wiki'>('builtin');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<WikiCandidate[]>([]);
  const [searching, setSearching] = useState(false);

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      const [items, pages] = await Promise.all([
        getItemMapping().then((all) => searchItems(all, q, 6)),
        searchWiki(q, 6).catch(() => [] as string[]),
      ]);
      const seen = new Set<string>();
      const results: WikiCandidate[] = [];
      for (const item of items) {
        seen.add(item.name.toLowerCase());
        results.push({
          iconRef: { kind: 'wikiFile', fileName: item.icon },
          label: item.name,
          hint: 'item',
        });
      }
      for (const title of pages) {
        if (seen.has(title.toLowerCase())) continue;
        results.push({
          iconRef: { kind: 'wikiThumb', pageTitle: title },
          label: title,
          hint: 'page',
        });
      }
      setCandidates(results);
    } finally {
      setSearching(false);
    }
  }

  const currentKey = JSON.stringify(current);

  return (
    <div className="icon-picker">
      <div className="icon-picker__tabs">
        <button
          type="button"
          className={clsx('osrs-btn', tab === 'builtin' && 'osrs-btn--pressed')}
          onClick={() => setTab('builtin')}
        >
          Built-in
        </button>
        <button
          type="button"
          className={clsx('osrs-btn', tab === 'wiki' && 'osrs-btn--pressed')}
          onClick={() => setTab('wiki')}
        >
          Wiki search
        </button>
        <button type="button" className="osrs-btn" style={{ marginLeft: 'auto' }} onClick={onReset}>
          Reset to auto
        </button>
      </div>

      {tab === 'builtin' && (
        <div className="icon-picker__grid">
          {BUILTIN_ICONS.map((entry) => {
            const ref: IconRef = { kind: 'builtin', id: entry.id };
            return (
              <button
                key={entry.id}
                type="button"
                title={entry.label}
                className={clsx(
                  'icon-picker__cell',
                  JSON.stringify(ref) === currentKey && 'icon-picker__cell--active',
                )}
                onClick={() => onPick(ref)}
              >
                <Icon iconRef={ref} size={26} />
              </button>
            );
          })}
        </div>
      )}

      {tab === 'wiki' && (
        <>
          <div className="icon-picker__row">
            <input
              className="osrs-input"
              style={{ flex: 1 }}
              value={query}
              placeholder="Search any item or monster…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void runSearch();
                }
              }}
            />
            <button
              type="button"
              className="osrs-btn"
              disabled={searching || query.trim().length < 2}
              onClick={() => void runSearch()}
            >
              {searching ? '…' : 'Search'}
            </button>
          </div>
          {candidates.length > 0 && (
            <div className="icon-picker__grid">
              {candidates.map((candidate) => (
                <button
                  key={JSON.stringify(candidate.iconRef)}
                  type="button"
                  title={`${candidate.label} (${candidate.hint})`}
                  className={clsx(
                    'icon-picker__cell',
                    JSON.stringify(candidate.iconRef) === currentKey && 'icon-picker__cell--active',
                  )}
                  onClick={() => onPick(candidate.iconRef)}
                >
                  <Icon iconRef={candidate.iconRef} size={26} />
                </button>
              ))}
            </div>
          )}
          {candidates.length === 0 && !searching && (
            <div className="icon-preview__note">
              Icons are fetched once from the OSRS wiki, then cached locally.
            </div>
          )}
        </>
      )}
    </div>
  );
}
