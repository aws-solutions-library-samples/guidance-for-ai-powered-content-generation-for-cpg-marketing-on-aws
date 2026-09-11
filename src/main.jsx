// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadConfig } from './config';
import App from './App';
import './styles.css';

loadConfig().then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
