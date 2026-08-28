import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { readShareParam } from './share/shareLink';
import './styles/tokens.css';
import './styles/base.css';
import './styles/osrs.css';

// A `?share=<gistId>` link opens somebody else's list read-only. Each page is
// loaded on demand rather than imported up front, so opening a share link
// never even executes the modules holding the viewer's own tasks and settings:
// nothing of theirs is rehydrated, rewritten, or raced over by a second tab.
const sharedGistId = readShareParam(window.location.search);

const page: Promise<ReactNode> = sharedGistId
  ? import('./share/SharedApp').then(({ SharedApp }) => <SharedApp gistId={sharedGistId} />)
  : import('./App').then(({ default: App }) => <App />);

void page.then((element) => {
  createRoot(document.getElementById('root')!).render(<StrictMode>{element}</StrictMode>);
});
