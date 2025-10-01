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

const browserApiKey = process.env.NEXT_PUBLIC_HDX_API_KEY;

if (!browserApiKey) {
  console.warn('HyperDX credentials missing. Provide NEXT_PUBLIC_HDX_API_KEY to tunnel telemetry.');
  process.exit(1);
}

const cliProbe = spawnSync('pnpm', ['exec', 'hyperdx', '--version'], {
  stdio: 'ignore',
});

if (cliProbe.error || cliProbe.status !== 0) {
  console.warn('HyperDX CLI not found. Install it with "pnpm add -D @hyperdx/cli".');
  process.exit(1);
}

console.info('Starting HyperDX tunnel for service "app"...');

const tunnel = spawn('pnpm', ['exec', 'hyperdx', 'tunnel', '--service', 'app'], {
  stdio: 'inherit',
});

const shutdown = (code: number | null, signal: NodeJS.Signals | null) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code === null ? 0 : code);
};

tunnel.on('exit', (code, signal) => shutdown(code, signal));

tunnel.on('error', (error) => {
  console.error('Unable to start the HyperDX tunnel:', error);
  process.exit(1);
});
