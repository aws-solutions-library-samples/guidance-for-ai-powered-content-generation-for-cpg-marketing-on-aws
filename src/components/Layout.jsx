// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearToken } from '../auth';

export default function Layout() {
  const navigate = useNavigate();

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-header">
          <h1>Content Gen</h1>
        </div>
        <div className="nav-section">
          <div className="nav-label">Visuals</div>
          <ul>
            <li><NavLink to="/" end>🖼️ Image</NavLink></li>
            <li><NavLink to="/video">🎬 Video</NavLink></li>
          </ul>
        </div>
        <div className="nav-section">
          <div className="nav-label">Text Content</div>
          <ul>
            <li><NavLink to="/product-description">📝 Product Descriptions</NavLink></li>
            <li><NavLink to="/social">📱 Social Media</NavLink></li>
            <li><NavLink to="/email">✉️ Email</NavLink></li>
            <li><NavLink to="/packaging">📦 Packaging</NavLink></li>
            <li><NavLink to="/localization">🌍 Localization</NavLink></li>
            <li><NavLink to="/ab-variations">🔬 A/B Variations</NavLink></li>
          </ul>
        </div>
        <div className="nav-section">
          <div className="nav-label">Insights</div>
          <ul>
            <li><NavLink to="/trending">📈 Trending Topics</NavLink></li>
            <li><NavLink to="/performance">📊 Performance</NavLink></li>
          </ul>
        </div>
        <div className="nav-section">
          <div className="nav-label">Orchestration</div>
          <ul>
            <li><NavLink to="/campaign">📋 Campaign</NavLink></li>
          </ul>
        </div>
        <div className="nav-section">
          <div className="nav-label">Data</div>
          <ul>
            <li><NavLink to="/brand">🎨 Brand Profile</NavLink></li>
            <li><NavLink to="/products">🛍️ Products</NavLink></li>
            <li><NavLink to="/audiences">👥 Audiences</NavLink></li>
            <li><NavLink to="/regulatory">⚖️ Regulatory Rules</NavLink></li>
            <li><NavLink to="/assets">🗂️ Asset Library</NavLink></li>
          </ul>
        </div>
        <button className="logout-btn" onClick={handleLogout}>Sign Out</button>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
