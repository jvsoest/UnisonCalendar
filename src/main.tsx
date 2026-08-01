import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './settings.css';
import './calendar-colors.css';
if (window.unison?.platform) document.documentElement.dataset.platform = window.unison.platform;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
