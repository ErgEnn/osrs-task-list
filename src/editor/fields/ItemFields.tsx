import { searchItemsAndPages } from '@/api/itemSearch';
import { AutocompleteInput } from '@/components/AutocompleteInput';
import type { IconRef } from '@/domain/types';

interface Props {
  itemName: string;
  quantity?: number;
  onChange: (itemName: string, quantity?: number, suggestedIcon?: IconRef) => void;
}

async function itemOptions(query: string) {
  const suggestions = await searchItemsAndPages(query, 8);
  return suggestions.map((s) => ({
    value: s.name,
    iconRef: s.iconRef,
    hint: s.source === 'wiki' ? 'wiki' : undefined,
  }));
}

export function ItemFields({ itemName, quantity, onChange }: Props) {
  return (
    <div className="form-row form-row--inline">
      <label className="form-row" style={{ flex: 2 }}>
        <span className="form-row__label">Item (wiki search)</span>
        <AutocompleteInput
          value={itemName}
          placeholder="e.g. Dragon scimitar, Ghommal's hilt 3"
          onChange={(text) => onChange(text, quantity)}
          onPick={(option) => onChange(option.value, quantity, option.iconRef)}
          fetchOptions={itemOptions}
        />
      </label>
      <label className="form-row">
        <span className="form-row__label">Quantity (optional)</span>
        <input
          type="number"
          className="osrs-input"
          min={1}
          value={quantity ?? ''}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            onChange(
              itemName,
              e.target.value === '' || !Number.isFinite(parsed) ? undefined : Math.max(1, parsed),
            );
          }}
        />
      </label>
    </div>
  );
}
