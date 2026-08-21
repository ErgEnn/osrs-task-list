interface Props {
  name: string;
  onChange: (name: string) => void;
}

export function CaFields({ name, onChange }: Props) {
  return (
    <label className="form-row">
      <span className="form-row__label">Combat achievement</span>
      <input
        className="osrs-input"
        value={name}
        placeholder="e.g. Perfect Zulrah"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
