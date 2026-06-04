/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    outputFileTracingExcludes: {
      '*': [
        'clients/**/*',
        'dashboard/**/*',
        'scripts/**/*',
        '.next/cache/**/*',
      ],
    },
  },
}

export default nextConfig
