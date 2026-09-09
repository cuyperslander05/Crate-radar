import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './lib/AuthContext';
import { ToastProvider } from './lib/ToastContext';
import { NowPlayingProvider } from './lib/NowPlayingContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outermost boundary: catches a crash in a provider or the shell itself,
        which would otherwise render a blank page. */}
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          {/* Inside AuthProvider: the poller only runs for a signed-in user. */}
          <NowPlayingProvider>
            <App />
          </NowPlayingProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>
);
