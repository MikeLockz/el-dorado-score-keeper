'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import clsx from 'clsx';

import styles from './label.module.scss';

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root data-slot="label" className={clsx(styles.label, className)} {...props} />
  );
}

export { Label };
