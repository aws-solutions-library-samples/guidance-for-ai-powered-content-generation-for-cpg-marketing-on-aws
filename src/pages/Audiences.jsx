// Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import DataManager from '../components/DataManager';

export default function Audiences() {
  return (
    <DataManager
      title="Audience Segments"
      subtitle="Define customer segments. Used to personalize email campaigns and social posts."
      endpoint="audiences"
      fields={[
        { name: 'name', placeholder: 'Segment name (e.g., Health-conscious millennials)' },
        { name: 'description', type: 'textarea', placeholder: 'Demographics, preferences, behaviors...' },
      ]}
    />
  );
}
