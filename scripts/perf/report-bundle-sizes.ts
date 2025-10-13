import fs from 'node:fs/promises';
import path from 'node:path';

type SizeStats = {
  bytes: number;
  files: number;
};

type StaticBundleStats = {
  available: boolean;
  js: SizeStats;
  css: SizeStats;
  other: SizeStats;
};

const projectRoot = process.cwd();

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = value >= 10 || unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
};

const formatNumber = (value: number) => value.toLocaleString('en-US');

const directoryExists = async (target: string) => {
  try {
    const stats = await fs.stat(target);
    return stats.isDirectory();
  } catch {
    return false;
  }
};

const walkDirectory = async (
  root: string,
  onFile: (filePath: string, stats: SizeStats) => void,
) => {
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      try {
        const detail = await fs.stat(fullPath);
        onFile(fullPath, { bytes: detail.size, files: 1 });
      } catch {
        // Ignore files that cannot be read.
      }
    }
  }
};

const collectStaticBundle = async (staticRoot: string): Promise<StaticBundleStats> => {
  const exists = await directoryExists(staticRoot);
  const totals: StaticBundleStats = {
    available: exists,
    js: { bytes: 0, files: 0 },
    css: { bytes: 0, files: 0 },
    other: { bytes: 0, files: 0 },
  };

  if (!exists) {
    return totals;
  }

  await walkDirectory(staticRoot, (filePath, stats) => {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.js') {
      totals.js.bytes += stats.bytes;
      totals.js.files += stats.files;
      return;
    }

    if (ext === '.css') {
      totals.css.bytes += stats.bytes;
      totals.css.files += stats.files;
      return;
    }

    totals.other.bytes += stats.bytes;
    totals.other.files += stats.files;
  });

  return totals;
};

const collectDirectoryTotals = async (
  target: string,
): Promise<{ available: boolean; totals: SizeStats }> => {
  const exists = await directoryExists(target);
  const totals: SizeStats = { bytes: 0, files: 0 };

  if (!exists) {
    return { available: false, totals };
  }

  await walkDirectory(target, (_filePath, stats) => {
    totals.bytes += stats.bytes;
    totals.files += stats.files;
  });

  return { available: true, totals };
};

const printSection = (label: string, stats: SizeStats, note?: string) => {
  const suffix = note ? ` — ${note}` : '';
  console.log(
    `${label}: ${formatBytes(stats.bytes)} (${formatNumber(stats.files)} files)${suffix}`,
  );
};

const main = async () => {
  const nextDir = path.join(projectRoot, '.next');

  const staticDir = path.join(nextDir, 'static');
  const staticStats = await collectStaticBundle(staticDir);

  const serverDir = path.join(nextDir, 'server');
  const serverStats = await collectDirectoryTotals(serverDir);

  const publicDir = path.join(projectRoot, 'public');
  const publicStats = await collectDirectoryTotals(publicDir);

  const exportDir = path.join(projectRoot, 'out');
  const exportStats = await collectDirectoryTotals(exportDir);

  const bundleBytes = staticStats.js.bytes + staticStats.css.bytes;
  const bundleFiles = staticStats.js.files + staticStats.css.files;
  const bundleStats: SizeStats = { bytes: bundleBytes, files: bundleFiles };

  const assetBytes =
    bundleBytes + staticStats.other.bytes + publicStats.totals.bytes + exportStats.totals.bytes;
  const assetFiles =
    bundleFiles + staticStats.other.files + publicStats.totals.files + exportStats.totals.files;
  const assetStats: SizeStats = { bytes: assetBytes, files: assetFiles };

  console.log('Bundle & Asset Size Report');
  console.log('==========================');

  if (!staticStats.available) {
    console.log(
      'No .next/static directory found. Run "pnpm run build" before analyzing bundle sizes.',
    );
  } else {
    printSection('App bundle (client JS + CSS)', bundleStats);
    printSection('  - Client JavaScript', staticStats.js);
    printSection('  - Client CSS', staticStats.css);
    printSection('  - Other client static assets', staticStats.other);
  }

  if (serverStats.available) {
    printSection('Server output (.next/server)', serverStats.totals);
  }

  if (publicStats.available) {
    printSection('Public assets (public/)', publicStats.totals);
  }

  if (exportStats.available) {
    printSection('Static export output (out/)', exportStats.totals);
  }

  if (staticStats.available || publicStats.available || exportStats.available) {
    console.log('--------------------------');
    printSection('Total deployable assets', assetStats, 'bundle + static media + public + export');
  }
};

main().catch((error) => {
  console.error('Unable to generate bundle size report.');
  console.error(error);
  process.exitCode = 1;
});
