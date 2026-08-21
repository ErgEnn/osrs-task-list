import type { ReactNode } from 'react';
import { listQuestTitles } from '@/api/wiki';
import { AutocompleteInput } from '@/components/AutocompleteInput';
import type { IconRef } from '@/domain/types';

const questBadge: IconRef = { kind: 'builtin', id: 'badge:quest' };

async function questOptions(query: string) {
  const titles = await listQuestTitles();
  const q = query.toLowerCase();
  const starts = titles.filter((t) => t.toLowerCase().startsWith(q));
  const contains = titles.filter((t) => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, 8).map((title) => ({ value: title, iconRef: questBadge }));
}

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
        <AutocompleteInput
          value={questName}
          placeholder="e.g. Dragon Slayer I"
          onChange={onChange}
          onPick={(option) => onChange(option.value)}
          fetchOptions={questOptions}
        />
      </label>
      {children}
    </div>
  );
}
