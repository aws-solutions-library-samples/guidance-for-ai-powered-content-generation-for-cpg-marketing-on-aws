// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import TextGenerator from '../components/TextGenerator';

export default function Packaging() {
  return (
    <TextGenerator
      title="Packaging & Label Copy"
      subtitle="Generate regulatory-compliant packaging copy for different regions"
      contentType="packaging"
      placeholder="Describe the product...&#10;&#10;Example: Organic whey protein powder, 2lb, chocolate flavor, 24g protein, gluten-free, no artificial sweeteners"
      extraFields={[
        { name: 'region', label: 'Target region', type: 'select', options: ['US (FDA)', 'EU', 'APAC', 'Canada', 'UK'] },
        { name: 'product_category', label: 'Product category', type: 'text', placeholder: 'e.g., Dietary supplement' },
      ]}
    />
  );
}
