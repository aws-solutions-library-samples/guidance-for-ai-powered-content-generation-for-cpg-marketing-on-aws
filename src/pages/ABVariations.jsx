// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import TextGenerator from '../components/TextGenerator';

export default function ABVariations() {
  return (
    <TextGenerator
      title="A/B Testing Variations"
      subtitle="Generate 4 variations of your message with different tones (urgent, friendly, professional, playful)"
      contentType="ab_variations"
      placeholder="Enter the base message to vary...&#10;&#10;Example: Try our new protein powder for better workout recovery"
    />
  );
}
