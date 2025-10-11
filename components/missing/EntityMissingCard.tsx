'use client';

import React from 'react';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  CardAction,
  Button,
} from '@/components/ui';
import type { MissingEntityMetadata } from '@/lib/ui/not-found-metadata';

type EntityMissingCardProps = {
  metadata: MissingEntityMetadata;
  className?: string;
};

export function EntityMissingCard({ metadata, className }: EntityMissingCardProps) {
  return (
    <Card role="status" aria-live="polite" className={className}>
      <CardHeader>
        <CardTitle>{metadata.title}</CardTitle>
        <CardDescription>{metadata.description}</CardDescription>
      </CardHeader>
      <CardFooter>
        <CardAction style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button asChild>
            <Link href={metadata.primary.href}>{metadata.primary.label}</Link>
          </Button>
          {metadata.secondary ? (
            <Button variant="outline" asChild>
              <Link href={metadata.secondary.href}>{metadata.secondary.label}</Link>
            </Button>
          ) : null}
        </CardAction>
      </CardFooter>
    </Card>
  );
}

export default EntityMissingCard;
