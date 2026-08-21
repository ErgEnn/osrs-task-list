import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { emptyPayload } from '@/domain/payload';
import { defaultIconFor, defaultTitleFor } from '@/domain/title';
import type { IconRef, Status, Task, TaskKind, TaskPayload } from '@/domain/types';
import { STATUSES, STATUS_LABELS, TASK_KIND_LABELS } from '@/domain/types';
import { importQuestRequirements } from '@/quests/importRequirements';
import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { DepPicker } from './DepPicker';
import { IconPicker } from './IconPicker';
import { CaFields } from './fields/CaFields';
import { ClogFields } from './fields/ClogFields';
import { ItemFields } from './fields/ItemFields';
import { KillFields } from './fields/KillFields';
import { LevelFields } from './fields/LevelFields';
import { QuestFields } from './fields/QuestFields';
import './editor.css';

export function TaskEditorModal() {
  const editorTaskId = useUiStore((s) => s.editorTaskId);
  const closeEditor = useUiStore((s) => s.closeEditor);
  const tasks = useTaskStore((s) => s.tasks);

  const open = editorTaskId !== null;
  const task = editorTaskId && editorTaskId !== 'new' ? tasks[editorTaskId] : undefined;
  const title = editorTaskId === 'new' ? 'New task' : 'Edit task';

  return (
    <Modal open={open} onClose={closeEditor} title={title}>
      {open && <EditorForm key={String(editorTaskId)} task={task} />}
    </Modal>
  );
}

const sameIcon = (a: IconRef, b: IconRef) => JSON.stringify(a) === JSON.stringify(b);

function EditorForm({ task }: { task: Task | undefined }) {
  const presetStatus = useUiStore((s) => s.editorPresetStatus);
  const closeEditor = useUiStore((s) => s.closeEditor);
  const tasks = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);

  const [payload, setPayload] = useState<TaskPayload>(
    () => task?.payload ?? emptyPayload('item'),
  );
  const [taskTitle, setTaskTitle] = useState(() => task?.title ?? defaultTitleFor(payload));
  const [titleTouched, setTitleTouched] = useState(
    () => !!task && task.title !== defaultTitleFor(task.payload),
  );
  const [iconRef, setIconRef] = useState<IconRef>(() => task?.iconRef ?? defaultIconFor(payload));
  const [iconTouched, setIconTouched] = useState(
    () => !!task && !sameIcon(task.iconRef, defaultIconFor(task.payload)),
  );
  const [description, setDescription] = useState(task?.description ?? '');
  const [status, setStatus] = useState<Status>(task?.status ?? presetStatus);
  const [deps, setDeps] = useState<string[]>(task?.explicitDeps ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [importing, setImporting] = useState(false);

  async function runImport() {
    if (!task) return;
    setImporting(true);
    const pushToast = useUiStore.getState().pushToast;
    try {
      // Persist the (possibly renamed) quest before importing against it.
      updateTask(task.id, { payload });
      const report = await importQuestRequirements(task.id);
      const extras = report.unparsed.length
        ? ` Couldn't map ${report.unparsed.length} line(s): ${report.unparsed.join(' | ')}`
        : '';
      pushToast(
        report.linked > 0 || report.created > 0 ? 'success' : 'info',
        `Requirements imported: ${report.created} task(s) created, ${report.linked} linked.${extras}`,
      );
      // The import wrote deps straight to the store — sync the form copy.
      setDeps(useTaskStore.getState().tasks[task.id]?.explicitDeps ?? []);
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  function applyPayload(next: TaskPayload, suggestedIcon?: IconRef) {
    setPayload(next);
    if (!titleTouched) setTaskTitle(defaultTitleFor(next));
    if (!iconTouched) setIconRef(suggestedIcon ?? defaultIconFor(next));
  }

  function switchKind(kind: TaskKind) {
    if (kind !== payload.kind) applyPayload(emptyPayload(kind));
  }

  // Preview of the derived level chain: which task would this one auto-depend on?
  const autoDepTitle = useMemo(() => {
    if (payload.kind !== 'level') return null;
    let best: Task | null = null;
    for (const other of Object.values(tasks)) {
      if (other.id === task?.id || other.payload.kind !== 'level') continue;
      if (other.payload.skill !== payload.skill || other.payload.level >= payload.level) continue;
      if (
        !best ||
        other.payload.level > (best.payload as { level: number }).level ||
        (other.payload.level === (best.payload as { level: number }).level &&
          other.createdAt > best.createdAt)
      ) {
        best = other;
      }
    }
    return best?.title ?? null;
  }, [payload, tasks, task?.id]);

  function save() {
    const cleanTitle = taskTitle.trim();
    if (!task) {
      createTask({
        title: titleTouched && cleanTitle ? cleanTitle : undefined,
        description,
        status,
        payload,
        iconRef: iconTouched ? iconRef : undefined,
        explicitDeps: deps,
      });
    } else {
      updateTask(task.id, {
        title: cleanTitle || defaultTitleFor(payload),
        description,
        status,
        payload,
        iconRef,
        explicitDeps: deps,
      });
    }
    closeEditor();
  }

  return (
    <form
      className="editor-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="form-row">
        <span className="form-row__label">Task type</span>
        <select
          className="osrs-select"
          value={payload.kind}
          onChange={(e) => switchKind(e.target.value as TaskKind)}
        >
          {(Object.keys(TASK_KIND_LABELS) as TaskKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {TASK_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>

      {payload.kind === 'level' && (
        <LevelFields
          skill={payload.skill}
          level={payload.level}
          onChange={(skill, level) => applyPayload({ kind: 'level', skill, level })}
        />
      )}
      {payload.kind === 'quest' && (
        <QuestFields
          questName={payload.questName}
          onChange={(questName) => applyPayload({ kind: 'quest', questName })}
        >
          {task && (
            <div className="form-row">
              <button
                type="button"
                className="osrs-btn"
                disabled={importing || !payload.questName.trim()}
                onClick={() => void runImport()}
                title="Fetch this quest's skill and quest requirements from the wiki and add them as dependency tasks"
              >
                {importing ? 'Importing…' : '⚔ Import requirements from wiki'}
              </button>
              <span className="icon-preview__note">
                Creates missing skill/quest tasks and links them as dependencies.
              </span>
            </div>
          )}
        </QuestFields>
      )}
      {payload.kind === 'item' && (
        <ItemFields
          itemName={payload.itemName}
          quantity={payload.quantity}
          onChange={(itemName, quantity, suggestedIcon) =>
            applyPayload({ kind: 'item', itemName, quantity }, suggestedIcon)
          }
        />
      )}
      {payload.kind === 'kill' && (
        <KillFields
          monsterName={payload.monsterName}
          count={payload.count}
          onChange={(monsterName, count, suggestedIcon) =>
            applyPayload({ kind: 'kill', monsterName, count }, suggestedIcon)
          }
        />
      )}
      {payload.kind === 'clog' && (
        <ClogFields
          target={payload.target}
          onChange={(target) => applyPayload({ kind: 'clog', target })}
        />
      )}
      {payload.kind === 'ca' && (
        <CaFields name={payload.name} onChange={(name) => applyPayload({ kind: 'ca', name })} />
      )}

      <label className="form-row">
        <span className="form-row__label">Title</span>
        <input
          className="osrs-input"
          value={taskTitle}
          onChange={(e) => {
            setTaskTitle(e.target.value);
            setTitleTouched(true);
          }}
        />
      </label>

      <label className="form-row">
        <span className="form-row__label">Description</span>
        <textarea
          className="osrs-textarea"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className="form-row">
        <span className="form-row__label">Status</span>
        <div className="status-radios">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={clsx('osrs-btn', `status--${s}`, status === s && 'osrs-btn--pressed')}
              onClick={() => setStatus(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row">
        <span className="form-row__label">Icon</span>
        <div className="icon-preview">
          <span className="icon-preview__well">
            <Icon iconRef={iconRef} size={32} fallbackKind={payload.kind} />
          </span>
          <span className="icon-preview__note">
            {iconTouched ? 'Custom icon' : 'Icon follows the task subject'}
          </span>
          <button
            type="button"
            className="osrs-btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => setShowIconPicker((v) => !v)}
          >
            {showIconPicker ? 'Hide picker' : 'Change icon'}
          </button>
        </div>
        {showIconPicker && (
          <IconPicker
            current={iconRef}
            onPick={(ref) => {
              setIconRef(ref);
              setIconTouched(true);
            }}
            onReset={() => {
              setIconTouched(false);
              setIconRef(defaultIconFor(payload));
              setShowIconPicker(false);
            }}
          />
        )}
      </div>

      <DepPicker tasks={tasks} selfId={task?.id ?? null} deps={deps} onChange={setDeps} />
      {autoDepTitle && (
        <div className="dep-auto-note">
          Auto-depends on “{autoDepTitle}” (level chain — derived automatically)
        </div>
      )}

      <div className="editor-actions">
        {task && (
          <button
            type="button"
            className="osrs-btn osrs-btn--danger editor-actions__delete"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        )}
        <button type="button" className="osrs-btn" onClick={closeEditor}>
          Cancel
        </button>
        <button type="submit" className="osrs-btn osrs-btn--primary">
          Save
        </button>
      </div>

      {task && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete task"
          message={`Delete "${task.title}"? Other tasks depending on it will drop the dependency.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            deleteTask(task.id);
            setConfirmDelete(false);
            closeEditor();
          }}
        />
      )}
    </form>
  );
}
