import path from 'node:path';

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
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@obs/browser-vendor': path.resolve(process.cwd(), 'lib/observability/vendors'),
    };
    return config;
  },
};

export default nextConfig;
