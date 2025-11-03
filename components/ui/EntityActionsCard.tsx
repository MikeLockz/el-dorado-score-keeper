'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

import { Button, Card } from '@/components/ui';
import styles from './EntityActionsCard.module.scss';

export type ActionConfig = {
  id: string;
  label: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  icon?: React.ReactNode;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  pending?: boolean;
};

export type EntityActionsCardProps = {
  title: string;
  description: string;
  actions: ActionConfig[];
  className?: string;
};

export function EntityActionsCard({
  title,
  description,
  actions,
  className,
}: EntityActionsCardProps) {
  return (
    <Card className={`${styles.entityActionsSection} ${className || ''}`}>
      <div className={styles.entityActionsHeader}>
        <h2 className={styles.entityActionsTitle}>{title}</h2>
        <p className={styles.entityActionsDescription}>{description}</p>
      </div>
      <div className={styles.entityActionsList}>
        {actions.map((action) => (
          <Button
            key={action.id}
            variant={action.variant || 'default'}
            onClick={action.onClick}
            disabled={action.disabled || action.pending}
            className={styles.actionButton}
          >
            {action.pending ? (
              <Loader2 className={styles.spinner} aria-hidden="true" />
            ) : (
              action.icon
            )}{' '}
            {action.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

export default EntityActionsCard;
