import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

const App = lazy(() => import('./App.tsx'));
const Admin = lazy(() => import('./Admin.tsx'));
const Gallery = lazy(() => import('./Gallery.tsx'));

const path = window.location.pathname;
const isAdmin = path.startsWith('/admin');
const isGallery = /^\/photos\/[^/]+$/.test(path);

const Fallback = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fdfaf6',
      color: '#8b0000',
      fontFamily: 'serif',
      fontSize: '0.95rem',
      letterSpacing: '0.1em',
    }}
  >
    Loading…
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<Fallback />}>
      {isAdmin ? <Admin /> : isGallery ? <Gallery /> : <App />}
    </Suspense>
  </StrictMode>,
);
