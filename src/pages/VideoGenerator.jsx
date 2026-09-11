// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useState } from 'react';
import { api } from '../api';

export default function VideoGenerator() {
  const [prompt, setPrompt] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function generate(e) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setError('');
    setVideoUrl('');
    setLoading(true);
    setStatus('Starting video generation...');

    try {
      const result = await api('generate-video', {
        method: 'POST',
        body: JSON.stringify({ action: 'generate', prompt }),
      });

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      pollStatus(result.invocation_arn);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function pollStatus(arn) {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const result = await api('generate-video', {
          method: 'POST',
          body: JSON.stringify({ action: 'status', invocation_arn: arn }),
        });

        if (result.status === 'Completed') {
          setVideoUrl(result.presigned_url);
          setLoading(false);
          setStatus('');
          return;
        }
        if (result.status === 'Failed') {
          setError(result.failure_message || 'Video generation failed');
          setLoading(false);
          return;
        }
        if (attempts > 30) {
          setError('Timed out. The job may still be processing.');
          setLoading(false);
          return;
        }
        setStatus(`Generating video... (${attempts * 10}s elapsed)`);
        setTimeout(poll, 10000);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };
    setTimeout(poll, 10000);
  }

  return (
    <div className="page">
      <h2>Video Generator</h2>
      <p className="subtitle">Generate 6-second videos using Amazon Nova Reel</p>
      <form onSubmit={generate}>
        <textarea
          placeholder="Describe the video you want to generate...&#10;&#10;Example: A steaming cup of coffee on a wooden table with warm morning sunlight"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Generating...' : 'Generate Video'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      {loading && <div className="status processing">⏳ {status}</div>}
      {videoUrl && (
        <div className="video-result">
          <video controls autoPlay loop>
            <source src={videoUrl} type="video/mp4" />
          </video>
          <a href={videoUrl} download="video.mp4" className="download-link">Download Video</a>
        </div>
      )}
    </div>
  );
}
