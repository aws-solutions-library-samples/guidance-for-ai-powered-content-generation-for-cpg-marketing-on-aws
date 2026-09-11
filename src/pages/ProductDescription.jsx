// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import TextGenerator from '../components/TextGenerator';

export default function ProductDescription() {
  return (
    <TextGenerator
      title="Product Descriptions"
      subtitle="Generate e-commerce, retail, and social media product descriptions"
      contentType="product_description"
      placeholder="Describe the product: name, category, features, benefits...&#10;&#10;Example: Organic whey protein powder, 2lb, chocolate flavor, 24g protein per serving, gluten-free, grass-fed"
    />
  );
}
