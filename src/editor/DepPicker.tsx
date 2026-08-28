import { useMemo, useState } from 'react';
import { AutocompleteInput } from '@/components/AutocompleteInput';
import { wouldCreateCycle, wouldCycleWithDraftDep } from '@/domain/deps';
import { emptyPayload } from '@/domain/payload';
import { matchesSearch } from '@/domain/search';
import type { IconRef, TaskKind, TaskMap, TaskPayload } from '@/domain/types';
import { TASK_KIND_LABELS } from '@/domain/types';
import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { ActivityFields } from './fields/ActivityFields';
import { CaFields } from './fields/CaFields';
import { ClogFields } from './fields/ClogFields';
import { ItemFields } from './fields/ItemFields';
import { KillFields } from './fields/KillFields';
import { LevelFields } from './fields/LevelFields';
import { QuestFields } from './fields/QuestFields';

interface DepPickerProps {
  tasks: TaskMap;
  /** null while creating a new task (no cycles possible yet). */
  selfId: string | null;
  deps: string[];
  onChange: (deps: string[]) => void;
}

export function DepPicker({ tasks, selfId, deps, onChange }: DepPickerProps) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newPayload, setNewPayload] = useState<TaskPayload>(() => emptyPayload('quest'));
  const [newIcon, setNewIcon] = useState<IconRef | undefined>(undefined);
  const createTask = useTaskStore((s) => s.createTask);
  const pushToast = useUiStore((s) => s.pushToast);

  const linkable = useMemo(
    () =>
      Object.values(tasks).filter(
        (task) =>
          task.id !== selfId &&
          !deps.includes(task.id) &&
          !(selfId !== null && wouldCreateCycle(tasks, selfId, task.id)),
      ),
    [tasks, selfId, deps],
  );

  async function existingOptions(q: string) {
    return linkable
      .filter((task) => matchesSearch(task, q))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 8)
      .map((task) => ({ value: task.id, label: task.title, iconRef: task.iconRef }));
  }

  function applyNewPayload(payload: TaskPayload, suggestedIcon?: IconRef) {
    setNewPayload(payload);
    setNewIcon(suggestedIcon);
  }

  function switchNewKind(kind: TaskKind) {
    if (kind !== newPayload.kind) applyNewPayload(emptyPayload(kind));
  }

  function createAndLink() {
    if (wouldCycleWithDraftDep(tasks, selfId, newPayload)) {
      pushToast('error', 'That task would create a dependency cycle through the level chain.');
      return;
    }
    const id = createTask({ payload: newPayload, iconRef: newIcon });
    onChange([...deps, id]);
    applyNewPayload(emptyPayload(newPayload.kind));
    setCreating(false);
  }

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
        <div style={{ flex: 1 }}>
          <AutocompleteInput
            value={query}
            placeholder="Link existing task…"
            minChars={1}
            onChange={setQuery}
            onPick={(option) => {
              onChange([...deps, option.value]);
              setQuery('');
            }}
            fetchOptions={existingOptions}
          />
        </div>
        <button
          type="button"
          className="osrs-btn"
          onClick={() => setCreating((v) => !v)}
          title="Create the prerequisite task right here and link it"
        >
          {creating ? 'Close' : '+ New'}
        </button>
      </div>

      {creating && (
        <div className="dep-new">
          <label className="form-row">
            <span className="form-row__label">New dependency — type</span>
            <select
              className="osrs-select"
              value={newPayload.kind}
              onChange={(e) => switchNewKind(e.target.value as TaskKind)}
            >
              {(Object.keys(TASK_KIND_LABELS) as TaskKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {TASK_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>

          {newPayload.kind === 'level' && (
            <LevelFields
              skill={newPayload.skill}
              level={newPayload.level}
              onChange={(skill, level) => applyNewPayload({ kind: 'level', skill, level })}
            />
          )}
          {newPayload.kind === 'quest' && (
            <QuestFields
              questName={newPayload.questName}
              onChange={(questName) => applyNewPayload({ kind: 'quest', questName })}
            />
          )}
          {newPayload.kind === 'item' && (
            <ItemFields
              itemName={newPayload.itemName}
              quantity={newPayload.quantity}
              onChange={(itemName, quantity, icon) =>
                applyNewPayload({ kind: 'item', itemName, quantity }, icon)
              }
            />
          )}
          {newPayload.kind === 'activity' && (
            <ActivityFields
              activityName={newPayload.activityName}
              count={newPayload.count}
              onChange={(activityName, count, icon) =>
                applyNewPayload({ kind: 'activity', activityName, count }, icon)
              }
            />
          )}
          {newPayload.kind === 'kill' && (
            <KillFields
              monsterName={newPayload.monsterName}
              count={newPayload.count}
              onChange={(monsterName, count, icon) =>
                applyNewPayload({ kind: 'kill', monsterName, count }, icon)
              }
            />
          )}
          {newPayload.kind === 'clog' && (
            <ClogFields
              target={newPayload.target}
              onChange={(target) => applyNewPayload({ kind: 'clog', target })}
            />
          )}
          {newPayload.kind === 'ca' && (
            <CaFields
              name={newPayload.name}
              onChange={(name) => applyNewPayload({ kind: 'ca', name })}
            />
          )}

          <div className="dep-new__actions">
            <span className="icon-preview__note">
              Created as “To do” with auto title & icon, and linked as a dependency.
            </span>
            <button type="button" className="osrs-btn osrs-btn--primary" onClick={createAndLink}>
              Create & link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
