import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui.css';
import { App } from './App';

const el = document.getElementById('root');
if (!el) throw new Error('Root element missing');
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
// end of main.tsx
