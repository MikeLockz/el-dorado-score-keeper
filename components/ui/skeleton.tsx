'use client';

import * as React from 'react';
import clsx from 'clsx';

import styles from './skeleton.module.scss';

const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, 'aria-hidden': ariaHidden, ...props }, ref) => {
    return (
      <div
        ref={ref}
        aria-hidden={ariaHidden ?? true}
        className={clsx(styles.skeleton, className)}
        {...props}
      />
    );
  },
);

Skeleton.displayName = 'Skeleton';

export { Skeleton };
