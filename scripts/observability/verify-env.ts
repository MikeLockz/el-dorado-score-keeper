const truthyValues = new Set(['1', 'true', 'yes', 'on']);
const falsyValues = new Set(['0', 'false', 'no', 'off']);

const parseBoolean = (value: string | undefined) => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (truthyValues.has(normalized)) return true;
  if (falsyValues.has(normalized)) return false;
  return undefined;
};

const readEnv = (key: string) => {
  const value = process.env[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const selectEnv = (keys: string[]) => {
  for (const key of keys) {
    const value = readEnv(key);
    if (value) {
      return { key, value };
    }
  }
  return null;
};

const problems: string[] = [];
const warnings: string[] = [];
const notes: string[] = [];

const enforceStrictValidation =
  parseBoolean(process.env.OBSERVABILITY_VALIDATE) ?? parseBoolean(process.env.CI) ?? false;

const rawFlag = process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED;
const parsedFlag = parseBoolean(rawFlag);

if (parsedFlag === undefined) {
  problems.push(
    'NEXT_PUBLIC_OBSERVABILITY_ENABLED must be set to "true" or "false" during builds.',
  );
}

const provider = readEnv('NEXT_PUBLIC_OBSERVABILITY_PROVIDER');
if (provider && !['newrelic', 'posthog', 'custom'].includes(provider)) {
  warnings.push(
    `NEXT_PUBLIC_OBSERVABILITY_PROVIDER=${provider} is not recognised; defaulting to "newrelic".`,
  );
}

const isBrowserTelemetryEnabled = parsedFlag === true;

if (isBrowserTelemetryEnabled) {
  const license = selectEnv([
    'NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY',
    'NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY',
  ]);
  if (!license) {
    problems.push(
      'Provide NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY (or NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY) when browser observability is enabled.',
    );
  } else {
    notes.push(`New Relic browser ingest key sourced from ${license.key}.`);
  }

  const appEnv = readEnv('NEXT_PUBLIC_APP_ENV');
  if (!appEnv) {
    warnings.push(
      'NEXT_PUBLIC_APP_ENV is not set; defaulting to "development". Set this to "production" or your deployment environment for accurate tagging.',
    );
  } else {
    notes.push(`Browser telemetry environment tag: ${appEnv}.`);
  }

  const appId = selectEnv(['NEXT_PUBLIC_NEW_RELIC_APP_ID', 'NEXT_PUBLIC_NEW_RELIC_BROWSER_APP_ID']);
  if (appId) {
    notes.push(`New Relic applicationId provided via ${appId.key}.`);
    if (!readEnv('NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL')) {
      warnings.push(
        'NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL not set; using New Relic default loader URL.',
      );
    }
  } else {
    warnings.push(
      'NEXT_PUBLIC_NEW_RELIC_APP_ID (or alias NEXT_PUBLIC_NEW_RELIC_BROWSER_APP_ID) missing; the Browser agent will downgrade to the log-only adapter.',
    );
  }
} else if (parsedFlag === false) {
  warnings.push('Browser observability disabled (NEXT_PUBLIC_OBSERVABILITY_ENABLED=false).');
}

const emitList = (level: 'info' | 'warn' | 'error', header: string, messages: string[]) => {
  if (!messages.length) return;
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  logger(header);
  messages.forEach((message) => {
    logger(`  • ${message}`);
  });
};

if (problems.length) {
  emitList(
    enforceStrictValidation ? 'error' : 'warn',
    enforceStrictValidation
      ? '[observability] Build failed due to missing configuration:'
      : '[observability] Missing observability configuration:',
    problems,
  );

  if (enforceStrictValidation) {
    process.exit(1);
  }
}

if (notes.length) {
  emitList('info', '[observability] Environment summary:', notes);
}

if (warnings.length) {
  emitList('warn', '[observability] Environment warnings:', warnings);
}

if (!enforceStrictValidation || !problems.length) {
  console.info('[observability] Environment check completed.');
}
