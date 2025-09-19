'use client';

import React from 'react';
import { PlayerManagement } from '@/components/players';

export default function PlayersPage() {
  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      <PlayerManagement />
    </div>
  );
}
