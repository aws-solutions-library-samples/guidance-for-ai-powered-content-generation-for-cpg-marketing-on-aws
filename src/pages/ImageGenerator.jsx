// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useState } from 'react';
import { api } from '../api';

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function generate(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setError('');
    setImages([]);
    setLoading(true);

    try {
      const result = await api('generate-image', {
        method: 'POST',
        body: JSON.stringify({ prompt, count: 2 }),
      });

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.job_id) {
        pollJob(result.status_url);
      } else if (result.presigned_urls) {
        setImages(result.presigned_urls.map((u) => u.url));
        setLoading(false);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function pollJob(statusUrl) {
    const poll = async () => {
      try {
        const res = await fetch(statusUrl);
        if (!res.ok) {
          setTimeout(poll, 3000);
          return;
        }
        const data = await res.json();
        if (data.status === 'complete') {
          setImages(data.presigned_urls.map((u) => u.url));
          setLoading(false);
        } else if (data.status === 'error') {
          setError(data.error || 'Generation failed');
          setLoading(false);
        } else {
          setTimeout(poll, 3000);
        }
      } catch {
        setTimeout(poll, 3000);
      }
    };
    setTimeout(poll, 5000);
  }

  return (
    <div className="page">
      <h2>Image Generator</h2>
      <p className="subtitle">Generate images using AI with a text prompt</p>
      <form onSubmit={generate}>
        <textarea
          placeholder="Describe the image you want to generate..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Generating...' : 'Generate Images'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      {loading && <div className="status processing">⏳ Generating images... this may take 30-60 seconds.</div>}
      {images.length > 0 && (
        <div className="image-grid">
          {images.map((url, i) => (
            <img key={i} src={url} alt={`Generated ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
}
