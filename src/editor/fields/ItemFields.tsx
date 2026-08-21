import { AutocompleteInput } from '@/components/AutocompleteInput';
import { getItemMapping, searchItems } from '@/api/prices';
import type { IconRef } from '@/domain/types';

interface Props {
  itemName: string;
  quantity: number;
  onChange: (itemName: string, quantity: number, suggestedIcon?: IconRef) => void;
}

async function itemOptions(query: string) {
  const items = searchItems(await getItemMapping(), query, 8);
  return items.map((item) => ({
    value: item.name,
    iconRef: { kind: 'wikiFile', fileName: item.icon } as IconRef,
  }));
}

export function ItemFields({ itemName, quantity, onChange }: Props) {
  return (
    <div className="form-row form-row--inline">
      <label className="form-row" style={{ flex: 2 }}>
        <span className="form-row__label">Item (wiki search)</span>
        <AutocompleteInput
          value={itemName}
          placeholder="e.g. Dragon scimitar"
          onChange={(text) => onChange(text, quantity)}
          onPick={(option) => onChange(option.value, quantity, option.iconRef)}
          fetchOptions={itemOptions}
        />
      </label>
      <label className="form-row">
        <span className="form-row__label">Quantity</span>
        <input
          type="number"
          className="osrs-input"
          min={1}
          value={quantity}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            onChange(itemName, Math.max(1, Number.isFinite(parsed) ? parsed : 1));
          }}
        />
      </label>
    </div>
  );
}
