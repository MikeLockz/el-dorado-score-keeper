import type { Metadata } from 'next';

const TARGET = '/rules/';

export const metadata: Metadata = {
  title: 'Redirecting…',
  robots: {
    index: false,
    follow: false,
  },
  refresh: {
    url: TARGET,
    seconds: 0,
  },
};

import styles from './page.module.scss';

export default function HowToRedirectPage() {
  return (
    <main className={styles.container}>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace('${TARGET}');`,
        }}
      />
      <h1 className={styles.title}>Redirecting to the Rules…</h1>
      <p className={styles.message}>
        If you are not redirected,{' '}
        <a href={TARGET} className={styles.link}>
          open the rules page
        </a>
        .
      </p>
    </main>
  );
}
