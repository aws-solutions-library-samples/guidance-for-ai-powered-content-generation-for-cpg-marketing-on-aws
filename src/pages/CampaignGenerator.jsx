// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useState } from 'react';
import { api } from '../api';

export default function CampaignGenerator() {
  const [brief, setBrief] = useState('');
  const [campaign, setCampaign] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState('');

  async function generate(e) {
    e.preventDefault();
    if (!brief.trim()) return;
    setError('');
    setCampaign(null);
    setImages([]);
    setLoading(true);

    try {
      const data = await api('generate-campaign', {
        method: 'POST',
        body: JSON.stringify({ brief }),
      });

      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setCampaign(data);
      setLoading(false);

      // Auto-generate images from the campaign's creative direction
      const direction = data.creative_direction;
      const imagePrompt = typeof direction === 'string' ? direction : direction?.visual || data.messaging?.[0] || brief;
      generateImages(imagePrompt);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function generateImages(prompt) {
    setImageLoading(true);
    try {
      const result = await api('generate-image', {
        method: 'POST',
        body: JSON.stringify({ prompt, count: 2 }),
      });

      if (result.job_id) {
        pollJob(result.status_url);
      } else if (result.presigned_urls) {
        setImages(result.presigned_urls.map((u) => u.url));
        setImageLoading(false);
      }
    } catch (err) {
      setError(err.message);
      setImageLoading(false);
    }
  }

  async function pollJob(statusUrl) {
    const poll = async () => {
      try {
        const res = await fetch(statusUrl);
        if (!res.ok) { setTimeout(poll, 3000); return; }
        const data = await res.json();
        if (data.status === 'complete') {
          setImages(data.presigned_urls.map((u) => u.url));
          setImageLoading(false);
        } else if (data.status === 'error') {
          setError('Image generation failed');
          setImageLoading(false);
        } else {
          setTimeout(poll, 3000);
        }
      } catch { setTimeout(poll, 3000); }
    };
    setTimeout(poll, 5000);
  }

  return (
    <div className="page">
      <h2>Campaign Generator</h2>
      <p className="subtitle">Generate a campaign spec with AI-created visuals</p>
      <form onSubmit={generate}>
        <textarea
          placeholder="Describe your campaign brief...&#10;&#10;Example: Summer fitness campaign for young adults promoting protein powder, 20% off with code SUMMER20"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={4}
        />
        <button type="submit" disabled={loading || imageLoading}>
          {loading ? 'Generating campaign...' : imageLoading ? 'Generating images...' : 'Generate Campaign'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      {loading && <div className="status processing">⏳ Generating campaign spec...</div>}
      {campaign && (
        <div className="result-card">
          <h3>{campaign.name || 'Campaign'}</h3>
          {campaign.objective && <p><strong>Objective:</strong> {campaign.objective}</p>}
          {campaign.audience && <p><strong>Audience:</strong> {typeof campaign.audience === 'string' ? campaign.audience : campaign.audience.description}</p>}
          {campaign.channels && <p><strong>Channels:</strong> {campaign.channels.join(', ')}</p>}
          {campaign.messaging && (
            <div><strong>Messaging:</strong><ul>{campaign.messaging.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
          )}
          {campaign.creative_direction && <p><strong>Creative Direction:</strong> {typeof campaign.creative_direction === 'string' ? campaign.creative_direction : `${campaign.creative_direction.visual || ''} ${campaign.creative_direction.tonal || ''}`}</p>}
          {campaign.timeline && <p><strong>Timeline:</strong> {typeof campaign.timeline === 'string' ? campaign.timeline : `${campaign.timeline.start_date} - ${campaign.timeline.end_date}`}</p>}
        </div>
      )}
      {imageLoading && <div className="status processing">⏳ Generating campaign visuals...</div>}
      {images.length > 0 && (
        <div className="image-grid">
          {images.map((url, i) => (
            <img key={i} src={url} alt={`Campaign visual ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  );
}
