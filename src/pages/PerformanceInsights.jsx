// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import TextGenerator from '../components/TextGenerator';

export default function PerformanceInsights() {
  return (
    <TextGenerator
      title="Performance Insights"
      subtitle="Analyze campaign performance and get actionable recommendations."
      contentType="performance_insights"
      placeholder="Describe campaign and metrics...&#10;&#10;Example: Email campaign for protein powder. Sent 50k emails, 22% open rate, 3% CTR, 0.8% conversion rate."
    />
  );
}
