'use client';
import * as React from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Card, Button } from '@/components/ui';
import { logEvent } from '@/lib/client-log';
import { Loader2 } from 'lucide-react';

import styles from './mode-card.module.scss';

export type ModeCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  primary: ModeCardAction;
  secondary?: ModeCardAction | null;
  ariaLabel: string;
  primaryEvent?: string;
};

export type ModeCardAction = {
  label: string;
  ariaLabel?: string;
  href?: string;
  onClick?: (event: React.MouseEvent | React.KeyboardEvent) => void;
  disabled?: boolean;
  pending?: boolean;
};

export function ModeCard({
  icon,
  title,
  description,
  primary,
  secondary,
  ariaLabel,
  primaryEvent,
}: ModeCardProps) {
  const enhancedPrimary = React.useMemo<ModeCardAction>(() => {
    return {
      ...primary,
      onClick: (event) => {
        primary.onClick?.(event);
        if (primaryEvent) {
          logEvent(primaryEvent);
        }
      },
    };
  }, [primary, primaryEvent]);

  const renderPrimary = (action: ModeCardAction) => {
    const { href, onClick, ariaLabel: labelOverride, label, disabled, pending } = action;
    const content = (
      <>
        {pending ? <Loader2 className={styles.spinner} aria-hidden="true" /> : null}
        {label}
      </>
    );
    if (href) {
      return (
        <Button variant="secondary" asChild disabled={disabled || pending}>
          <Link
            href={href}
            aria-label={labelOverride ?? label}
            onClick={(event) => {
              if (disabled || pending) {
                event.preventDefault();
                return;
              }
              onClick?.(event);
            }}
          >
            {content}
          </Link>
        </Button>
      );
    }
    return (
      <Button
        type="button"
        onClick={onClick}
        disabled={disabled || pending}
        variant='secondary'
        aria-label={labelOverride ?? label}
      >
        {content}
      </Button>
    );
  };

  const renderSecondary = (action: ModeCardAction) => {
    const { href, onClick, label, disabled, pending } = action;
    const className = clsx(styles.secondaryAction, pending && styles.secondaryActionPending);
    const content = (
      <>
        {pending ? <Loader2 className={styles.spinner} aria-hidden="true" /> : null}
        {label}
      </>
    );
    if (href && !onClick) {
      return (
        <Link
          href={href}
          className={className}
          aria-disabled={disabled || pending || undefined}
          onClick={(event) => {
            if (disabled || pending) event.preventDefault();
          }}
        >
          {content}
        </Link>
      );
    }
    return (
      <button type="button" onClick={onClick} disabled={disabled || pending} className={className}>
        {content}
      </button>
    );
  };

  return (
    <Card className={styles.card}>
      <section aria-label={ariaLabel}>
        <div className={styles.header}>
          <div className={styles.icon}>{icon}</div>
          <h3 className={styles.title}>{title}</h3>
        </div>
        <p className={styles.description}>{description}</p>
        <div className={styles.actions}>
          {renderPrimary(enhancedPrimary)}
          {secondary ? renderSecondary(secondary) : null}
        </div>
      </section>
    </Card>
  );
}

export default ModeCard;
