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

export default function HowToRedirectPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <script
        dangerouslySetInnerHTML={{
          __html: `window.location.replace('${TARGET}');`,
        }}
      />
      <h1 className="text-lg font-semibold">Redirecting to the Rules…</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        If you are not redirected,{' '}
        <a href={TARGET} className="underline">
          open the rules page
        </a>
        .
      </p>
    </main>
  );
}
