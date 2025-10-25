import React from 'react';
import Link from 'next/link';
import clsx from 'clsx';

import styles from './BackLink.module.scss';

export interface BackLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function BackLink({ href, children, className }: BackLinkProps) {
  return (
    <div className={styles.backLinkContainer}>
      <Link href={href} className={clsx(styles.backLink, className)}>
        {children}
      </Link>
    </div>
  );
}
