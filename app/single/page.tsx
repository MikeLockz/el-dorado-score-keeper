import type { Metadata } from 'next';

const TARGET = '/single-player/';

export const metadata: Metadata = {
  title: 'Redirecting…',
  robots: {
    index: false,
    follow: false,
  },
  other: {
    refresh: `0; url=${TARGET}`,
  },
};

import styles from './page.module.scss';

export default function SingleRedirectPage() {
  return (
    <main className={styles.container}>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace('${TARGET}');`,
        }}
      />
      <h1 className={styles.title}>Redirecting to Single Player…</h1>
      <p className={styles.message}>
        If you are not redirected,{' '}
        <a href={TARGET} className={styles.link}>
          continue to the Single Player mode
        </a>
        .
      </p>
    </main>
  );
}
