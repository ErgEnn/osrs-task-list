import { AppShell } from '@/app/AppShell';
import { BoardView } from '@/board/BoardView';
import { useCaptureImport } from '@/capture/useCaptureImport';
import { TaskEditorModal } from '@/editor/TaskEditorModal';
import { GraphView } from '@/graph/GraphView';
import { IncomingTransferDialog } from '@/settings/IncomingTransferDialog';
import { SettingsModal } from '@/settings/SettingsModal';
import { useSettingsStore } from '@/store/settingsStore';

export default function App() {
  const view = useSettingsStore((s) => s.view);
  useCaptureImport();
  return (
    <AppShell>
      {view === 'board' ? <BoardView /> : <GraphView />}
      <TaskEditorModal />
      <SettingsModal />
      <IncomingTransferDialog />
    </AppShell>
  );
}
