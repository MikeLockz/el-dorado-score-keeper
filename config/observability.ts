import { z } from 'zod';

import { getObservabilityFlags, type ObservabilityRuntime } from './flags';

const SERVICE_NAME_FALLBACK = 'el-dorado-score-keeper';
const WEB_SERVICE_SUFFIX = '-web';

const BrowserConfigSchema = z.object({
  apiKey: z
    .string({
      required_error:
        'NEXT_PUBLIC_HDX_API_KEY must be defined when browser observability is enabled',
    })
    .min(1, 'NEXT_PUBLIC_HDX_API_KEY must be defined when browser observability is enabled'),
  host: z.string().url().optional(),
  environment: z.string().default('development'),
  serviceName: z.string().default(`${SERVICE_NAME_FALLBACK}${WEB_SERVICE_SUFFIX}`),
});

type BrowserConfig = z.infer<typeof BrowserConfigSchema>;

export type HyperDXConfig =
  | ({ runtime: ObservabilityRuntime; enabled: true } & BrowserConfig)
  | { runtime: ObservabilityRuntime; enabled: false };

const resolveBrowserEnvironment = () => process.env.NEXT_PUBLIC_APP_ENV?.trim() || 'development';

export const isObservabilityEnabled = (_runtime: ObservabilityRuntime) => {
  const flags = getObservabilityFlags();
  return flags.browser;
};

export const getHyperDXConfig = (runtime: ObservabilityRuntime): HyperDXConfig => {
  const enabled = isObservabilityEnabled(runtime);

  if (!enabled) {
    return { runtime, enabled: false };
  }

  const parsed = BrowserConfigSchema.safeParse({
    apiKey: process.env.NEXT_PUBLIC_HDX_API_KEY,
    host: process.env.NEXT_PUBLIC_HDX_HOST,
    environment: resolveBrowserEnvironment(),
    serviceName:
      process.env.NEXT_PUBLIC_HDX_SERVICE_NAME?.trim() ||
      `${SERVICE_NAME_FALLBACK}${WEB_SERVICE_SUFFIX}`,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(message || 'Invalid browser observability configuration');
  }

  return {
    runtime,
    enabled: true,
    ...parsed.data,
  };
};
