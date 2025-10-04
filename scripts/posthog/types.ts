export type InsightKind = 'TRENDS' | 'FUNNELS' | 'SQL';

export interface InsightDefinition {
  name: string;
  description?: string;
  tags?: string[];
  kind: InsightKind;
  filters?: Record<string, unknown>;
  query: Record<string, unknown>;
}

export interface InsightPayload {
  name: string;
  description: string;
  tags: string[];
  filters: Record<string, unknown>;
  query: Record<string, unknown>;
}

export interface CliConfig {
  apiHost: string;
  apiKey: string;
  projectId: number;
  dryRun: boolean;
  json: boolean;
}

export interface InsightRecord {
  id: number;
  name: string;
  description?: string | null;
  tags?: string[] | null;
  filters?: Record<string, unknown> | null;
  query?: Record<string, unknown> | null;
}

export interface UpsertSummary {
  name: string;
  action: 'created' | 'updated' | 'would-create' | 'would-update' | 'skipped' | 'error';
  id?: number | null;
  error?: string;
  payload?: InsightPayload;
}

export interface PostHogClient {
  getInsightByName: (name: string) => Promise<InsightRecord | null>;
  createInsight: (payload: InsightPayload) => Promise<InsightRecord | null>;
  updateInsight: (id: number, payload: InsightPayload) => Promise<InsightRecord | null>;
}
