'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { Button } from '@/components/ui';
import { Menu } from 'lucide-react';

import styles from './header.module.scss';

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
                  className={clsx(
                    styles.dropdownItem,
                    isActive(item.href) && styles.dropdownItemActive,
                  )}
                >
                  <Link href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
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
                  className={clsx(
                    styles.dropdownItem,
                    isActive(item.href) && styles.dropdownItemActive,
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
