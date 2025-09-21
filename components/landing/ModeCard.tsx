'use client';
import * as React from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';
import { logEvent } from '@/lib/client-log';
import { Loader2 } from 'lucide-react';

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
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {label}
      </>
    );
    if (href) {
      return (
        <Button asChild disabled={disabled || pending}>
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
        aria-label={labelOverride ?? label}
      >
        {content}
      </Button>
    );
  };

  const renderSecondary = (action: ModeCardAction) => {
    const { href, onClick, label, disabled, pending } = action;
    const className =
      'text-sm text-primary underline-offset-4 hover:underline inline-flex items-center gap-1';
    const content = (
      <>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
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
    <Card className="h-full flex flex-col gap-3 border p-5 sm:p-6 text-muted-foreground">
      <section aria-label={ariaLabel}>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center h-8 w-8 rounded-xl border bg-muted text-muted-foreground">
            {icon}
          </div>
          <h3 className="text-base font-semibold leading-tight text-card-foreground">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
        <div className="mt-3 flex items-center gap-3">
          {renderPrimary(enhancedPrimary)}
          {secondary ? renderSecondary(secondary) : null}
        </div>
      </section>
    </Card>
  );
}

export default ModeCard;
