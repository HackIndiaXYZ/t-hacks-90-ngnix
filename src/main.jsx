import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import TrackPage from './screens/TrackPage.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

registerSW({
  immediate: true,
  onRegisteredSW: (url) => console.info('[sakhi] offline support ready:', url),
  onRegisterError: (err) => console.error('[sakhi] offline support failed:', err),
});

const track = location.pathname.match(/^\/track\/([\w-]+)\/?$/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>{track ? <TrackPage id={track[1]} /> : <App />}</ErrorBoundary>
  </StrictMode>,
);
