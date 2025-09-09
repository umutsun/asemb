/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@alice/semantic-bridge-shared'],
  experimental: {
    serverComponentsExternalPackages: ['pg', 'pgvector']
  }
}

module.exports = nextConfig
