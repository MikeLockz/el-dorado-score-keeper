import { spawn, spawnSync } from 'child_process';

const truthyValues = new Set(['1', 'true', 'yes', 'on']);

const parseFlag = (value: string | undefined) => {
  if (!value) return false;
  return truthyValues.has(value.trim().toLowerCase());
};

const hasObservabilityEnabled = parseFlag(process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED);

if (!hasObservabilityEnabled) {
  console.info('Observability is disabled (set NEXT_PUBLIC_OBSERVABILITY_ENABLED=true to enable).');
  process.exit(0);
}

const browserApiKey =
  process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY ||
  process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY;

if (!browserApiKey) {
  console.warn(
    'New Relic ingest key missing. Provide NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY (or alias NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY) to stream telemetry.',
  );
  process.exit(1);
}

console.info('New Relic browser telemetry does not require a tunnel. Ensure outbound HTTPS access to log-api.newrelic.com.');

const cliProbe = spawnSync('pnpm', ['exec', 'nr1', '--version'], {
  stdio: 'ignore',
});

if (cliProbe.error || cliProbe.status !== 0) {
  console.warn('Optional: install the New Relic CLI (nr1) if you need extra tooling.');
}

const mockTunnel = spawn('node', ['-e', 'console.info("Telemetry ready"); setTimeout(()=>{}, 1000);'], {
  stdio: 'inherit',
});

mockTunnel.on('exit', () => {
  process.exit(0);
});

mockTunnel.on('error', (error) => {
  console.error('Unable to launch placeholder telemetry task:', error);
  process.exit(1);
});
