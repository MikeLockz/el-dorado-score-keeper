'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button } from '@/components/ui';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Header() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href);
  const navItems: Array<{ href: string; label: string; group: 'primary' | 'secondary' }> = [
    { href: '/scorecard', label: 'Score Card', group: 'primary' },
    { href: '/games', label: 'Games', group: 'primary' },
    { href: '/players', label: 'Players', group: 'primary' },
    { href: '/single-player', label: 'Single Player', group: 'primary' },
    { href: '/settings', label: 'Settings', group: 'secondary' },
    { href: '/rules', label: 'Rules', group: 'secondary' },
  ];
  const primaryNav = navItems.filter((item) => item.group === 'primary');
  const secondaryNav = navItems.filter((item) => item.group === 'secondary');

  const renderInlineLink = (item: (typeof navItems)[number]) => {
    const active = isActive(item.href);
    return (
      <Link
        key={`inline-${item.href}`}
        href={item.href}
        className={cn(
          'rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          active
            ? 'bg-surface-muted text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-surface-subtle',
        )}
        aria-current={active ? 'page' : undefined}
      >
        {item.label}
      </Link>
    );
  };

  const itemBase =
    'block w-full text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer px-3 py-2';
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="w-full px-3 lg:px-6 h-12 flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded-full px-2 py-1"
          aria-label="Go to home"
        >
          <Image
            src={`${basePath}/el-dorado-card-game-logo.png`}
            alt="El Dorado logo"
            width={24}
            height={24}
            className="h-5 w-5 object-contain"
          />
          <span>El Dorado</span>
        </Link>
        <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
          {primaryNav.map((item) => renderInlineLink(item))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <nav aria-label="Secondary" className="hidden md:flex items-center gap-1">
            {secondaryNav.map((item) => renderInlineLink(item))}
          </nav>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Open navigation menu"
                className="h-8 px-2 md:hidden"
              >
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="min-w-[200px] rounded-md border bg-popover p-0 text-popover-foreground shadow-md"
            >
              {primaryNav.map((item) => (
                <DropdownMenu.Item
                  key={`dropdown-${item.href}`}
                  asChild
                  className={cn(
                    itemBase,
                    isActive(item.href) &&
                      'bg-accent text-accent-foreground font-semibold relative z-10',
                  )}
                >
                  <Link href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
                    {item.label}
                  </Link>
                </DropdownMenu.Item>
              ))}
              {secondaryNav.length ? <DropdownMenu.Separator className="h-px bg-border" /> : null}
              {secondaryNav.map((item) => (
                <DropdownMenu.Item
                  key={`dropdown-${item.href}`}
                  asChild
                  className={cn(
                    itemBase,
                    isActive(item.href) &&
                      'bg-accent text-accent-foreground font-semibold relative z-10',
                  )}
                >
                  <Link href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
                    {item.label}
                  </Link>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}
