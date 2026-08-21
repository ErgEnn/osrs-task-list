import { AppShell } from '@/app/AppShell';
import { BoardView } from '@/board/BoardView';
import { GraphView } from '@/graph/GraphView';
import { useSettingsStore } from '@/store/settingsStore';

export default function App() {
  const view = useSettingsStore((s) => s.view);
  return <AppShell>{view === 'board' ? <BoardView /> : <GraphView />}</AppShell>;
}
