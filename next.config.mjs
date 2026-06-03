/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@anthropic-ai/sdk'],
  outputFileTracingIncludes: {
    '/api/clients': ['./main-config.json', './clients/**/*.md'],
    '/api/clients/[name]/skills': ['./clients/**/*.md', './clients/**/*.gaql'],
    '/api/run': ['./main-config.json', './clients/**/*.md', './clients/**/*.gaql'],
    '/[client]': ['./main-config.json', './clients/**/*.md'],
  },
}

export default nextConfig
