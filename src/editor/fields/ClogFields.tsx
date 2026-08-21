interface Props {
  target: string;
  onChange: (target: string) => void;
}

export function ClogFields({ target, onChange }: Props) {
  return (
    <label className="form-row">
      <span className="form-row__label">Collection log entry</span>
      <input
        className="osrs-input"
        value={target}
        placeholder="e.g. Barrows — full Ahrim's set"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
