// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import ImageGenerator from './pages/ImageGenerator';
import CampaignGenerator from './pages/CampaignGenerator';
import VideoGenerator from './pages/VideoGenerator';
import ProductDescription from './pages/ProductDescription';
import SocialMedia from './pages/SocialMedia';
import Email from './pages/Email';
import Packaging from './pages/Packaging';
import Localization from './pages/Localization';
import ABVariations from './pages/ABVariations';
import BrandProfile from './pages/BrandProfile';
import ProductCatalog from './pages/ProductCatalog';
import Audiences from './pages/Audiences';
import RegulatoryRules from './pages/RegulatoryRules';
import AssetLibrary from './pages/AssetLibrary';
import TrendingTopics from './pages/TrendingTopics';
import PerformanceInsights from './pages/PerformanceInsights';

function ProtectedRoute({ children }) {
  return getToken() ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<ImageGenerator />} />
          <Route path="video" element={<VideoGenerator />} />
          <Route path="campaign" element={<CampaignGenerator />} />
          <Route path="product-description" element={<ProductDescription />} />
          <Route path="social" element={<SocialMedia />} />
          <Route path="email" element={<Email />} />
          <Route path="packaging" element={<Packaging />} />
          <Route path="localization" element={<Localization />} />
          <Route path="ab-variations" element={<ABVariations />} />
          <Route path="trending" element={<TrendingTopics />} />
          <Route path="performance" element={<PerformanceInsights />} />
          <Route path="brand" element={<BrandProfile />} />
          <Route path="products" element={<ProductCatalog />} />
          <Route path="audiences" element={<Audiences />} />
          <Route path="regulatory" element={<RegulatoryRules />} />
          <Route path="assets" element={<AssetLibrary />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
