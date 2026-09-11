// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import TextGenerator from '../components/TextGenerator';

export default function TrendingTopics() {
  return (
    <TextGenerator
      title="Trending Topics"
      subtitle="Identify current trending topics for your category. Use them to inform content strategy."
      contentType="trending_topics"
      placeholder="Enter category or industry...&#10;&#10;Example: Health and wellness for women aged 25-40"
    />
  );
}
