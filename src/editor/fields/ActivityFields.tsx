import { searchWiki } from '@/api/wiki';
import { AutocompleteInput } from '@/components/AutocompleteInput';
import type { IconRef } from '@/domain/types';

interface Props {
  activityName: string;
  count?: number;
  onChange: (activityName: string, count?: number, suggestedIcon?: IconRef) => void;
}

async function activityOptions(query: string) {
  const titles = await searchWiki(query, 8);
  return titles.map((title) => ({
    value: title,
    iconRef: { kind: 'wikiThumb', pageTitle: title } as IconRef,
  }));
}

export function ActivityFields({ activityName, count, onChange }: Props) {
  return (
    <div className="form-row form-row--inline">
      <label className="form-row" style={{ flex: 2 }}>
        <span className="form-row__label">Activity / minigame (wiki search)</span>
        <AutocompleteInput
          value={activityName}
          placeholder="e.g. Wintertodt, Barbarian Assault"
          onChange={(text) => onChange(text, count)}
          onPick={(option) => onChange(option.value, count, option.iconRef)}
          fetchOptions={activityOptions}
        />
      </label>
      <label className="form-row">
        <span className="form-row__label">Times (optional)</span>
        <input
          type="number"
          className="osrs-input"
          min={1}
          value={count ?? ''}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            onChange(
              activityName,
              e.target.value === '' || !Number.isFinite(parsed) ? undefined : Math.max(1, parsed),
            );
          }}
        />
      </label>
    </div>
  );
}
