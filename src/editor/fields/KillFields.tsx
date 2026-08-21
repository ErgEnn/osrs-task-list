import { searchWiki } from '@/api/wiki';
import { AutocompleteInput } from '@/components/AutocompleteInput';
import type { IconRef } from '@/domain/types';

interface Props {
  monsterName: string;
  count?: number;
  onChange: (monsterName: string, count?: number, suggestedIcon?: IconRef) => void;
}

async function monsterOptions(query: string) {
  const titles = await searchWiki(query, 8);
  return titles.map((title) => ({
    value: title,
    iconRef: { kind: 'wikiThumb', pageTitle: title } as IconRef,
  }));
}

export function KillFields({ monsterName, count, onChange }: Props) {
  return (
    <div className="form-row form-row--inline">
      <label className="form-row" style={{ flex: 2 }}>
        <span className="form-row__label">Monster (wiki search)</span>
        <AutocompleteInput
          value={monsterName}
          placeholder="e.g. Zulrah"
          onChange={(text) => onChange(text, count)}
          onPick={(option) => onChange(option.value, count, option.iconRef)}
          fetchOptions={monsterOptions}
        />
      </label>
      <label className="form-row">
        <span className="form-row__label">Kill count (optional)</span>
        <input
          type="number"
          className="osrs-input"
          min={1}
          value={count ?? ''}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            onChange(
              monsterName,
              e.target.value === '' || !Number.isFinite(parsed) ? undefined : Math.max(1, parsed),
            );
          }}
        />
      </label>
    </div>
  );
}
