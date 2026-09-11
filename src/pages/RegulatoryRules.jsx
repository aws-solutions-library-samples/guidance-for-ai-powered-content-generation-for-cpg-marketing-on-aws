// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import DataManager from '../components/DataManager';

export default function RegulatoryRules() {
  return (
    <DataManager
      title="Regulatory Rules"
      subtitle="Define compliance rules per region. Referenced when generating packaging and label copy."
      endpoint="regulatory-rules"
      fields={[
        { name: 'name', placeholder: 'Rule name (e.g., FDA dietary supplement)' },
        { name: 'region', type: 'select', placeholder: 'Region', options: ['US (FDA)', 'EU', 'APAC', 'Canada', 'UK'] },
        { name: 'description', type: 'textarea', placeholder: 'Required disclaimers, prohibited claims, mandatory statements...' },
      ]}
    />
  );
}
