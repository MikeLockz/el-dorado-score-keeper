import { z } from 'zod';

export type ObservabilityRuntime = 'browser';

const truthyValues = new Set(['1', 'true', 'yes', 'on']);
const falsyValues = new Set(['0', 'false', 'no', 'off']);

const ObservabilityFlagsSchema = z.object({
  browser: z.boolean(),
});

type ObservabilityFlagMap = z.infer<typeof ObservabilityFlagsSchema>;

type FeatureFlags = {
  observability: ObservabilityFlagMap;
};

const getRawFlagValue = (value: string | undefined) => {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (truthyValues.has(normalized)) return true;
  if (falsyValues.has(normalized)) return false;
  return undefined;
};

const coerceBooleanFlag = (value: string | undefined) => getRawFlagValue(value) ?? false;

export const getFeatureFlags = (): FeatureFlags => ({
  observability: ObservabilityFlagsSchema.parse({
    browser: coerceBooleanFlag(process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED),
  }),
});

export const getObservabilityFlags = (): ObservabilityFlagMap => getFeatureFlags().observability;

export const isFlagExplicitlySet = (value: string | undefined) =>
  getRawFlagValue(value) !== undefined;

export const isObservabilityFlagSet = (_runtime: ObservabilityRuntime) =>
  isFlagExplicitlySet(process.env.NEXT_PUBLIC_OBSERVABILITY_ENABLED);
