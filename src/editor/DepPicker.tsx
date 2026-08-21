import { useMemo, useState } from 'react';
import { wouldCreateCycle } from '@/domain/deps';
import type { TaskMap } from '@/domain/types';

interface DepPickerProps {
  tasks: TaskMap;
  /** null while creating a new task (no cycles possible yet). */
  selfId: string | null;
  deps: string[];
  onChange: (deps: string[]) => void;
}

export function DepPicker({ tasks, selfId, deps, onChange }: DepPickerProps) {
  const [candidate, setCandidate] = useState('');

  const options = useMemo(() => {
    return Object.values(tasks)
      .filter((task) => task.id !== selfId && !deps.includes(task.id))
      .map((task) => ({
        id: task.id,
        title: task.title,
        cycle: selfId !== null && wouldCreateCycle(tasks, selfId, task.id),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, selfId, deps]);

  return (
    <div className="form-row">
      <span className="form-row__label">Depends on</span>
      {deps.length > 0 && (
        <div className="dep-chips">
          {deps.map((depId) => (
            <span key={depId} className="dep-chip osrs-panel--parchment">
              {tasks[depId]?.title ?? '(missing task)'}
              <button
                type="button"
                className="dep-chip__x"
                aria-label="Remove dependency"
                onClick={() => onChange(deps.filter((d) => d !== depId))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="dep-add">
        <select
          className="osrs-select"
          value={candidate}
          onChange={(e) => setCandidate(e.target.value)}
        >
          <option value="">— pick a task —</option>
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={option.cycle}>
              {option.title}
              {option.cycle ? ' (would create a cycle)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="osrs-btn"
          disabled={!candidate}
          onClick={() => {
            if (candidate) {
              onChange([...deps, candidate]);
              setCandidate('');
            }
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
