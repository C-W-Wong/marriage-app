import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import Admin from './Admin.tsx';
import Gallery from './Gallery.tsx';
import './index.css';

const path = window.location.pathname;
const isAdmin = path.startsWith('/admin');
const isGallery = /^\/photos\/[^/]+$/.test(path);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? <Admin /> : isGallery ? <Gallery /> : <App />}
  </StrictMode>,
);
