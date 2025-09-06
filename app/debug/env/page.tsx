export const metadata = {
  title: 'Env Debug',
};

export default function EnvDebugPage() {
  const val = process.env.NEXT_PUBLIC_ANALYTICS_WORKER_URL ?? '(unset)';
  return (
    <main style={{ padding: 24 }}>
      <h1>Env Debug</h1>
      <p>
        <strong>NEXT_PUBLIC_ANALYTICS_WORKER_URL</strong>:
      </p>
      <pre
        style={{
          background: '#111',
          color: '#0f0',
          padding: 12,
          borderRadius: 6,
          overflowX: 'auto',
        }}
      >
        {val}
      </pre>
      <p style={{ marginTop: 16, opacity: 0.7 }}>
        This page is for temporary verification and can be removed after testing.
      </p>
    </main>
  );
}
