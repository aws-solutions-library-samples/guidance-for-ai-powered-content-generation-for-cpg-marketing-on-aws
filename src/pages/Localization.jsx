// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import TextGenerator from '../components/TextGenerator';

export default function Localization() {
  return (
    <TextGenerator
      title="Content Localization"
      subtitle="Culturally adapt content for different markets and languages"
      contentType="localization"
      placeholder="Paste the content to localize...&#10;&#10;Example: Start your summer strong with our premium protein powder — 20% off for a limited time!"
      extraFields={[
        { name: 'target_language', label: 'Target language', type: 'select', options: ['Spanish', 'French', 'German', 'Japanese', 'Portuguese (Brazil)', 'Mandarin', 'Italian', 'Arabic'] },
        { name: 'target_market', label: 'Target market', type: 'text', placeholder: 'e.g., Mexico, Quebec, Brazil' },
      ]}
    />
  );
}
