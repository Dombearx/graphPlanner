import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import '@xyflow/react/dist/style.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* BASE_URL ma zawsze końcowy "/" (np. "/planner/"), basename go nie chce */}
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
