// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import TextGenerator from '../components/TextGenerator';

export default function Email() {
  return (
    <TextGenerator
      title="Email Campaigns"
      subtitle="Generate subject lines, preview text, body, and CTAs with personalization"
      contentType="email"
      placeholder="Describe the email campaign...&#10;&#10;Example: Re-engagement email for customers who haven't purchased in 60 days, offering a 15% discount on fitness products"
      extraFields={[
        { name: 'audience', label: 'Audience segment', type: 'text', placeholder: 'e.g., Lapsed customers, 25-40' },
      ]}
    />
  );
}
