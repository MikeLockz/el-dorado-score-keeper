import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createPostHogClient } from './client';
import { INSIGHTS } from './insights';
import {
  type CliConfig,
  type InsightDefinition,
  type InsightPayload,
  type UpsertSummary,
} from './types';

const parseFlags = (argv: string[]) => new Set(argv.filter((token) => token.startsWith('--')));

export const loadConfig = (): CliConfig => {
  const flags = parseFlags(process.argv.slice(2));

  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing POSTHOG_PERSONAL_API_KEY — generate a personal API key with write access.');
  }

  const rawProjectId = process.env.POSTHOG_PROJECT_ID?.trim();
  const projectId = rawProjectId ? Number(rawProjectId) : NaN;
  if (!Number.isInteger(projectId)) {
    throw new Error('POSTHOG_PROJECT_ID must be an integer project identifier.');
  }

  const apiHost = process.env.POSTHOG_API_HOST?.trim();

  return {
    apiHost: apiHost && apiHost.length ? apiHost : 'https://app.posthog.com',
    apiKey,
    projectId,
    dryRun: flags.has('--dry-run'),
    json: flags.has('--json'),
  };
};

export const buildPayload = (definition: InsightDefinition): InsightPayload => ({
  name: definition.name,
  description: definition.description ?? '',
  tags: [...(definition.tags ?? [])],
  filters: definition.filters ? { ...definition.filters } : {},
  query: definition.query ? { ...definition.query } : {},
});

const recordDryRun = (
  summary: UpsertSummary[],
  definition: InsightDefinition,
  payload: InsightPayload,
  existing: { id: number | null } | null,
  jsonOutput: boolean,
) => {
  const action = existing ? 'would-update' : 'would-create';
  const entry: UpsertSummary = {
    name: definition.name,
    action,
    id: existing?.id ?? null,
  };
  if (jsonOutput) {
    entry.payload = payload;
  }
  summary.push(entry);

  if (!jsonOutput) {
    console.log(`[dry-run] ${definition.name}: ${action}`);
    console.dir(payload, { depth: null });
  }
};

const logResults = (config: CliConfig, results: UpsertSummary[]) => {
  if (config.json) {
    console.log(
      JSON.stringify(
        {
          dryRun: config.dryRun,
          results,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.table(
    results.map(({ name, action, id }) => ({
      name,
      action,
      id: id ?? undefined,
    })),
  );
};

export const run = async () => {
  let config: CliConfig;

  try {
    config = loadConfig();
  } catch (error) {
    process.exitCode = 1;
    console.error('[posthog] Unable to load configuration.', error instanceof Error ? error.message : error);
    return;
  }

  const client = createPostHogClient(config);
  const results: UpsertSummary[] = [];

  for (const definition of INSIGHTS) {
    const payload = buildPayload(definition);

    try {
      const existing = await client.getInsightByName(definition.name);

      if (config.dryRun) {
        recordDryRun(results, definition, payload, existing, config.json);
        continue;
      }

      if (!existing) {
        const created = await client.createInsight(payload);
        results.push({
          name: definition.name,
          action: 'created',
          id: created?.id ?? null,
        });
      } else {
        const updated = await client.updateInsight(existing.id, payload);
        results.push({
          name: definition.name,
          action: 'updated',
          id: updated?.id ?? existing.id,
        });
      }
    } catch (error) {
      process.exitCode = 1;
      const message = error instanceof Error ? error.message : String(error);
      results.push({ name: definition.name, action: 'error', error: message });
      if (!config.json) {
        console.error(`[posthog] Failed to process ${definition.name}: ${message}`);
      }
    }
  }

  logResults(config, results);
};

const shouldRun = () => {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch (error) {
    return false;
  }
};

if (shouldRun()) {
  run().catch((error) => {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[posthog] Unhandled error during bootstrap.', message);
  });
}
