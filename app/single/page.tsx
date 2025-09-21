import type { Metadata } from 'next';

const TARGET = '/single-player/';

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

export default function SingleRedirectPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace('${TARGET}');`,
        }}
      />
      <h1 className="text-lg font-semibold">Redirecting to Single Player…</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        If you are not redirected,{' '}
        <a href={TARGET} className="underline">
          continue to the Single Player mode
        </a>
        .
      </p>
    </main>
  );
}
