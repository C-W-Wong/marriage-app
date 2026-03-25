import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import Admin from './Admin.tsx';
import './index.css';

const isAdmin = window.location.pathname.startsWith('/admin');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? <Admin /> : <App />}
  </StrictMode>,
);
