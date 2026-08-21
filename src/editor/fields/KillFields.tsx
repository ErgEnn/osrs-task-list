interface Props {
  monsterName: string;
  count?: number;
  onChange: (monsterName: string, count?: number) => void;
}

export function KillFields({ monsterName, count, onChange }: Props) {
  return (
    <div className="form-row form-row--inline">
      <label className="form-row" style={{ flex: 2 }}>
        <span className="form-row__label">Monster</span>
        <input
          className="osrs-input"
          value={monsterName}
          placeholder="e.g. Zulrah"
          onChange={(e) => onChange(e.target.value, count)}
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
            onChange(monsterName, e.target.value === '' || !Number.isFinite(parsed) ? undefined : Math.max(1, parsed));
          }}
        />
      </label>
    </div>
  );
}
