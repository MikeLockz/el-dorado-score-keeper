'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import styles from './page.module.scss';

export default function GamesLegacyRedirectPage() {
  const router = useRouter();
  const search = useSearchParams();
  const id = search.get('id');

  React.useEffect(() => {
    if (!id) return;
    router.replace(`/games/${id}`);
  }, [id, router]);

  return (
    <div className={styles.page}>
      <div className={styles.feedback} role="status" aria-live="polite">
        <Loader2 className={styles.spinner} aria-hidden="true" />
        Redirecting to the new game detail URL…
      </div>
    </div>
  );
}
