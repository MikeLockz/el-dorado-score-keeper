'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { Button } from '@/components/ui';
import { Menu } from 'lucide-react';
import { useAppState } from '@/components/state-provider';
import {
  resolveScorecardRoute,
  resolveSinglePlayerRoute,
  resolvePlayerRoute,
  resolveArchivedGameRoute,
} from '@/lib/state';

import styles from './header.module.scss';

export default function Header() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const pathname = usePathname();
  const { state } = useAppState();

  type NavItem = {
    href: string;
    label: string;
    group: 'primary' | 'secondary';
    match?: (path: string) => boolean;
  };

  const scorecardRoute = React.useMemo(() => resolveScorecardRoute(state), [state]);
  const singlePlayerRoute = React.useMemo(
    () => resolveSinglePlayerRoute(state, { fallback: 'entry' }),
    [state],
  );

  const navItems: NavItem[] = React.useMemo(
    () => [
      {
        href: resolveArchivedGameRoute(null),
        label: 'Games',
        group: 'primary',
        match: (path) => path === '/games' || path.startsWith('/games/'),
      },
      {
        href: resolvePlayerRoute(null),
        label: 'Players',
        group: 'primary',
        match: (path) => path === '/players' || path.startsWith('/players/'),
      },
      {
        href: singlePlayerRoute,
        label: 'Single Player',
        group: 'primary',
        match: (path) => path.startsWith('/single-player'),
      },
      { href: '/settings', label: 'Settings', group: 'secondary' },
      { href: '/rules', label: 'Rules', group: 'secondary' },
    ],
    [scorecardRoute, singlePlayerRoute],
  );
  const primaryNav = navItems.filter((item) => item.group === 'primary');
  const secondaryNav = navItems.filter((item) => item.group === 'secondary');

  const isActive = React.useCallback(
    (item: NavItem) => {
      if (!pathname) return false;
      if (item.match) return item.match(pathname);
      return item.href === '/' ? pathname === '/' : pathname === item.href;
    },
    [pathname],
  );

  const renderInlineLink = (item: (typeof navItems)[number]) => {
    const active = isActive(item);
    return (
      <Link
        key={`inline-${item.href}`}
        href={item.href}
        className={clsx(styles.navLink, active && styles.navLinkActive)}
        aria-current={active ? 'page' : undefined}
      >
        {item.label}
      </Link>
    );
  };

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="Go to home">
          <Image
            src={`${basePath}/el-dorado-card-game-logo.png`}
            alt="El Dorado logo"
            width={24}
            height={24}
            className={styles.brandLogo}
          />
          <span>El Dorado</span>
        </Link>
        <nav aria-label="Primary" className={styles.primaryNav}>
          {primaryNav.map((item) => renderInlineLink(item))}
        </nav>
        <div className={styles.navCluster}>
          <nav aria-label="Secondary" className={styles.secondaryNav}>
            {secondaryNav.map((item) => renderInlineLink(item))}
          </nav>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Open navigation menu"
                className={styles.menuButton}
              >
                <Menu className={styles.menuIcon} />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" sideOffset={8} className={styles.dropdownContent}>
              {primaryNav.map((item) => (
                <DropdownMenu.Item
                  key={`dropdown-${item.href}`}
                  asChild
                  className={clsx(styles.dropdownItem, isActive(item) && styles.dropdownItemActive)}
                >
                  <Link href={item.href} aria-current={isActive(item) ? 'page' : undefined}>
                    {item.label}
                  </Link>
                </DropdownMenu.Item>
              ))}
              {secondaryNav.length ? (
                <DropdownMenu.Separator className={styles.dropdownSeparator} />
              ) : null}
              {secondaryNav.map((item) => (
                <DropdownMenu.Item
                  key={`dropdown-${item.href}`}
                  asChild
                  className={clsx(styles.dropdownItem, isActive(item) && styles.dropdownItemActive)}
                >
                  <Link href={item.href} aria-current={isActive(item) ? 'page' : undefined}>
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
