// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { getConfig } from './config';
import { getToken, clearToken } from './auth';

export async function api(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const config = getConfig();
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Session expired');
  }

  return res.json();
}
