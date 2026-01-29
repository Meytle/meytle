import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import router from './routes';
import './styles/base/index.css';
import { suppressBrowserExtensionErrors, suppressUnhandledRejections } from './utils/errorSuppression';

// Suppress browser extension errors in development
suppressBrowserExtensionErrors();
suppressUnhandledRejections();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
