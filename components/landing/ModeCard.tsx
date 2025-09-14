import * as React from 'react';
import Link from 'next/link';
import { Card, Button } from '@/components/ui';

export type ModeCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  primary: { label: string; href: string; ariaLabel?: string };
  secondary?: { label: string; href: string } | null;
  ariaLabel: string;
};

export function ModeCard({ icon, title, description, primary, secondary, ariaLabel }: ModeCardProps) {
  return (
    <Card className="h-full p-4 flex flex-col gap-3 bg-card text-card-foreground border">
      <section aria-label={ariaLabel}>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center h-8 w-8 rounded-md border bg-muted text-muted-foreground">
            {icon}
          </div>
          <h3 className="text-base font-semibold leading-tight">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
        <div className="mt-3 flex items-center gap-3">
          <Button asChild>
            <Link href={primary.href} aria-label={primary.ariaLabel ?? primary.label}>
              {primary.label}
            </Link>
          </Button>
          {secondary ? (
            <Link
              href={secondary.href}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              {secondary.label}
            </Link>
          ) : null}
        </div>
      </section>
    </Card>
  );
}

export default ModeCard;
