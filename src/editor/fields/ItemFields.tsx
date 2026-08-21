interface Props {
  itemName: string;
  quantity: number;
  onChange: (itemName: string, quantity: number) => void;
}

export function ItemFields({ itemName, quantity, onChange }: Props) {
  return (
    <div className="form-row form-row--inline">
      <label className="form-row" style={{ flex: 2 }}>
        <span className="form-row__label">Item</span>
        <input
          className="osrs-input"
          value={itemName}
          placeholder="e.g. Dragon scimitar"
          onChange={(e) => onChange(e.target.value, quantity)}
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
