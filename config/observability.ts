import { z } from 'zod';

import { getObservabilityFlags, type ObservabilityRuntime } from './flags';
import { getBrowserObservabilityProvider } from './observability-provider';
import type { NewRelicBrowserAgentConfig } from '@/lib/observability/vendors/types';

const SERVICE_NAME_FALLBACK = 'el-dorado-score-keeper';
const WEB_SERVICE_SUFFIX = '-web';

const NEW_RELIC_LICENSE_KEYS = [
  'NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY',
] as const;

const NEW_RELIC_AGENT_LICENSE_KEYS = [
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY',
  'NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY',
] as const;

const NEW_RELIC_HOST_KEYS = ['NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST'] as const;

const NEW_RELIC_SERVICE_KEYS = ['NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME'] as const;

const NEW_RELIC_APP_ID_KEYS = [
  'NEXT_PUBLIC_NEW_RELIC_APP_ID',
  'NEXT_PUBLIC_NEW_RELIC_BROWSER_APP_ID',
] as const;

const truthyValues = new Set(['1', 'true', 'yes', 'on']);
const devLikeEnvironments = new Set(['development', 'dev', 'local']);

const isTruthyEnv = (value: string | undefined) =>
  value ? truthyValues.has(value.trim().toLowerCase()) : false;

const normalizeAgentEndpoint = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return url.host || undefined;
  } catch {
    const withoutPrefix = trimmed.replace(/^https?:\/\//i, '');
    const normalized = withoutPrefix.replace(/\/$/, '');
    return normalized.trim() || undefined;
  }
};

type PublicEnvKey =
  | (typeof NEW_RELIC_LICENSE_KEYS)[number]
  | (typeof NEW_RELIC_AGENT_LICENSE_KEYS)[number]
  | (typeof NEW_RELIC_HOST_KEYS)[number]
  | (typeof NEW_RELIC_SERVICE_KEYS)[number]
  | (typeof NEW_RELIC_APP_ID_KEYS)[number];

const STATIC_ENV: Record<PublicEnvKey, string | undefined> = {
  NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY: process.env.NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY,
  NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY: process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_LICENSE_KEY,
  NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST: process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST,
  NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME: process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SERVICE_NAME,
  NEXT_PUBLIC_NEW_RELIC_APP_ID: process.env.NEXT_PUBLIC_NEW_RELIC_APP_ID,
  NEXT_PUBLIC_NEW_RELIC_BROWSER_APP_ID: process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_APP_ID,
};

const DEFAULT_NEW_RELIC_BROWSER_SCRIPT_URL =
  'https://js-agent.newrelic.com/nr-loader-spa-current.min.js';

const isBrowserRuntime = typeof window !== 'undefined';

const readEnvValue = (key: PublicEnvKey) => {
  const source = isBrowserRuntime
    ? STATIC_ENV
    : (process.env as Record<string, string | undefined>);

  const value = source[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const selectEnvValue = (keys: readonly PublicEnvKey[]) => {
  for (const key of keys) {
    const value = readEnvValue(key);
    if (value) {
      return value;
    }
  }
  return undefined;
};

const BROWSER_LICENSE_KEY_ERROR =
  'NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY must be defined when browser observability is enabled';

const BrowserConfigSchema = z.object({
  apiKey: z.string().min(1, BROWSER_LICENSE_KEY_ERROR).optional(),
  host: z.string().url().default('https://log-api.newrelic.com'),
  environment: z.string().default('development'),
  serviceName: z.string().default(`${SERVICE_NAME_FALLBACK}${WEB_SERVICE_SUFFIX}`),
});

const NewRelicAgentConfigSchema = z
  .object({
    applicationId: z
      .string({ required_error: 'NEXT_PUBLIC_NEW_RELIC_APP_ID is required when provided' })
      .min(1, 'NEXT_PUBLIC_NEW_RELIC_APP_ID must not be empty'),
    licenseKey: z
      .string({
        required_error: 'NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY is required when agent configuration is set',
      })
      .min(1, 'NEXT_PUBLIC_NEW_RELIC_LICENSE_KEY must not be empty'),
    loaderScriptUrl: z
      .string({
        required_error: 'NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL must be provided for the agent',
      })
      .url('NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL must be a valid URL'),
    accountId: z.string().optional(),
    trustKey: z.string().optional(),
    agentId: z.string().optional(),
    xpid: z.string().optional(),
    beacon: z.string().optional(),
    errorBeacon: z.string().optional(),
    init: z.record(z.unknown()).optional(),
  })
  .strict();

type BrowserConfigBase = z.infer<typeof BrowserConfigSchema>;

type BrowserConfig = BrowserConfigBase & {
  apiKey: string;
};

type BrowserConfigWithAgent = BrowserConfig & {
  newRelic?: NewRelicBrowserAgentConfig;
};

export type BrowserTelemetryConfig =
  | ({ runtime: ObservabilityRuntime; enabled: true } & BrowserConfigWithAgent)
  | { runtime: ObservabilityRuntime; enabled: false };

const resolveBrowserEnvironment = () => process.env.NEXT_PUBLIC_APP_ENV?.trim() || 'development';

export const isObservabilityEnabled = (_runtime: ObservabilityRuntime) => {
  const flags = getObservabilityFlags();
  return flags.browser;
};

export const getBrowserTelemetryConfig = (
  runtime: ObservabilityRuntime,
): BrowserTelemetryConfig => {
  const enabled = isObservabilityEnabled(runtime);

  if (!enabled) {
    return { runtime, enabled: false };
  }

  const provider = getBrowserObservabilityProvider();

  const parsed = BrowserConfigSchema.safeParse({
    apiKey: selectEnvValue(NEW_RELIC_LICENSE_KEYS),
    host: selectEnvValue(NEW_RELIC_HOST_KEYS),
    environment: resolveBrowserEnvironment(),
    serviceName:
      selectEnvValue(NEW_RELIC_SERVICE_KEYS) || `${SERVICE_NAME_FALLBACK}${WEB_SERVICE_SUFFIX}`,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(message || 'Invalid browser observability configuration');
  }

  const baseConfig = parsed.data;

  if (!baseConfig.apiKey && provider === 'newrelic') {
    throw new Error(BROWSER_LICENSE_KEY_ERROR);
  }

  const config: BrowserConfig = {
    ...baseConfig,
    apiKey: baseConfig.apiKey ?? baseConfig.serviceName,
  };

  const newRelic = provider === 'newrelic' ? resolveNewRelicBrowserAgentConfig(config) : undefined;

  const result: BrowserConfigWithAgent = {
    ...config,
    ...(newRelic ? { newRelic } : {}),
  };

  return {
    runtime,
    enabled: true,
    ...result,
  };
};

const resolveNewRelicBrowserAgentConfig = (
  base: BrowserConfig,
): NewRelicBrowserAgentConfig | undefined => {
  const applicationId = selectEnvValue(NEW_RELIC_APP_ID_KEYS);
  if (!applicationId) {
    return undefined;
  }

  const environment = base.environment.toLowerCase();
  const allowDevAgent = isTruthyEnv(process.env.NEXT_PUBLIC_NEW_RELIC_ALLOW_DEV_AGENT);

  if (!allowDevAgent && devLikeEnvironments.has(environment)) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[observability] Skipping New Relic Browser agent in ${base.environment}; set NEXT_PUBLIC_NEW_RELIC_ALLOW_DEV_AGENT=true to enable it locally.`,
      );
    }
    return undefined;
  }

  const envScriptUrl = process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL?.trim();
  const loaderScriptUrl = envScriptUrl || DEFAULT_NEW_RELIC_BROWSER_SCRIPT_URL;

  if (!envScriptUrl && process.env.NODE_ENV !== 'production') {
    console.info(
      `[observability] NEXT_PUBLIC_NEW_RELIC_BROWSER_SCRIPT_URL missing; using default ${DEFAULT_NEW_RELIC_BROWSER_SCRIPT_URL}.`,
    );
  }
  const licenseKey = selectEnvValue(NEW_RELIC_AGENT_LICENSE_KEYS) || base.apiKey;

  if (allowDevAgent && process.env.NODE_ENV !== 'production') {
    const proxyHints = [
      base.host,
      process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_BEACON,
      process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_ERROR_BEACON,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.includes('localhost') || value.includes('127.0.0.1'));

    if (!proxyHints) {
      console.info(
        '[observability] New Relic Browser agent enabled locally; run `pnpm observability:proxy` (pointed at bam.nr-data.net) and set NEXT_PUBLIC_NEW_RELIC_BROWSER_HOST / _BEACON / _ERROR_BEACON to the proxy origin to avoid CORS.',
      );
    }
  }

  const accountId = process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_ACCOUNT_ID?.trim() || undefined;
  const trustKey = process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_TRUST_KEY?.trim() || undefined;
  const agentId = process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_AGENT_ID?.trim() || undefined;
  const xpid = process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_XPID?.trim() || undefined;
  const beacon = normalizeAgentEndpoint(process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_BEACON);
  const errorBeacon = normalizeAgentEndpoint(process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_ERROR_BEACON);
  const rawInit = process.env.NEXT_PUBLIC_NEW_RELIC_BROWSER_INIT?.trim();

  const isLocalHost = (host: string | undefined) =>
    Boolean(host && /^(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host));
  const usingLocalProxy = isLocalHost(beacon) || isLocalHost(errorBeacon);

  let init: Record<string, unknown> | undefined;
  if (rawInit) {
    try {
      const parsed = JSON.parse(rawInit);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        init = parsed as Record<string, unknown>;
      } else {
        throw new Error('must be a JSON object');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'NEXT_PUBLIC_NEW_RELIC_BROWSER_INIT must be valid JSON';
      throw new Error(`NEXT_PUBLIC_NEW_RELIC_BROWSER_INIT ${message}`);
    }
  }

  if (usingLocalProxy) {
    init = {
      ...(init ?? {}),
      ssl: false,
    } satisfies Record<string, unknown>;
  }

  const candidate: Record<string, unknown> = {
    applicationId,
    loaderScriptUrl,
    licenseKey,
  };

  if (accountId) candidate.accountId = accountId;
  if (trustKey) candidate.trustKey = trustKey;
  if (agentId) candidate.agentId = agentId;
  if (xpid) candidate.xpid = xpid;
  if (beacon) candidate.beacon = beacon;
  if (errorBeacon) candidate.errorBeacon = errorBeacon;
  if (init) candidate.init = init;

  const parsed = NewRelicAgentConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(message || 'Invalid New Relic Browser agent configuration');
  }

  return parsed.data;
};
