// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useEffect, useState } from 'react';
import { api } from '../api';

export default function BrandProfile() {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api('brand-profile');
      setContent(data.content || '');
    } catch (err) {
      setError(err.message);
    }
  }

  async function save() {
    setError('');
    setStatus('');
    setSaving(true);
    try {
      await api('brand-profile', { method: 'POST', body: JSON.stringify({ content }) });
      setStatus('Brand profile saved. It will now be applied to all content generation.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h2>Brand Profile</h2>
      <p className="subtitle">Define your brand voice, tone, and guidelines. Applied automatically to all content generation.</p>
      <textarea
        rows={20}
        placeholder={`Brand name: AnyCompany\n\nVoice & tone:\n- Friendly, approachable, expert\n- Conversational but never casual\n- Use active voice\n\nKey messaging:\n- Premium quality ingredients\n- Science-backed formulations\n- Sustainability first\n\nAvoid:\n- Superlatives without evidence\n- Medical claims\n- Competitor names`}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <button type="button" onClick={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save Brand Profile'}
      </button>
      {status && <div className="status complete">✓ {status}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
