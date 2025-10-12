'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const STATIC_EXPORT_FLAG =
  process.env.NEXT_OUTPUT_EXPORT === 'true' || process.env.GITHUB_ACTIONS === 'true';

export default function StaticExportRedirect(): null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledRef = useRef(false);

  useEffect(() => {
    if (!STATIC_EXPORT_FLAG) {
      return;
    }
    if (handledRef.current) {
      return;
    }
    const redirect = searchParams?.get('redirect');
    if (!redirect) {
      return;
    }
    handledRef.current = true;
    try {
      const decoded = decodeURIComponent(redirect);
      const target = decoded.startsWith('/') ? decoded : `/${decoded}`;
      router.replace(target, { scroll: false });
    } catch (error) {
      console.error('Failed to decode redirect query parameter', error);
      handledRef.current = false;
    }
  }, [router, searchParams]);

  return null;
}
