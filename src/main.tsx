import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { SharedApp } from './share/SharedApp';
import { readShareParam } from './share/shareLink';
import './styles/tokens.css';
import './styles/base.css';
import './styles/osrs.css';

// A `?share=<gistId>` link opens somebody else's list read-only. Deciding it
// here — rather than inside App — keeps the editor, the settings modal and
// every sync loop off that page entirely, so a shared list can never be
// written into the viewer's own tasks.
const sharedGistId = readShareParam(window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>{sharedGistId ? <SharedApp gistId={sharedGistId} /> : <App />}</StrictMode>,
);
