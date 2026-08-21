import type { ReactNode } from 'react';

interface Props {
  questName: string;
  onChange: (questName: string) => void;
  /** Extra controls (requirement import arrives in M7). */
  children?: ReactNode;
}

export function QuestFields({ questName, onChange, children }: Props) {
  return (
    <div className="form-row">
      <label className="form-row">
        <span className="form-row__label">Quest name</span>
        <input
          className="osrs-input"
          value={questName}
          placeholder="e.g. Dragon Slayer I"
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {children}
    </div>
  );
}
