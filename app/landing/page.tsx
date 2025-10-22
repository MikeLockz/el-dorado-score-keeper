'use client';

import * as React from 'react';
import QuickLinks from '@/components/landing/QuickLinks';
import HeroCtas from '@/components/landing/HeroCtas';

import styles from './page.module.scss';

export default function LandingPage() {
  return (
    <div className={styles.container}>
      {/* Hero */}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Set Out for El Dorado</h1>
        <p className={styles.heroCopy}>A card game from south western Michigan.</p>
        <HeroCtas />
      </section>

      {/* Quick Links */}
      <QuickLinks />
    </div>
  );
}
