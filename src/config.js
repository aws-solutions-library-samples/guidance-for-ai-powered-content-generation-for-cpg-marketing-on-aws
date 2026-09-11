// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

// Runtime configuration loaded from /config.json (deployed by CDK).
// Falls back to env vars for local development.
let _config = null;

export async function loadConfig() {
  if (_config) return _config;
  try {
    const res = await fetch('/config.json');
    if (res.ok) {
      _config = await res.json();
      return _config;
    }
  } catch { /* fall through to defaults */ }
  _config = {
    apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000/',
    region: import.meta.env.VITE_REGION || 'us-east-1',
    userPoolId: import.meta.env.VITE_USER_POOL_ID || '',
    userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || '',
  };
  return _config;
}

export function getConfig() {
  if (!_config) throw new Error('Config not loaded. Call loadConfig() first.');
  return _config;
}
