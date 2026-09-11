// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useState } from 'react';
import { api } from '../api';

/**
 * Reusable text generation component. Used by all 6 text content pages.
 * Renders form inputs, calls /generate-text, and displays the structured response.
 */
export default function TextGenerator({ title, subtitle, contentType, placeholder, extraFields = [] }) {
  const [input, setInput] = useState('');
  const [extras, setExtras] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function generate(e) {
    e.preventDefault();
    if (!input.trim()) return;
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const data = await api('generate-text', {
        method: 'POST',
        body: JSON.stringify({ content_type: contentType, input, ...extras }),
      });
      if (data.error) setError(data.error);
      else setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h2>{title}</h2>
      <p className="subtitle">{subtitle}</p>
      <form onSubmit={generate}>
        <textarea
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
        />
        {extraFields.map((f) => (
          <div key={f.name} className="field">
            <label>{f.label}</label>
            {f.type === 'select' ? (
              <select value={extras[f.name] || ''} onChange={(e) => setExtras({ ...extras, [f.name]: e.target.value })}>
                <option value="">Select...</option>
                {f.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input
                type="text"
                placeholder={f.placeholder}
                value={extras[f.name] || ''}
                onChange={(e) => setExtras({ ...extras, [f.name]: e.target.value })}
              />
            )}
          </div>
        ))}
        <button type="submit" disabled={loading}>
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      {loading && <div className="status processing">⏳ Generating content...</div>}
      {result && <ResultView result={result} />}
    </div>
  );
}

function ResultView({ result }) {
  if (result.raw_response) {
    return <div className="result-card"><pre>{result.raw_response}</pre></div>;
  }
  return (
    <div className="result-card">
      {Object.entries(result).map(([key, value]) => (
        <div key={key} className="result-field">
          <h4>{formatKey(key)}</h4>
          <FieldValue value={value} />
        </div>
      ))}
    </div>
  );
}

function FieldValue({ value }) {
  if (typeof value === 'string') return <p>{value}</p>;
  if (Array.isArray(value)) {
    return (
      <ul>
        {value.map((item, i) => (
          <li key={i}>{typeof item === 'object' ? <ObjectView obj={item} /> : item}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object' && value !== null) return <ObjectView obj={value} />;
  return <p>{String(value)}</p>;
}

function ObjectView({ obj }) {
  return (
    <div className="object-view">
      {Object.entries(obj).map(([k, v]) => (
        <div key={k}><strong>{formatKey(k)}:</strong> <FieldValue value={v} /></div>
      ))}
    </div>
  );
}

function formatKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
