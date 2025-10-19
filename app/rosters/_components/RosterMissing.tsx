'use client';

import React from 'react';
import { EntityMissingCard } from '@/components/missing/EntityMissingCard';
import { getMissingEntityMetadata } from '@/lib/ui/not-found-metadata';

export function RosterMissing({ className }: { className?: string }) {
  return (
    <EntityMissingCard className={className ?? ''} metadata={getMissingEntityMetadata('roster')} />
  );
}

export default RosterMissing;
