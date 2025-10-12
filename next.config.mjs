import path from 'node:path';

import { resolveSourceMapSettings } from './config/source-maps.mjs';

/** @type {import('next').NextConfig} */
const isGithubActions = process.env.GITHUB_ACTIONS === 'true';

// Derive basePath/assetPrefix for project pages (not user/org sites)
// Priority:
// 1) Explicit env: BASE_PATH or NEXT_PUBLIC_BASE_PATH (useful for local export + CI)
// 2) Auto-detect in GitHub Actions from GITHUB_REPOSITORY
let basePath = '';
let assetPrefix;

const envBase = process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH;
if (envBase && typeof envBase === 'string') {
  const normalized = envBase.startsWith('/') ? envBase : `/${envBase}`;
  // Remove trailing slash for Next basePath, keep it for assetPrefix
  basePath = normalized.replace(/\/+$/, '');
  assetPrefix = `${basePath}/`;
} else if (isGithubActions) {
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? '';
  // If deploying to <user>.github.io, keep basePath empty
  if (repo && !repo.endsWith('.github.io')) {
    basePath = `/${repo}`;
    assetPrefix = `/${repo}/`;
  }
}

const isStaticExport = process.env.NEXT_OUTPUT_EXPORT === 'true' || isGithubActions;

const { shouldEmitSourceMaps: enableSourceMaps } = resolveSourceMapSettings();

const enableStyleSourceMaps = (rules, options) => {
  if (!Array.isArray(rules)) {
    return;
  }

  for (const rule of rules) {
    if (!rule) continue;

    if (Array.isArray(rule.oneOf)) {
      enableStyleSourceMaps(rule.oneOf, options);
    }

    const uses = Array.isArray(rule.use) ? rule.use : [];
    for (const use of uses) {
      if (!use || typeof use !== 'object') {
        continue;
      }

      const loader = typeof use.loader === 'string' ? use.loader : '';
      if (loader.includes('postcss-loader')) {
        const existingOptions =
          typeof use.options === 'object' && use.options !== null ? use.options : {};
        const postcssOptions =
          typeof existingOptions.postcssOptions === 'object' &&
          existingOptions.postcssOptions !== null
            ? existingOptions.postcssOptions
            : {};

        use.options = {
          ...existingOptions,
          sourceMap: true,
          postcssOptions: {
            ...postcssOptions,
            map: options.mapSetting,
          },
        };
        continue;
      }

      if (loader.includes('css-loader') || loader.includes('sass-loader')) {
        use.options = {
          ...(use.options || {}),
          sourceMap: true,
        };
      }
    }
  }
};

const nextConfig = {
  ...(isStaticExport
    ? {
        // Generate a fully static export for GitHub Pages and explicit export builds
        output: 'export',
        trailingSlash: true,
      }
    : {}),
  // Transpile certain ESM packages for wider browser compatibility (e.g., Safari 12/13)
  // Narrowed to minimum set observed in error stack
  transpilePackages: [
    '@radix-ui/react-menu',
    '@radix-ui/react-id',
    '@radix-ui/react-use-layout-effect',
  ],
  productionBrowserSourceMaps: enableSourceMaps,
  ...(basePath ? { basePath } : {}),
  ...(assetPrefix ? { assetPrefix } : {}),
  // Allow dev assets to be requested from 127.0.0.1 (used by Playwright tests)
  allowedDevOrigins: ['127.0.0.1'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? 'true' : 'false',
  },
  webpack: (config, { dev, isServer, webpack }) => {
    const mapSetting = enableSourceMaps ? { inline: false, annotation: false } : false;

    if (enableSourceMaps && config.module?.rules) {
      enableStyleSourceMaps(config.module.rules, { mapSetting });
    }

    if (!dev && enableSourceMaps) {
      config.devtool = isServer ? 'source-map' : 'hidden-source-map';
    }

    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@obs/browser-vendor': path.resolve(process.cwd(), 'lib/observability/vendors'),
    };

    if (isServer) {
      config.output = config.output || {};

      // Ensure server chunks land in the same directory Next copies them to (.next/server/chunks)
      // so that the generated webpack runtime resolves them correctly.
      if (!config.output.chunkFilename || !config.output.chunkFilename.includes('chunks/')) {
        config.output.chunkFilename = 'chunks/[id].js';
      }

      class MirrorServerChunksPlugin {
        apply(compiler) {
          compiler.hooks.thisCompilation.tap('MirrorServerChunksPlugin', (compilation) => {
            const { RawSource } = compiler.webpack.sources;
            compilation.hooks.processAssets.tap(
              {
                name: 'MirrorServerChunksPlugin',
                stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
              },
              () => {
                for (const asset of compilation.getAssets()) {
                  if (!asset.name.startsWith('chunks/')) {
                    continue;
                  }
                  if (asset.name.includes('hot-update')) {
                    continue;
                  }
                  const bareName = asset.name.slice('chunks/'.length);
                  if (!bareName) {
                    continue;
                  }
                  if (compilation.getAsset(bareName)) {
                    continue;
                  }

                  let sourceValue;
                  try {
                    sourceValue = asset.source.source();
                  } catch {
                    sourceValue = asset.source.buffer?.();
                  }

                  const duplicateSource =
                    typeof sourceValue === 'string' || Buffer.isBuffer(sourceValue)
                      ? new RawSource(sourceValue)
                      : asset.source;

                  compilation.emitAsset(bareName, duplicateSource, asset.info);
                }
              },
            );
          });
        }
      }

      config.plugins = config.plugins || [];
      config.plugins.push(new MirrorServerChunksPlugin());
    }

    return config;
  },
};

export default nextConfig;
