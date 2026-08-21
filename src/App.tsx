import { AppShell } from '@/app/AppShell';
import { BoardView } from '@/board/BoardView';
import { TaskEditorModal } from '@/editor/TaskEditorModal';
import { GraphView } from '@/graph/GraphView';
import { SettingsModal } from '@/settings/SettingsModal';
import { useSettingsStore } from '@/store/settingsStore';

export default function App() {
  const view = useSettingsStore((s) => s.view);
  return (
    <AppShell>
      {view === 'board' ? <BoardView /> : <GraphView />}
      <TaskEditorModal />
      <SettingsModal />
    </AppShell>
  );
}
