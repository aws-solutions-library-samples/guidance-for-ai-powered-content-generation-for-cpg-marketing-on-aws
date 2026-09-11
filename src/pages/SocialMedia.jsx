// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import TextGenerator from '../components/TextGenerator';

export default function SocialMedia() {
  return (
    <TextGenerator
      title="Social Media Posts"
      subtitle="Generate platform-specific posts for Instagram, LinkedIn, X, Facebook, and TikTok"
      contentType="social_post"
      placeholder="Describe what you want to post about...&#10;&#10;Example: Launch of our new organic protein powder line with 20% off summer discount"
    />
  );
}
