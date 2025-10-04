import { type CliConfig, type InsightPayload, type PostHogClient, type InsightRecord } from './types';

const buildUrl = (base: string, path: string) => {
  const url = new URL(path, base);
  return url;
};

const readResponseBody = async (response: Response) => {
  try {
    return await response.text();
  } catch (error) {
    return `Failed to read response body: ${String(error)}`;
  }
};

const fetchJson = async <T>(config: CliConfig, path: string, init?: RequestInit): Promise<T> => {
  const url = buildUrl(config.apiHost, path);
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await readResponseBody(response);
    throw new Error(
      `PostHog request failed (${response.status} ${response.statusText}) for ${url.toString()} — ${body}`,
    );
  }

  return (await response.json()) as T;
};

export const createPostHogClient = (config: CliConfig): PostHogClient => {
  const basePath = `/api/projects/${config.projectId}/insights/`;

  const getInsightByName = async (name: string) => {
    const searchParams = new URLSearchParams({ search: name, limit: '1' });
    const response = await fetchJson<{ results?: InsightRecord[] }>(
      config,
      `${basePath}?${searchParams.toString()}`,
    );
    const results = response.results ?? [];
    return results.find((candidate) => candidate.name === name) ?? null;
  };

  const createInsight = async (payload: InsightPayload) => {
    if (config.dryRun) {
      return null;
    }

    return fetchJson<InsightRecord>(config, basePath, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const updateInsight = async (id: number, payload: InsightPayload) => {
    if (config.dryRun) {
      return null;
    }

    return fetchJson<InsightRecord>(config, `${basePath}${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  };

  return {
    getInsightByName,
    createInsight,
    updateInsight,
  };
};
