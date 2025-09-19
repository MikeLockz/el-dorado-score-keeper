'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, 'aria-hidden': ariaHidden, ...props }, ref) => {
    return (
      <div
        ref={ref}
        aria-hidden={ariaHidden ?? true}
        className={cn('animate-pulse rounded-md bg-surface-muted', className)}
        {...props}
      />
    );
  },
);

Skeleton.displayName = 'Skeleton';

export { Skeleton };
