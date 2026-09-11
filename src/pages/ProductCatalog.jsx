// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useEffect, useState } from 'react';
import { api } from '../api';

export default function ProductCatalog() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', category: '', sku: '', description: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api('products');
      setProducts(data.products || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function addProduct(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError('');
    setLoading(true);
    try {
      await api('products', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', category: '', sku: '', description: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function removeProduct(id) {
    if (!confirm('Delete this product?')) return;
    try {
      await api(`products/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h2>Product Catalog</h2>
      <p className="subtitle">Manage products used across content generation</p>

      <form onSubmit={addProduct} className="product-form">
        <input placeholder="Product name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <textarea placeholder="Description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add Product'}</button>
      </form>
      {error && <div className="error">{error}</div>}

      <div className="product-list">
        <h3>Products ({products.length})</h3>
        {products.length === 0 && <p className="empty">No products yet. Add one above.</p>}
        {products.map((p) => (
          <div key={p.id} className="product-card">
            <div>
              <strong>{p.name}</strong>
              {p.sku && <span className="sku"> · {p.sku}</span>}
              {p.category && <div className="category">{p.category}</div>}
              {p.description && <div className="desc">{p.description}</div>}
            </div>
            <button type="button" className="btn-delete" onClick={() => removeProduct(p.id)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
