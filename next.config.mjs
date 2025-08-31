/** @type {import('next').NextConfig} */
const isGithubActions = process.env.GITHUB_ACTIONS === 'true'

// Derive basePath/assetPrefix for project pages (not user/org sites)
let basePath = ''
let assetPrefix
if (isGithubActions) {
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
  // If deploying to <user>.github.io, keep basePath empty
  if (repo && !repo.endsWith('.github.io')) {
    basePath = `/${repo}`
    assetPrefix = `/${repo}/`
  }
}

const nextConfig = {
  // Generate a fully static export for GitHub Pages
  output: 'export',
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
  ...(assetPrefix ? { assetPrefix } : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
