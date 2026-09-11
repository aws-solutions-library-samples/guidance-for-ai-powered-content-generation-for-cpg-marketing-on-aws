// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useEffect, useState } from 'react';
import { api } from '../api';

export default function AssetLibrary() {
  const [assets, setAssets] = useState([]);
  const [file, setFile] = useState(null);
  const [tags, setTags] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api('assets');
      setAssets(data.assets || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function upload(e) {
    e.preventDefault();
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      // Step 1: create the metadata record and get a presigned POST policy.
      const meta = await api('assets', {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          content_type: file.type,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (meta.error) throw new Error(meta.error);

      // Step 2: upload straight to Amazon S3. The presigned POST policy signs the
      // content type and a maximum size, so S3 rejects anything outside them.
      const formData = new FormData();
      Object.entries(meta.upload.fields).forEach(([k, v]) => formData.append(k, v));
      formData.append('file', file);

      const res = await fetch(meta.upload.url, { method: 'POST', body: formData });
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? 'Upload rejected. Check the file type and that it is under 100 MB.'
            : `Upload failed: ${res.status}`,
        );
      }
      setFile(null);
      setTags('');
      document.getElementById('file-input').value = '';
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this asset?')) return;
    try {
      await api(`assets/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h2>Asset Library</h2>
      <p className="subtitle">Upload images, videos, and brand assets. Use them as references in content generation.</p>

      <form onSubmit={upload} className="product-form">
        <input id="file-input" type="file" onChange={(e) => setFile(e.target.files[0])} />
        <input placeholder="Tags (comma-separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
        <button type="submit" disabled={uploading || !file}>{uploading ? 'Uploading...' : 'Upload Asset'}</button>
      </form>
      {error && <div className="error">{error}</div>}

      <div className="product-list">
        <h3>{assets.length} asset{assets.length !== 1 ? 's' : ''}</h3>
        {assets.length === 0 && <p className="empty">No assets yet.</p>}
        <div className="image-grid">
          {assets.map((a) => (
            <div key={a.id} className="product-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              {a.content_type?.startsWith('image/') && <img src={a.url} alt={a.name} style={{ borderRadius: 6, marginBottom: 8 }} />}
              {a.content_type?.startsWith('video/') && <video src={a.url} controls style={{ width: '100%', borderRadius: 6, marginBottom: 8 }} />}
              <strong>{a.name}</strong>
              {a.tags?.length > 0 && <div className="category">{a.tags.join(', ')}</div>}
              <button type="button" className="btn-delete" style={{ marginTop: 8 }} onClick={() => remove(a.id)}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
