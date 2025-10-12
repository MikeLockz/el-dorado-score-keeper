import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

import { fileURLToPath } from 'node:url';

import { resolveSourceMapSettings } from '../../config/source-maps.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..');
const defaultOutputDir = path.join(repoRoot, 'artifacts');
const nextBuildDir = path.join(repoRoot, '.next');
const exportBuildDir = path.join(repoRoot, 'out');

const SOURCE_MAP_EXTENSION = '.map';

class UploadError extends Error {}

const log = (...args: unknown[]) => {
  console.log('[sourcemaps]', ...args);
};

const ensureSourceMapsEnabled = () => {
  const settings = resolveSourceMapSettings();
  if (!settings.shouldEmitSourceMaps) {
    throw new UploadError(
      'Source maps are disabled. Set ENABLE_SOURCE_MAPS=1 for the build before running this script.',
    );
  }
  return settings;
};

const readOptionalEnv = (key: string) => {
  const value = process.env[key];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const readRequiredEnv = (key: string, message: string) => {
  const value = readOptionalEnv(key);
  if (!value) {
    throw new UploadError(message);
  }
  return value;
};

const resolveGitRevision = () => {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
};

const walkFiles = async (root: string, relative = ''): Promise<string[]> => {
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const nested = await walkFiles(absolute, rel);
      results.push(...nested);
    } else if (entry.name.endsWith(SOURCE_MAP_EXTENSION)) {
      results.push(rel.replace(/\\/g, '/'));
    }
  }
  return results;
};

const pickBuildDirectory = async () => {
  const [nextState, outState] = await Promise.all([
    stat(nextBuildDir).catch(() => null),
    stat(exportBuildDir).catch(() => null),
  ]);

  if (nextState && nextState.isDirectory()) {
    return { baseDir: nextBuildDir, label: '.next' };
  }

  if (outState && outState.isDirectory()) {
    return { baseDir: exportBuildDir, label: 'out' };
  }

  throw new UploadError(
    'Could not find `.next/` or `out/` build directories. Run `pnpm build` first.',
  );
};

const ensureArtifactsDir = async (dir: string) => {
  await mkdir(dir, { recursive: true });
  return dir;
};

const createTarball = (files: string[], baseDir: string, outputPath: string) =>
  new Promise<void>((resolve, reject) => {
    const args = ['-czf', outputPath, '-C', baseDir, ...files];
    const child = spawn('tar', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (error) => {
      reject(
        new UploadError(
          `Failed to spawn tar: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new UploadError(`tar exited with status ${code ?? 'unknown'}`));
      }
    });
  });

const createManifest = async (files: string[], outputPath: string) => {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    files,
    checksum: hash.digest('hex'),
  };
  await writeFile(outputPath, JSON.stringify(payload, null, 2));
};

const resolveUrlOrThrow = (value: string, key: string) => {
  try {
    const url = new URL(value);
    return url;
  } catch {
    throw new UploadError(`${key} must be an absolute URL`);
  }
};

const toPublicAssetPath = (relative: string) => {
  if (!relative.endsWith(SOURCE_MAP_EXTENSION)) {
    return undefined;
  }

  const withoutExtension = relative.slice(0, -SOURCE_MAP_EXTENSION.length);
  if (withoutExtension.startsWith('_next/')) {
    return withoutExtension;
  }
  if (withoutExtension.startsWith('static/')) {
    return `_next/${withoutExtension}`;
  }
  if (withoutExtension.startsWith('server/')) {
    return undefined;
  }
  if (withoutExtension.startsWith('chunks/')) {
    return `_next/${withoutExtension}`;
  }
  return undefined;
};

const createMultipartBody = (
  fields: Array<{ name: string; value: string }>,
  fileField: {
    name: string;
    filename: string;
    contentType: string;
    data: Buffer;
  },
) => {
  const boundary = `----nrBoundary${randomUUID()}`;
  const chunks: Buffer[] = [];

  for (const field of fields) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`,
        'utf8',
      ),
    );
  }

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.contentType}\r\n\r\n`,
      'utf8',
    ),
  );
  chunks.push(fileField.data);
  chunks.push(Buffer.from('\r\n', 'utf8'));
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

  return { boundary, body: Buffer.concat(chunks) };
};

const httpRequest = <T extends boolean | Buffer | string | object = Buffer>(
  host: string,
  pathName: string,
  method: 'GET' | 'POST',
  apiKey: string,
  body?: Buffer,
  contentType?: string,
): Promise<{ statusCode: number; payload: Buffer }> =>
  new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: host,
        path: pathName,
        method,
        headers: {
          ...(contentType ? { 'Content-Type': contentType } : {}),
          ...(body ? { 'Content-Length': body.byteLength } : {}),
          'X-Api-Key': apiKey,
          Accept: 'application/json',
          'User-Agent': 'el-dorado-source-map-uploader/1.0',
        },
      },
      (response) => {
        const resultChunks: Buffer[] = [];
        response.on('data', (chunk) => {
          resultChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on('end', () =>
          resolve({ statusCode: response.statusCode ?? 0, payload: Buffer.concat(resultChunks) }),
        );
      },
    );

    request.on('error', (error) => {
      reject(
        new UploadError(
          `New Relic upload request failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    });

    if (body) {
      request.write(body);
    }
    request.end();
  });

const postMultipart = async (
  host: string,
  pathName: string,
  apiKey: string,
  boundary: string,
  body: Buffer,
) => {
  const { statusCode, payload } = await httpRequest(
    host,
    pathName,
    'POST',
    apiKey,
    body,
    `multipart/form-data; boundary=${boundary}`,
  );

  if (statusCode >= 200 && statusCode < 300) {
    return;
  }

  const message = payload.length > 0 ? payload.toString('utf8') : 'no response body';
  throw new UploadError(`New Relic upload failed (${statusCode || 'unknown'}): ${message}`);
};

type BrowserApplication = {
  id: number;
  name?: string;
  guid?: string;
  browser_monitoring_key?: string;
};

const fetchBrowserApplications = async (
  host: string,
  apiKey: string,
  filters: Record<string, string | undefined>,
): Promise<BrowserApplication[]> => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.append(`filter[${key}]`, value);
    }
  }
  const pathName = `/v2/browser_applications.json${params.size ? `?${params.toString()}` : ''}`;

  const { statusCode, payload } = await httpRequest(host, pathName, 'GET', apiKey);
  if (statusCode >= 200 && statusCode < 300) {
    try {
      const parsed = JSON.parse(payload.toString('utf8')) as {
        browser_applications?: BrowserApplication[];
      };
      return Array.isArray(parsed.browser_applications) ? parsed.browser_applications : [];
    } catch (error) {
      throw new UploadError(
        `Failed to parse New Relic browser application list: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (statusCode === 404) {
    return [];
  }

  const message = payload.length > 0 ? payload.toString('utf8') : 'no response body';
  throw new UploadError(
    `Failed to query New Relic browser applications (${statusCode || 'unknown'}): ${message}`,
  );
};

const resolveBrowserApplicationId = async (
  apiHost: string,
  apiKey: string,
  candidate: string,
): Promise<{ id: string; debug: string }> => {
  if (/^\d+$/.test(candidate.trim())) {
    return { id: candidate.trim(), debug: 'numeric id provided' };
  }

  const attempts: Array<{ label: string; filters: Record<string, string> }> = [
    { label: 'guid', filters: { guid: candidate } },
    { label: 'name', filters: { name: candidate } },
    { label: 'browser_monitoring_key', filters: { browser_monitoring_key: candidate } },
  ];

  for (const attempt of attempts) {
    const matches = await fetchBrowserApplications(apiHost, apiKey, attempt.filters);
    if (matches.length === 1) {
      return { id: String(matches[0]?.id), debug: `${attempt.label} lookup` };
    }
    if (matches.length > 1) {
      throw new UploadError(
        `Multiple browser applications matched ${attempt.label}=${candidate}. Please set NEW_RELIC_BROWSER_APP_ID to a specific numeric id.`,
      );
    }
  }

  throw new UploadError(
    `Unable to resolve browser application id for "${candidate}". Confirm NEW_RELIC_BROWSER_APP_ID is a numeric id or set NEW_RELIC_REGION if your account is in the EU region.`,
  );
};

const uploadToNewRelic = async (
  files: string[],
  baseDir: string,
  releaseChannel: string,
  gitSha: string,
  archivePath: string,
) => {
  const userApiKey = readRequiredEnv(
    'NEW_RELIC_USER_API_KEY',
    'NEW_RELIC_USER_API_KEY is required when SOURCE_MAP_UPLOAD_PROVIDER=newrelic',
  );
  const applicationId =
    readOptionalEnv('NEW_RELIC_BROWSER_APP_ID') ??
    readOptionalEnv('NEXT_PUBLIC_NEW_RELIC_BROWSER_APP_ID');
  if (!applicationId) {
    throw new UploadError(
      'Set NEW_RELIC_BROWSER_APP_ID (or NEXT_PUBLIC_NEW_RELIC_BROWSER_APP_ID) to target a browser application when uploading source maps to New Relic.',
    );
  }

  const baseUrlValue = readRequiredEnv(
    'NEW_RELIC_SOURCE_MAP_BASE_URL',
    'NEW_RELIC_SOURCE_MAP_BASE_URL must point at the public origin + base path where minified assets are served (e.g. https://example.com).',
  );
  const assetBaseUrl = resolveUrlOrThrow(baseUrlValue, 'NEW_RELIC_SOURCE_MAP_BASE_URL');
  if (!assetBaseUrl.pathname.endsWith('/')) {
    assetBaseUrl.pathname = `${assetBaseUrl.pathname}/`;
  }
  const releaseOverride =
    readOptionalEnv('NEW_RELIC_SOURCE_MAP_RELEASE') ?? readOptionalEnv('NEW_RELIC_RELEASE_NAME');
  const releaseName = releaseOverride ?? `${releaseChannel}-${gitSha.slice(0, 12)}`;
  const region = readOptionalEnv('NEW_RELIC_REGION');
  const apiHost =
    region && region.toLowerCase() === 'eu' ? 'api.eu.newrelic.com' : 'api.newrelic.com';
  const { id: resolvedAppId, debug: idSource } = await resolveBrowserApplicationId(
    apiHost,
    userApiKey,
    applicationId,
  );
  const endpointPath = `/v2/browser_applications/${encodeURIComponent(resolvedAppId)}/sourcemaps.json`;

  const candidates = files
    .map((relative) => ({ relative, assetPath: toPublicAssetPath(relative) }))
    .filter((entry): entry is { relative: string; assetPath: string } => Boolean(entry.assetPath));

  if (candidates.length === 0) {
    log('No browser-facing source maps detected; skipping New Relic upload.');
    return;
  }

  log(
    `Uploading ${candidates.length} source maps to New Relic browser app ${resolvedAppId} (${idSource})…`,
  );

  for (const { relative, assetPath } of candidates) {
    const absolutePath = path.join(baseDir, relative);
    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(absolutePath);
    } catch (error) {
      throw new UploadError(
        `Failed to read ${relative} for upload: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const minifiedUrl = new URL(assetPath.replace(/^\//, ''), assetBaseUrl).toString();
    const { boundary, body } = createMultipartBody(
      [
        { name: 'minifiedUrl', value: minifiedUrl },
        { name: 'jsUrl', value: minifiedUrl },
        { name: 'releaseName', value: releaseName },
      ],
      {
        name: 'sourcemap',
        filename: path.basename(relative),
        contentType: 'application/json',
        data: fileBuffer,
      },
    );

    try {
      await postMultipart(apiHost, endpointPath, userApiKey, boundary, body);
      log(`Uploaded ${assetPath}`);
    } catch (error) {
      if (error instanceof UploadError) {
        throw error;
      }
      throw new UploadError(
        `New Relic upload failed for ${assetPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  log('New Relic upload complete. Artifact retained at', archivePath);
};

const uploadToProviders = async (
  archivePath: string,
  files: string[],
  baseDir: string,
  releaseChannel: string,
  gitSha: string,
) => {
  const provider = readOptionalEnv('SOURCE_MAP_UPLOAD_PROVIDER');
  if (!provider) {
    log(
      'No SOURCE_MAP_UPLOAD_PROVIDER configured; skipping upload. Artifact ready at',
      archivePath,
    );
    return;
  }

  switch (provider.toLowerCase()) {
    case 'hyperdx': {
      const apiKey = readOptionalEnv('HYPERDX_API_KEY');
      if (!apiKey) {
        throw new UploadError(
          'HYPERDX_API_KEY is required when SOURCE_MAP_UPLOAD_PROVIDER=hyperdx',
        );
      }
      log('HyperDX upload not yet implemented. Artifact path:', archivePath);
      break;
    }
    case 'newrelic': {
      await uploadToNewRelic(files, baseDir, releaseChannel, gitSha, archivePath);
      break;
    }
    default:
      throw new UploadError(`Unknown SOURCE_MAP_UPLOAD_PROVIDER: ${provider}`);
  }
};

const main = async () => {
  try {
    const settings = ensureSourceMapsEnabled();
    const releaseChannel = settings.deploymentChannel;
    const gitSha = resolveGitRevision();
    const { baseDir, label } = await pickBuildDirectory();

    log(`Scanning ${label} for source maps…`);
    const files = (await walkFiles(baseDir)).sort();
    if (files.length === 0) {
      throw new UploadError(
        'No source map files were found. Ensure the build ran with ENABLE_SOURCE_MAPS=1.',
      );
    }

    const artifactsDir = await ensureArtifactsDir(defaultOutputDir);
    const archiveName = `source-maps-${releaseChannel}-${gitSha.slice(0, 12)}.tar.gz`;
    const manifestName = `${archiveName.replace(/\.tar\.gz$/, '')}.json`;
    const archivePath = path.join(artifactsDir, archiveName);
    const manifestPath = path.join(artifactsDir, manifestName);

    log(`Packaging ${files.length} files into ${archiveName}…`);
    await createTarball(files, baseDir, archivePath);
    await createManifest(files, manifestPath);

    log('Archive created at', archivePath);
    log('Manifest written to', manifestPath);

    await uploadToProviders(archivePath, files, baseDir, releaseChannel, gitSha);
    log('Done');
  } catch (error) {
    if (error instanceof UploadError) {
      console.error('[sourcemaps] error:', error.message);
      process.exitCode = 1;
      return;
    }
    console.error('[sourcemaps] unexpected error:', error);
    process.exitCode = 1;
  }
};

void main();
