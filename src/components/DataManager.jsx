// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Generic CRUD component for simple data entities (audiences, regulatory rules, etc.).
 * Renders a form (configurable fields) and a list of items with delete buttons.
 */
export default function DataManager({ title, subtitle, endpoint, fields, itemKey = 'items' }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((f) => [f.name, ''])));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    try {
      const data = await api(endpoint);
      setItems(data[itemKey] || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (!form.name?.trim()) return;
    setError('');
    setLoading(true);
    try {
      await api(endpoint, { method: 'POST', body: JSON.stringify(form) });
      setForm(Object.fromEntries(fields.map((f) => [f.name, ''])));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this item?')) return;
    try {
      await api(`${endpoint}/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h2>{title}</h2>
      <p className="subtitle">{subtitle}</p>

      <form onSubmit={add} className="product-form">
        {fields.map((f) => (
          f.type === 'textarea'
            ? <textarea key={f.name} placeholder={f.placeholder} rows={3} value={form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
            : f.type === 'select'
              ? <select key={f.name} value={form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                  <option value="">{f.placeholder}</option>
                  {f.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              : <input key={f.name} placeholder={f.placeholder} value={form[f.name]} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
        ))}
        <button type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add'}</button>
      </form>
      {error && <div className="error">{error}</div>}

      <div className="product-list">
        <h3>{items.length} item{items.length !== 1 ? 's' : ''}</h3>
        {items.length === 0 && <p className="empty">No items yet. Add one above.</p>}
        {items.map((item) => (
          <div key={item.id} className="product-card">
            <div>
              <strong>{item.name}</strong>
              {fields.filter((f) => f.name !== 'name' && item[f.name]).map((f) => (
                <div key={f.name} className="desc">{item[f.name]}</div>
              ))}
            </div>
            <button type="button" className="btn-delete" onClick={() => remove(item.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
