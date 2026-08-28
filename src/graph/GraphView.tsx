import { useTaskStore } from '@/store/taskStore';
import { useUiStore } from '@/store/uiStore';
import { GraphCanvas } from './GraphCanvas';

/** The progression graph over the live store — what the app itself renders. */
export function GraphView() {
  const tasks = useTaskStore((s) => s.tasks);
  const openEditor = useUiStore((s) => s.openEditor);
  return <GraphCanvas tasks={tasks} onOpenTask={openEditor} />;
}
