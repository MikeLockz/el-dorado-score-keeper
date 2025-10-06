'use client';

import React from 'react';
import { EntityMissingCard } from '@/components/missing/EntityMissingCard';
import { getMissingEntityMetadata } from '@/lib/ui/not-found-metadata';

export function ScorecardMissing({ className }: { className?: string }) {
  return (
    <EntityMissingCard className={className} metadata={getMissingEntityMetadata('scorecard')} />
  );
}

export default ScorecardMissing;
