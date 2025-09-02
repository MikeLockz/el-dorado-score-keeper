import { createInstance } from '@/lib/state/instance';

export function makeTestDB(prefix = 't') {
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

export async function initInstance(
  dbName: string,
  channelName = `chan-${dbName}`,
  useChannel = true,
) {
  return createInstance({ dbName, channelName, useChannel });
}

export async function withTabs(k: number, opts?: { prefix?: string; useChannel?: boolean }) {
  const dbName = makeTestDB(opts?.prefix ?? 'tabs');
  const channelName = `chan-${dbName}`;
  const useChannel = opts?.useChannel ?? true;
  const tabs = await Promise.all(
    Array.from({ length: k }, () => createInstance({ dbName, channelName, useChannel })),
  );
  return {
    dbName,
    channelName,
    tabs,
    async close() {
      for (const t of tabs) t.close();
    },
  };
}

export function seed(prefix = 'e') {
  let i = 0;
  return () => `${prefix}-${i++}`;
}

export function drain() {
  return new Promise<void>((res) => setTimeout(() => res(), 0));
}
